import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { pushupMeasurementSchema, bulkPushupMeasurementSchema, predictionRequestSchema, mealAnalysisRequestSchema, loginSchema, signupSchema, validateMovementIntegrity, calculatePhysicsFallback, createTerritorySchema, updateProfileSchema } from '@my-app/shared';
import type { D1Database } from '@cloudflare/workers-types';
import { AIService } from './services/aiService';
import { IntegrityService } from './services/integrityService';
import { firebaseAuth, verifyUserOwnership } from './middleware/auth';

type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY: string;
};

type Variables = {
  firebaseUser: {
    sub: string;
    email?: string;
    [key: string]: any;
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .basePath('/api')
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message || 'Internal Server Error' }, 500);
  });

// バリデーションエラーを文字列で返すための共通設定
const validate = (schema: any) => zValidator('json', schema, (result, c) => {
  if (!result.success) {
    console.log('Validation failed. Input:', result.data); // デバッグ用
    const messages = result.error.issues.map(i => {
      if (i.code === 'invalid_type' && (i as any).received === 'undefined') return '入力が不足しています';
      return i.message;
    });
    return c.json({ error: messages.join(', ') }, 400);
  }
});

// CORS を有効化
app.use('*', cors({
  origin: '*', // 開発環境のため全許可 (本番では制限推奨)
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

const routes = app
  .post(
    '/auth/signup',
    validate(signupSchema),
    async (c) => {
      const { loginId, password, name } = c.req.valid('json');
      const db = c.env.DB;
      
      const id = crypto.randomUUID();
      try {
        await db.prepare('INSERT INTO users (id, login_id, password_hash, name) VALUES (?, ?, ?, ?)')
          .bind(id, loginId, password, name) // 本来はハッシュ化が必要
          .run();
        return c.json({ success: true, userId: id });
      } catch (e: any) {
        console.error('Signup error details:', e);
        // エラーの全容をフロントエンドに返す（開発環境用の詳細なエラーハンドリング）
        return c.json({ 
          error: `登録処理中にデータベースエラーが発生しました。`,
          details: e.message,
          cause: e.cause ? String(e.cause) : undefined,
          hint: e.message.includes('no such table') ? 'データベースのテーブルが作成されていません。マイグレーションを実行してください。' : 'IDが既に使用されているか、入力データが不正です。'
        }, 400);
      }
    }
  )
  .post(
    '/auth/login',
    validate(loginSchema),
    async (c) => {
      const { loginId, password } = c.req.valid('json');
      const db = c.env.DB;
      
      let user;
      try {
        user = await db.prepare('SELECT * FROM users WHERE login_id = ? AND password_hash = ?')
          .bind(loginId, password)
          .first<{ id: string, name: string, avatar_id: string }>();
      } catch (e: any) {
        console.error('Login database error:', e);
        return c.json({ 
          error: 'ログイン処理中にデータベースエラーが発生しました。',
          details: e.message,
          hint: e.message.includes('no such table') ? 'データベースのテーブルが作成されていません。マイグレーションを実行してください。' : undefined
        }, 500);
      }
        
      if (!user) {
        return c.json({ error: 'IDまたはパスワードが正しくありません。' }, 401);
      }
      
      return c.json({ success: true, userId: user.id, name: user.name, avatar_id: user.avatar_id || 'default' });
    }
  )
  .post(
    '/pushups',
    firebaseAuth,
    validate(pushupMeasurementSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('firebaseUser');

      try {
        // JWT の UID とリクエストボディの user_id が一致するか強制チェック
        verifyUserOwnership(data.user_id, user.sub);
      } catch (e) {
        return c.json({ error: (e as Error).message }, 403);
      }
      
      // 1. Replay Attack 対策: Nonce の重複チェック
      const usedNonce = await c.env.DB.prepare('SELECT nonce FROM used_nonces WHERE nonce = ?')
        .bind(data.nonce)
        .first();
      
      if (usedNonce) {
        return c.json({ error: 'このデータは既に送信済みです（Replay Attack 検知）。' }, 400);
      }

      // 2. 端末の真正性検証 (Play Integrity)
      const integrityService = new IntegrityService();
      const integrityResult = await integrityService.verifyDeviceIntegrity(data.integrity_token);
      
      if (!integrityResult.isHealthy) {
        return c.json({ error: integrityResult.reason }, 403);
      }

      // 3. 物理的整合性チェック (Anti-Cheat)
      const validation = validateMovementIntegrity(
        data.sensor_log,
        data.distance || 0,
        data.steps || 0
      );

      if (!validation.isValid) {
        return c.json({ error: validation.reason }, 400);
      }

      // 3. Nonce を使用済みとして記録
      await c.env.DB.prepare('INSERT INTO used_nonces (nonce) VALUES (?)').bind(data.nonce).run();

      // 4. データの保存
      const { success } = await c.env.DB.prepare(
        'INSERT INTO pushup_measurements (user_id, exercise_type, count, timestamp, sensor_log) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(data.user_id, data.exercise_type, data.count, data.timestamp, JSON.stringify(data.sensor_log))
        .run();

      if (success) {
        return c.json({ message: 'プッシュアップの記録を保存しました。' }, 201);
      } else {
        return c.json({ error: '保存に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/pushups/bulk',
    firebaseAuth,
    validate(bulkPushupMeasurementSchema),
    async (c) => {
      const measurements = c.req.valid('json');
      const user = c.get('firebaseUser');
      const results = { processed: 0, skipped: 0, failed: 0 };
      const statements = [];

      for (const data of measurements) {
        // 全件に対し UID 一致を確認
        if (data.user_id !== user.sub) {
          results.failed++;
          continue;
        }
        // 1. 端末の真正性検証 (Play Integrity)
        const integrityService = new IntegrityService();
        const integrityResult = await integrityService.verifyDeviceIntegrity(data.integrity_token);
        if (!integrityResult.isHealthy) {
          results.failed++;
          continue;
        }

        // 2. Nonce による重複チェック (冪等性の確保)
        const usedNonce = await c.env.DB.prepare('SELECT nonce FROM used_nonces WHERE nonce = ?')
          .bind(data.nonce)
          .first();

        if (usedNonce) {
          results.skipped++;
          continue;
        }

        // 2. 個別データの物理的整合性バリデーション
        const validation = validateMovementIntegrity(
          data.sensor_log,
          data.distance || 0,
          data.steps || 0
        );

        if (!validation.isValid) {
          results.failed++;
          continue;
        }

        // 3. Batch 実行用ステートメントの蓄積
        statements.push(c.env.DB.prepare('INSERT INTO used_nonces (nonce) VALUES (?)').bind(data.nonce));
        statements.push(
          c.env.DB.prepare(
            'INSERT INTO pushup_measurements (user_id, exercise_type, count, timestamp, sensor_log) VALUES (?, ?, ?, ?, ?)'
          ).bind(data.user_id, data.exercise_type, data.count, data.timestamp, JSON.stringify(data.sensor_log))
        );
        results.processed++;
      }

      if (statements.length > 0) {
        await c.env.DB.batch(statements);
      }

      return c.json({
        message: '一括送信処理が完了しました。',
        details: results
      });
    }
  )
  .post(
    '/predict',
    validate(predictionRequestSchema),
    async (c) => {
      const data = c.req.valid('json');
      const aiService = new AIService(c.env.GEMINI_API_KEY);
      try {
        const prediction = await aiService.predictWeightGoal(data);
        return c.json({ ...prediction, source: 'ai' });
      } catch (error) {
        console.error('AI Prediction failed, using fallback:', error);
        const fallback = calculatePhysicsFallback(data);
        return c.json(fallback);
      }
    }
  )
  .post(
    '/territories',
    firebaseAuth,
    validate(createTerritorySchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const id = crypto.randomUUID();
      try {
        // 奪い合いロジック：新領域の重心が旧領域に含まれるか、または旧領域の重心が新領域に含まれる場合、古い他人の領域を削除（上書き）
        let newPolygon: [number, number][] = [];
        try {
          newPolygon = JSON.parse(data.area_polygon);
        } catch (pe) {
          console.error('Failed to parse new polygon:', pe);
        }

        if (Array.isArray(newPolygon) && newPolygon.length >= 3) {
          const newCentroid = getPolygonCentroid(newPolygon);
          // 自分以外の他人の領域をすべて取得
          const otherTerritories = await db.prepare('SELECT id, user_id, area_polygon FROM territories WHERE user_id != ?')
            .bind(user.sub)
            .all<{ id: string, user_id: string, area_polygon: string }>();

          const deleteIds: string[] = [];

          for (const oldT of otherTerritories.results) {
            try {
              const oldPolygon: [number, number][] = JSON.parse(oldT.area_polygon);
              if (!Array.isArray(oldPolygon) || oldPolygon.length < 3) continue;

              const oldCentroid = getPolygonCentroid(oldPolygon);

              const isOldCentroidInNew = isPointInPolygon(oldCentroid, newPolygon);
              const isNewCentroidInOld = isPointInPolygon(newCentroid, oldPolygon);

              if (isOldCentroidInNew || isNewCentroidInOld) {
                deleteIds.push(oldT.id);
              }
            } catch (pe) {
              console.error('Failed to parse old polygon coords:', pe);
            }
          }

          if (deleteIds.length > 0) {
            console.log(`Overwriting ${deleteIds.length} territories:`, deleteIds);
            const placeholders = deleteIds.map(() => '?').join(',');
            await db.prepare(`DELETE FROM territories WHERE id IN (${placeholders})`)
              .bind(...deleteIds)
              .run();
          }
        }

        await db.prepare('INSERT INTO territories (id, user_id, latitude, longitude, area_polygon, area_sqm, time_period) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(id, user.sub, data.latitude, data.longitude, data.area_polygon, data.area_sqm, data.time_period)
          .run();
        return c.json({ success: true, message: '領域を保存しました' });
      } catch (e: any) {
        console.error('Territory save error:', e);
        return c.json({ error: '領域の保存に失敗しました' }, 500);
      }
    }
  )
  .get(
    '/territories',
    async (c) => {
      const db = c.env.DB;
      try {
        const territories = await db.prepare(`
          SELECT 
            t.id,
            t.user_id,
            u.name as user_name,
            t.latitude,
            t.longitude,
            t.area_polygon,
            t.area_sqm,
            t.time_period,
            t.fortification_level,
            t.captured_at
          FROM territories t
          JOIN users u ON t.user_id = u.id
        `).all();
        return c.json({ territories: territories.results });
      } catch (e: any) {
        console.error('Fetch territories error:', e);
        return c.json({ error: '領域データの取得に失敗しました' }, 500);
      }
    }
  )
  .put(
    '/users/me',
    firebaseAuth,
    validate(updateProfileSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        await db.prepare('UPDATE users SET name = ?, avatar_id = ? WHERE id = ?')
          .bind(data.name, data.avatar_id, user.sub)
          .run();
        return c.json({ success: true, message: 'プロフィールを更新しました', name: data.name, avatar_id: data.avatar_id });
      } catch (e: any) {
        console.error('Profile update error:', e);
        return c.json({ error: 'プロフィールの更新に失敗しました' }, 500);
      }
    }
  )
  .get(
    '/ranking',
    zValidator('query', z.object({ 
      period: z.enum(['morning', 'afternoon', 'night', 'all']).optional().default('all'),
      duration: z.enum(['daily', 'weekly', 'yearly', 'all']).optional().default('all')
    })),
    async (c) => {
      const db = c.env.DB;
      const { period, duration } = c.req.valid('query');
      
      let conditions = [];
      if (period !== 'all') {
        conditions.push(`t.time_period = '${period}'`);
      }
      
      if (duration === 'daily') {
        conditions.push("date(t.captured_at) = date('now')");
      } else if (duration === 'weekly') {
        conditions.push("t.captured_at >= datetime('now', '-7 days')");
      } else if (duration === 'yearly') {
        conditions.push("strftime('%Y', t.captured_at) = strftime('%Y', 'now')");
      }
      
      const joinConditions = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
      
      const ranking = await db.prepare(`
        SELECT 
          u.name,
          u.avatar_id,
          COALESCE(SUM(t.area_sqm), 0) as total_area_sqm,
          COUNT(DISTINCT t.id) as territories_count
        FROM users u
        LEFT JOIN territories t ON u.id = t.user_id ${joinConditions}
        GROUP BY u.id
        ORDER BY total_area_sqm DESC
        LIMIT 10
      `).all<{ name: string, avatar_id: string, total_area_sqm: number, territories_count: number }>();
      
      const formattedRanking = ranking.results.map((row, i) => ({
        rank: i + 1,
        name: row.name,
        avatar_id: row.avatar_id || 'default',
        territories: row.territories_count,
        points: Math.floor(row.total_area_sqm)
      }));

      return c.json({
        ranking: formattedRanking.length > 0 ? formattedRanking : [
          { rank: 1, name: 'NO DATA', avatar_id: 'default', territories: 0, points: 0 }
        ]
      });
    }
  )
  .get(
    '/exercises/me',
    firebaseAuth,
    zValidator('query', z.object({ period: z.enum(['daily', 'weekly', 'all']).optional().default('all') })),
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      const { period } = c.req.valid('query');
      
      let dateFilter = '';
      if (period === 'daily') {
        dateFilter = "AND date(timestamp) = date('now')";
      } else if (period === 'weekly') {
        dateFilter = "AND timestamp >= datetime('now', '-7 days')";
      }

      const stats = await db.prepare(`
        SELECT 
          exercise_type,
          SUM(count) as total_count
        FROM pushup_measurements
        WHERE user_id = ? ${dateFilter}
        GROUP BY exercise_type
        ORDER BY total_count DESC
      `).bind(user.sub).all<{ exercise_type: string, total_count: number }>();

      // キャッシュ（exercise_metadata）から1回あたりのカロリーを取得
      const exerciseTypes = stats.results.map(s => s.exercise_type);
      if (exerciseTypes.length === 0) return c.json({ stats: [] });

      const cachedMetadata = await db.prepare(`
        SELECT exercise_type, unit_calories FROM exercise_metadata
        WHERE exercise_type IN (${exerciseTypes.map(() => '?').join(',')})
      `).bind(...exerciseTypes).all<{ exercise_type: string, unit_calories: number }>();

      const missingTypes = exerciseTypes.filter(type => !cachedMetadata.results.find(m => m.exercise_type === type));

      let finalMetadata = [...cachedMetadata.results];

      // 足りない分だけAIに問い合わせ
      if (missingTypes.length > 0) {
        const aiService = new AIService(c.env.GEMINI_API_KEY);
        try {
          const aiResults = await aiService.calculateExerciseCalories(missingTypes.map(t => ({ exercise_type: t, total_count: 1 })));
          
          // キャッシュに保存
          for (const res of aiResults) {
            if (res.unit_calories > 0) {
              await db.prepare(`
                INSERT OR REPLACE INTO exercise_metadata (exercise_type, unit_calories)
                VALUES (?, ?)
              `).bind(res.exercise_type, res.unit_calories).run();
              finalMetadata.push(res);
            }
          }
        } catch (e) {
          console.error('AI Calculation Failed, using 0 as fallback', e);
        }
      }
      
      const enrichedStats = stats.results.map(stat => {
        const meta = finalMetadata.find(m => m.exercise_type === stat.exercise_type);
        const unitCal = meta?.unit_calories || 0;
        return {
          ...stat,
          estimated_calories: Math.round(unitCal * stat.total_count * 10) / 10 // 小数点第1位まで
        };
      });
      
      return c.json({ stats: enrichedStats });
    }
  )
  .delete(
    '/exercises/type/:type',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      const type = c.req.param('type');

      await db.prepare(`
        DELETE FROM pushup_measurements
        WHERE user_id = ? AND exercise_type = ?
      `).bind(user.sub, type).run();

      return c.json({ message: `${type} の記録をすべて削除しました` });
    }
  )
  .post(
    '/meals/analyze',
    validate(mealAnalysisRequestSchema),
    async (c) => {
      const { image } = c.req.valid('json');
      const aiService = new AIService(c.env.GEMINI_API_KEY);
      try {
        const analysis = await aiService.analyzeMealImage(image);
        return c.json(analysis);
      } catch (error) {
        return c.json({ error: '食事の解析に失敗しました。' }, 500);
      }
    }
  );

// ポリゴンの重心（平均値）を計算するヘルパー
function getPolygonCentroid(pts: [number, number][]): [number, number] {
  let latSum = 0;
  let lngSum = 0;
  for (const [lat, lng] of pts) {
    latSum += lat;
    lngSum += lng;
  }
  return [latSum / pts.length, lngSum / pts.length];
}

// 点がポリゴンの内側にあるかを判定するヘルパー（Ray Casting アルゴリズム）
function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export type AppType = typeof routes;
export default app;
