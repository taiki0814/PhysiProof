import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { pushupMeasurementSchema, bulkPushupMeasurementSchema, predictionRequestSchema, mealAnalysisRequestSchema, loginSchema, signupSchema, validateMovementIntegrity, calculatePhysicsFallback, createTerritorySchema, updateProfileSchema, achievementSchema, mealRecordSchema, chatRequestSchema, chatMessageSchema, claimMissionRewardRequestSchema } from '@my-app/shared';
import type { D1Database } from '@cloudflare/workers-types';
import { AIService } from './services/aiService';
import { IntegrityService } from './services/integrityService';
import { performTerritoryMerge } from './services/territoryMerge';
import { firebaseAuth, verifyUserOwnership } from './middleware/auth';
import { difference } from '@turf/difference';
import { union } from '@turf/union';
import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';

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
        user = await db.prepare('SELECT id, name, avatar_id, avatar_image, login_id, role, current_weight, target_weight FROM users WHERE login_id = ? AND password_hash = ?')
          .bind(loginId, password)
          .first<{ id: string, name: string, avatar_id: string, avatar_image: string | null, login_id: string, role: string, current_weight: number | null, target_weight: number | null }>();
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
      
      return c.json({ 
        success: true, 
        userId: user.id, 
        name: user.name, 
        avatar_id: user.avatar_id || 'default',
        avatar_image: user.avatar_image || null,
        login_id: user.login_id,
        role: user.role || 'user',
        current_weight: user.current_weight,
        target_weight: user.target_weight
      });
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
        await checkAndUnlockCalorieBurst(c.env.DB, data.user_id);
        await updateDailyMissionProgress(c.env.DB, data.user_id, 'exercise', data.count);
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
      let totalCount = 0;

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
        totalCount += data.count;
      }

      if (statements.length > 0) {
        await c.env.DB.batch(statements);
        await checkAndUnlockCalorieBurst(c.env.DB, user.sub);
        await updateDailyMissionProgress(c.env.DB, user.sub, 'exercise', totalCount);
      }

      return c.json({
        message: '一括送信処理が完了しました。',
        details: results
      });
    }
  )
  .post(
    '/predict',
    firebaseAuth,
    validate(predictionRequestSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const aiService = new AIService(c.env.GEMINI_API_KEY);
      
      let prediction: any;
      try {
        const aiPred = await aiService.predictWeightGoal(data);
        prediction = { ...aiPred, source: 'ai' };
      } catch (error) {
        console.error('AI Prediction failed, using fallback:', error);
        prediction = calculatePhysicsFallback(data);
      }

      try {
        const id = crypto.randomUUID();
        await db.prepare(`
          INSERT INTO weight_predictions (id, user_id, current_weight, target_weight, total_calories_burned, meal_calories_consumed, days_to_target, advice, daily_calorie_deficit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
          .bind(
            id,
            user.sub,
            data.currentWeight,
            data.targetWeight,
            data.totalCaloriesBurned,
            data.mealCaloriesConsumed,
            prediction.daysToTarget,
            prediction.advice,
            prediction.dailyCalorieDeficit
          )
          .run();
      } catch (dbErr) {
        console.error('Failed to save weight prediction history:', dbErr);
      }

      return c.json(prediction);
    }
  )
  .get(
    '/predictions/history',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      try {
        const list = await db.prepare('SELECT id, current_weight, target_weight, total_calories_burned, meal_calories_consumed, days_to_target, advice, daily_calorie_deficit, created_at FROM weight_predictions WHERE user_id = ? ORDER BY created_at DESC')
          .bind(user.sub)
          .all();
        return c.json({ predictions: list.results });
      } catch (e) {
        console.error('Failed to get prediction history:', e);
        return c.json({ error: '予測履歴の取得に失敗しました。' }, 500);
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

      const distance = data.distance_m || 0;
      const duration = data.duration_sec || 0;
      const avgSpeed = data.avg_speed_kmh || (duration > 0 ? (distance / 1000) / (duration / 3600) : 0);

      if (avgSpeed > 20) {
        return c.json({ error: '移動速度が速すぎます（平均速度が20km/hを超えています）。自転車や乗り物での移動は無効です。' }, 400);
      }

      try {
        // 交差削り取りロジック:
        // 新領域と他ユーザーの領域が重なる場合、重なった部分を他ユーザーの領域から「削り取り」
        // 残った部分を更新（面積が極小なら削除）
        let newCoords: [number, number][] = [];
        try {
          newCoords = JSON.parse(data.area_polygon);
        } catch (pe) {
          console.error('Failed to parse new polygon:', pe);
        }

        if (Array.isArray(newCoords) && newCoords.length >= 3) {
          // [lat, lng] → [lng, lat] (GeoJSON 形式) に変換し、閉じたリングにする
          const newRing = newCoords.map(([lat, lng]) => [lng, lat] as [number, number]);
          const first = newRing[0];
          const last = newRing[newRing.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            newRing.push(first);
          }

          let newTurfPoly;
          try {
            newTurfPoly = turfPolygon([newRing]);
          } catch (pe) {
            console.error('Failed to create Turf polygon from new territory:', pe);
          }

          if (newTurfPoly) {
            // 自分以外の他人の領域をすべて取得
            const otherTerritories = await db.prepare('SELECT id, user_id, area_polygon, area_sqm FROM territories WHERE user_id != ?')
              .bind(user.sub)
              .all<{ id: string, user_id: string, area_polygon: string, area_sqm: number }>();

            const deleteIds: string[] = [];
            const updateStatements: any[] = [];

            for (const oldT of otherTerritories.results) {
              try {
                const oldCoords: [number, number][] = JSON.parse(oldT.area_polygon);
                if (!Array.isArray(oldCoords) || oldCoords.length < 3) continue;

                // [lat, lng] → [lng, lat] (GeoJSON 形式) に変換し、閉じたリングにする
                const oldRing = oldCoords.map(([lat, lng]) => [lng, lat] as [number, number]);
                const oFirst = oldRing[0];
                const oLast = oldRing[oldRing.length - 1];
                if (oFirst[0] !== oLast[0] || oFirst[1] !== oLast[1]) {
                  oldRing.push(oFirst);
                }

                let oldTurfPoly;
                try {
                  oldTurfPoly = turfPolygon([oldRing]);
                } catch {
                  continue; // 不正なポリゴンはスキップ
                }

                // Turf.js difference: 旧ポリゴン - 新ポリゴン = 残り部分
                const diff = difference(featureCollection([oldTurfPoly, newTurfPoly]));

                if (!diff) {
                  // diff が null → 旧ポリゴンが完全に新ポリゴンに包含されている → 削除
                  deleteIds.push(oldT.id);
                  continue;
                }

                // 差分結果の面積を計算
                const remainingAreaSqm = turfArea(diff);
                if (remainingAreaSqm < 1) {
                  // 残り面積が 1㎡未満 → 実質削除
                  deleteIds.push(oldT.id);
                  continue;
                }

                // 差分の座標を取得（Polygon または MultiPolygon）
                let remainingCoords: [number, number][];
                if (diff.geometry.type === 'MultiPolygon') {
                  // MultiPolygon の場合、最大面積のパーツを選択（簡易版）
                  const parts = diff.geometry.coordinates;
                  let maxArea = 0;
                  let maxPartIndex = 0;
                  for (let pi = 0; pi < parts.length; pi++) {
                    try {
                      const partPoly = turfPolygon(parts[pi] as [number, number][][]);
                      const partArea = turfArea(partPoly);
                      if (partArea > maxArea) {
                        maxArea = partArea;
                        maxPartIndex = pi;
                      }
                    } catch {
                      // skip invalid part
                    }
                  }
                  // [lng, lat] → [lat, lng] に戻す
                  remainingCoords = parts[maxPartIndex][0]
                    .slice(0, -1) // 閉じリングの最後の重複点を除去
                    .map(([lng, lat]) => [lat, lng] as [number, number]);
                } else {
                  // Polygon
                  remainingCoords = diff.geometry.coordinates[0]
                    .slice(0, -1) // 閉じリングの最後の重複点を除去
                    .map(([lng, lat]) => [lat, lng] as [number, number]);
                }

                if (remainingCoords.length < 3) {
                  deleteIds.push(oldT.id);
                  continue;
                }

                // 旧領域を残りポリゴンで更新
                updateStatements.push(
                  db.prepare('UPDATE territories SET area_polygon = ?, area_sqm = ? WHERE id = ?')
                    .bind(JSON.stringify(remainingCoords), remainingAreaSqm, oldT.id)
                );
              } catch (pe) {
                console.error('Failed to process old polygon:', pe);
              }
            }

            if (deleteIds.length > 0) {
              console.log(`Deleting ${deleteIds.length} fully-overwritten territories:`, deleteIds);
              const placeholders = deleteIds.map(() => '?').join(',');
              await db.prepare(`DELETE FROM territories WHERE id IN (${placeholders})`)
                .bind(...deleteIds)
                .run();
            }

            if (updateStatements.length > 0) {
              console.log(`Carving out ${updateStatements.length} territories`);
              await db.batch(updateStatements);
            }

            if (deleteIds.length > 0 || updateStatements.length > 0) {
              await unlockAchievement(db, user.sub, 'conqueror');
            }
          }
        }

        // ── 自分の既存領域とのマージロジック ──
        // 新領域が自分の既存領域と重なる場合、@turf/union で統合する
        const existingTerritoriesCount = await db.prepare('SELECT COUNT(*) as cnt FROM territories WHERE user_id = ?')
          .bind(user.sub)
          .first<{ cnt: number }>();

        // 自分の全既存領域を取得
        const myTerritories = await db.prepare('SELECT id, area_polygon, area_sqm, fortification_level, latitude, longitude, time_period FROM territories WHERE user_id = ?')
          .bind(user.sub)
          .all<{ id: string, area_polygon: string, area_sqm: number, fortification_level: number, latitude: number, longitude: number, time_period: string }>();

        // 重なっている自分の領域を再帰的にマージ
        const groups = performTerritoryMerge(data, myTerritories.results);

        // DB 書き込みクエリの分類
        const deleteIds: string[] = [];
        const updateStatements: any[] = [];
        const insertStatements: any[] = [];
        let newOrUpdatedId: string | null = null;
        let isMerged = false;

        for (const g of groups) {
          const finalAreaPolygon = (() => {
            const mergedCoords = (g.poly.geometry.coordinates[0] as [number, number][])
              .slice(0, -1) // 閉じリングの最後の重複点を除去
              .map(([lng, lat]) => [lat, lng] as [number, number]);
            return JSON.stringify(mergedCoords);
          })();
          const finalAreaSqm = turfArea(g.poly);

          if (g.hasNew) {
            if (g.originalIds.length === 0) {
              // 新しい独立した領域として保存する
              const newId = crypto.randomUUID();
              newOrUpdatedId = newId;
              insertStatements.push(
                db.prepare('INSERT INTO territories (id, user_id, latitude, longitude, area_polygon, area_sqm, time_period, fortification_level, distance_m, duration_sec, avg_speed_kmh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                  .bind(newId, user.sub, g.latitude, g.longitude, finalAreaPolygon, finalAreaSqm, g.time_period, g.fortification_level, distance, duration, avgSpeed)
              );
            } else {
              // 既存の領域のいずれかにマージされた
              const targetId = g.originalIds[0];
              newOrUpdatedId = targetId;
              isMerged = true;
              updateStatements.push(
                db.prepare('UPDATE territories SET latitude = ?, longitude = ?, area_polygon = ?, area_sqm = ?, time_period = ?, fortification_level = ?, distance_m = distance_m + ?, duration_sec = duration_sec + ?, avg_speed_kmh = ? WHERE id = ?')
                  .bind(g.latitude, g.longitude, finalAreaPolygon, finalAreaSqm, g.time_period, g.fortification_level, distance, duration, avgSpeed, targetId)
              );
              deleteIds.push(...g.originalIds.slice(1));
            }
          } else {
            // 既存領域同士がマージされたケース
            if (g.originalIds.length > 1) {
              const targetId = g.originalIds[0];
              updateStatements.push(
                db.prepare('UPDATE territories SET latitude = ?, longitude = ?, area_polygon = ?, area_sqm = ?, time_period = ?, fortification_level = ?, distance_m = distance_m + ?, duration_sec = duration_sec + ?, avg_speed_kmh = ? WHERE id = ?')
                  .bind(g.latitude, g.longitude, finalAreaPolygon, finalAreaSqm, g.time_period, g.fortification_level, distance, duration, avgSpeed, targetId)
              );
              deleteIds.push(...g.originalIds.slice(1));
            }
          }
        }

        // DB への書き込み実行
        const batchStatements: any[] = [];
        if (deleteIds.length > 0) {
          const placeholders = deleteIds.map(() => '?').join(',');
          batchStatements.push(
            db.prepare(`DELETE FROM territories WHERE id IN (${placeholders})`).bind(...deleteIds)
          );
        }
        batchStatements.push(...updateStatements);
        batchStatements.push(...insertStatements);

        if (batchStatements.length > 0) {
          await db.batch(batchStatements);
        }

        if (!existingTerritoriesCount || existingTerritoriesCount.cnt === 0) {
          await unlockAchievement(db, user.sub, 'first_close');
        }

        const totalMerged = deleteIds.length + (isMerged ? 1 : 0);
        const finalId = newOrUpdatedId || crypto.randomUUID();

        return c.json({ 
          success: true, 
          message: totalMerged > 0 ? `${totalMerged}個の領域を統合しました` : '領域を保存しました', 
          id: finalId 
        });
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
        // デモ用シードデータのクリーンアップ
        try {
          await db.prepare("DELETE FROM territories WHERE id IN ('territory-1', 'territory-2')").run();
        } catch (err) {
          console.error('Failed to clean up dummy territories:', err);
        }

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
        const updates: string[] = ['name = ?', 'avatar_id = ?'];
        const params: any[] = [data.name, data.avatar_id];

        if (data.avatar_image !== undefined) {
          updates.push('avatar_image = ?');
          params.push(data.avatar_image);
        }

        if (data.login_id) {
          const existing = await db.prepare('SELECT id FROM users WHERE login_id = ? AND id != ?')
            .bind(data.login_id, user.sub)
            .first();
          if (existing) {
            return c.json({ error: 'このログインIDは既に他のユーザーに使用されています。' }, 400);
          }
          updates.push('login_id = ?');
          params.push(data.login_id);
        }

        if (data.password) {
          updates.push('password_hash = ?');
          params.push(data.password);
        }

        if (data.current_weight !== undefined) {
          updates.push('current_weight = ?');
          params.push(data.current_weight);
        }

        if (data.target_weight !== undefined) {
          updates.push('target_weight = ?');
          params.push(data.target_weight);
        }

        params.push(user.sub);

        await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
          .bind(...params)
          .run();

        if (data.avatar_id === 'custom' && data.avatar_image) {
          await unlockAchievement(db, user.sub, 'customizer');
        }

        return c.json({ 
          success: true, 
          message: 'プロフィールを更新しました', 
          name: data.name, 
          avatar_id: data.avatar_id,
          avatar_image: data.avatar_image || null,
          login_id: data.login_id,
          current_weight: data.current_weight !== undefined ? data.current_weight : null,
          target_weight: data.target_weight !== undefined ? data.target_weight : null
        });
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
          u.avatar_image,
          COALESCE(SUM(t.area_sqm), 0) as total_area_sqm,
          COUNT(DISTINCT t.id) as territories_count
        FROM users u
        LEFT JOIN territories t ON u.id = t.user_id ${joinConditions}
        GROUP BY u.id
        ORDER BY total_area_sqm DESC
        LIMIT 10
      `).all<{ name: string, avatar_id: string, avatar_image: string | null, total_area_sqm: number, territories_count: number }>();
      
      const formattedRanking = ranking.results.map((row, i) => ({
        rank: i + 1,
        name: row.name,
        avatar_id: row.avatar_id || 'default',
        avatar_image: row.avatar_image || null,
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
    firebaseAuth,
    validate(mealAnalysisRequestSchema),
    async (c) => {
      const { image } = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const aiService = new AIService(c.env.GEMINI_API_KEY);
      try {
        const analysis = await aiService.analyzeMealImage(image);
        
        const mealId = crypto.randomUUID();
        await db.prepare(`
          INSERT INTO meals (id, user_id, name, calories, protein, fat, carbs, advice)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
          .bind(
            mealId,
            user.sub,
            analysis.name || '食事記録',
            analysis.calories || 0,
            analysis.pfc?.protein || 0,
            analysis.pfc?.fat || 0,
            analysis.pfc?.carbs || 0,
            analysis.advice || ''
          )
          .run();

        await updateDailyMissionProgress(db, user.sub, 'meal', 1);

        return c.json({
          ...analysis,
          id: mealId,
          created_at: new Date().toISOString()
        });
      } catch (error) {
        console.error('Meal analyze error:', error);
        return c.json({ error: '食事の解析に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/meals/history',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      try {
        const list = await db.prepare('SELECT id, name, calories, protein, fat, carbs, advice, created_at FROM meals WHERE user_id = ? ORDER BY created_at DESC')
          .bind(user.sub)
          .all();
        return c.json({ meals: list.results });
      } catch (e) {
        console.error('Failed to get meal history:', e);
        return c.json({ error: '食事履歴の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/achievements/me',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      try {
        const list = await db.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?')
          .bind(user.sub)
          .all<{ achievement_id: string, unlocked_at: string }>();
        return c.json({ achievements: list.results });
      } catch (e) {
        console.error('Failed to get achievements:', e);
        return c.json({ error: '実績情報の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/chat/history',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      try {
        const list = await db.prepare('SELECT id, sender, message, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 50')
          .bind(user.sub)
          .all();
        return c.json({ messages: list.results });
      } catch (e) {
        console.error('Failed to get chat history:', e);
        return c.json({ error: '対話履歴の取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/chat',
    firebaseAuth,
    validate(chatRequestSchema),
    async (c) => {
      const { message } = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const aiService = new AIService(c.env.GEMINI_API_KEY);

      try {
        // 1. ユーザーのメッセージを保存
        const userMsgId = crypto.randomUUID();
        await db.prepare('INSERT INTO chat_messages (id, user_id, sender, message) VALUES (?, ?, ?, ?)')
          .bind(userMsgId, user.sub, 'user', message)
          .run();

        // 2. 過去の履歴をロードしてGeminiに渡す形式に整形 (直近15件程度)
        const history = await db.prepare('SELECT sender, message FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 15')
          .bind(user.sub)
          .all<{ sender: string, message: string }>();

        // DESCで取得された履歴を時系列順 (ASC) に反転
        const formattedHistory: { role: 'user' | 'model', text: string }[] = history.results
          .reverse()
          .map(msg => ({
            role: msg.sender === 'user' ? 'user' as const : 'model' as const,
            text: msg.message
          }));

        // 3. システムプロンプト
        const systemInstruction = `
あなたはPhysiProof（フィジプルーフ）という健康管理・領土獲得ゲームアプリの専属AIパーソナルコーチです。
ユーザーは日々の運動記録、食事のカロリー、マップでのテリトリー獲得などを頑張っています。
ユーザーからの健康、ダイエット、筋トレ、食事に関する質問に対して、専門的でありながら親しみやすくモチベーションを高める口調で答えてください。
回答は簡潔にし（スマホ画面で見やすいため）、常にポジティブで具体的なアドバイス（例: 「スクワットをあと10回増やしてみよう！」「タンパク質が足りないから鶏胸肉がおすすめ！」など）を心がけてください。
また、アプリのコンセプトである「支配エリア」「運動証明」「PFCバランス」などの用語に触れられるときは、積極的に関連付けてアドバイスしてください。
`;

        // 4. AIの返答を生成
        const aiResponse = await aiService.generateChatResponse(systemInstruction, formattedHistory);

        // 5. AIの返答を保存
        const aiMsgId = crypto.randomUUID();
        await db.prepare('INSERT INTO chat_messages (id, user_id, sender, message) VALUES (?, ?, ?, ?)')
          .bind(aiMsgId, user.sub, 'ai', aiResponse)
          .run();

        return c.json({
          userMessage: { id: userMsgId, sender: 'user', message, created_at: new Date().toISOString() },
          aiMessage: { id: aiMsgId, sender: 'ai', message: aiResponse, created_at: new Date().toISOString() }
        }, 201);
      } catch (err: any) {
        console.error('Chat error:', err);
        return c.json({ error: 'AIコーチからの応答生成に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/missions/today',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const today = new Date().toISOString().split('T')[0];

      try {
        let mission = await db.prepare('SELECT id, user_id, mission_date, title, description, target_type, target_count, current_count, is_completed, claimed FROM user_missions WHERE user_id = ? AND mission_date = ?')
          .bind(user.sub, today)
          .first<{ id: string, user_id: string, mission_date: string, title: string, description: string, target_type: string, target_count: number, current_count: number, is_completed: number, claimed: number }>();

        if (!mission) {
          const missionId = crypto.randomUUID();
          
          // 運動ミッション(腕立て伏せ30回)か食事ミッション(食事解析1回)をランダムに決定
          const isExercise = Math.random() > 0.5;
          const title = isExercise ? '⚔️ 筋力防衛訓練' : '🥗 健全なる補給証明';
          const description = isExercise 
            ? '今日の領土防衛力を維持するため、運動記録（腕立て伏せなど）を合計30回行いなさい。' 
            : '今日の食事を1回画像解析し、PFCバランスを計測しなさい。';
          const targetType = isExercise ? 'exercise' : 'meal';
          const targetCount = isExercise ? 30 : 1;

          // 今日の既存の進捗があれば計算して設定
          let currentCount = 0;
          if (isExercise) {
            const pushupCount = await db.prepare("SELECT COALESCE(SUM(count), 0) as cnt FROM pushup_measurements WHERE user_id = ? AND date(timestamp) = date('now')")
              .bind(user.sub)
              .first<{ cnt: number }>();
            currentCount = pushupCount?.cnt || 0;
          } else {
            const mealCount = await db.prepare("SELECT COUNT(*) as cnt FROM meals WHERE user_id = ? AND date(created_at) = date('now')")
              .bind(user.sub)
              .first<{ cnt: number }>();
            currentCount = mealCount?.cnt || 0;
          }

          const isCompleted = currentCount >= targetCount ? 1 : 0;

          await db.prepare('INSERT INTO user_missions (id, user_id, mission_date, title, description, target_type, target_count, current_count, is_completed, claimed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
            .bind(missionId, user.sub, today, title, description, targetType, targetCount, currentCount, isCompleted)
            .run();

          mission = {
            id: missionId,
            user_id: user.sub,
            mission_date: today,
            title,
            description,
            target_type: targetType,
            target_count: targetCount,
            current_count: currentCount,
            is_completed: isCompleted,
            claimed: 0
          };
        }

        return c.json({ mission });
      } catch (e: any) {
        console.error('Failed to get or create today mission:', e);
        return c.json({ error: '今日のミッションの取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/missions/claim',
    firebaseAuth,
    validate(claimMissionRewardRequestSchema),
    async (c) => {
      const { missionId, territoryId } = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const mission = await db.prepare('SELECT id, user_id, is_completed, claimed FROM user_missions WHERE id = ? AND user_id = ?')
          .bind(missionId, user.sub)
          .first<{ id: string, user_id: string, is_completed: number, claimed: number }>();

        if (!mission) {
          return c.json({ error: '対象のミッションが見つかりません。' }, 404);
        }

        if (mission.is_completed !== 1) {
          return c.json({ error: 'このミッションはまだ達成されていません。' }, 400);
        }

        if (mission.claimed === 1) {
          return c.json({ error: 'このミッションの報酬は既に受け取り済みです。' }, 400);
        }

        const territory = await db.prepare('SELECT id, fortification_level FROM territories WHERE id = ? AND user_id = ?')
          .bind(territoryId, user.sub)
          .first<{ id: string, fortification_level: number }>();

        if (!territory) {
          return c.json({ error: '指定された領土が存在しないか、所有者ではありません。' }, 404);
        }

        const newLevel = territory.fortification_level + 1;

        await db.batch([
          db.prepare('UPDATE territories SET fortification_level = ? WHERE id = ?').bind(newLevel, territoryId),
          db.prepare('UPDATE user_missions SET claimed = 1 WHERE id = ?').bind(missionId)
        ]);

        return c.json({ success: true, message: '領土を要塞化しました！', newFortificationLevel: newLevel });
      } catch (e: any) {
        console.error('Failed to claim mission reward:', e);
        return c.json({ error: '報酬の受け取りに失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/summary',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const usersCount = await db.prepare('SELECT COUNT(*) as cnt FROM users').first<{ cnt: number }>();
        const territoriesCount = await db.prepare('SELECT COUNT(*) as cnt FROM territories').first<{ cnt: number }>();
        const exercisesCount = await db.prepare('SELECT COUNT(*) as cnt FROM pushup_measurements').first<{ cnt: number }>();
        const areaSum = await db.prepare('SELECT SUM(area_sqm) as total FROM territories').first<{ total: number | null }>();

        return c.json({
          totalUsers: usersCount?.cnt || 0,
          totalTerritories: territoriesCount?.cnt || 0,
          totalExercises: exercisesCount?.cnt || 0,
          totalArea: areaSum?.total || 0
        });
      } catch (e: any) {
        console.error('Admin summary error:', e);
        return c.json({ error: '統計データの取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/users',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const users = await db.prepare('SELECT id, login_id, password_hash as password, name, role, current_weight, target_weight, created_at FROM users').all();
        return c.json({ users: users.results });
      } catch (e: any) {
        console.error('Admin users error:', e);
        return c.json({ error: 'ユーザー一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .delete(
    '/admin/users/:id',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const targetUserId = c.req.param('id');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      if (targetUserId === user.sub) {
        return c.json({ error: '自分自身を削除することはできません。' }, 400);
      }

      try {
        await db.batch([
          db.prepare('DELETE FROM pushup_measurements WHERE user_id = ?').bind(targetUserId),
          db.prepare('DELETE FROM territories WHERE user_id = ?').bind(targetUserId),
          db.prepare('DELETE FROM meals WHERE user_id = ?').bind(targetUserId),
          db.prepare('DELETE FROM achievements WHERE user_id = ?').bind(targetUserId),
          db.prepare('DELETE FROM user_missions WHERE user_id = ?').bind(targetUserId),
          db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId)
        ]);
        return c.json({ success: true, message: 'ユーザー及び関連データを削除しました。' });
      } catch (e: any) {
        console.error('Admin delete user error:', e);
        return c.json({ error: 'ユーザーの削除に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/territories',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const territories = await db.prepare(`
          SELECT t.id, t.user_id, u.name as user_name, t.latitude, t.longitude, t.area_polygon, t.area_sqm, t.fortification_level, t.captured_at, t.time_period, t.distance_m, t.duration_sec, t.avg_speed_kmh, t.ai_integrity, t.ai_reason, t.ai_confidence
          FROM territories t
          JOIN users u ON t.user_id = u.id
          ORDER BY t.captured_at DESC
        `).all();
        return c.json({ territories: territories.results });
      } catch (e: any) {
        console.error('Admin territories error:', e);
        return c.json({ error: '領土データの取得に失敗しました。' }, 500);
      }
    }
  )
  .delete(
    '/admin/territories/:id',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const territoryId = c.req.param('id');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        await db.prepare('DELETE FROM territories WHERE id = ?').bind(territoryId).run();
        return c.json({ success: true, message: '領域を削除しました。' });
      } catch (e: any) {
        console.error('Admin delete territory error:', e);
        return c.json({ error: '領域の削除に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/admin/territories/:id/audit',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const territoryId = c.req.param('id');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const t = await db.prepare('SELECT area_sqm, avg_speed_kmh, area_polygon FROM territories WHERE id = ?').bind(territoryId).first<{ area_sqm: number, avg_speed_kmh: number, area_polygon: string }>();
        if (!t) {
          return c.json({ error: '支配領域データが見つかりません。' }, 404);
        }

        const aiService = new AIService(c.env.GEMINI_API_KEY);
        const result = await aiService.auditTerritoryRegistration(
          t.area_sqm,
          t.avg_speed_kmh,
          t.area_polygon
        );

        await db.prepare('UPDATE territories SET ai_integrity = ?, ai_reason = ?, ai_confidence = ? WHERE id = ?')
          .bind(result.integrity, result.reason, result.confidence, territoryId)
          .run();

        return c.json({
          success: true,
          integrity: result.integrity,
          reason: result.reason,
          confidence: result.confidence
        });
      } catch (e: any) {
        console.error('Admin territory AI audit error:', e);
        return c.json({ error: e.message || 'AI監査の実行に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/exercises',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const exercises = await db.prepare(`
          SELECT p.id, p.user_id, u.name as user_name, p.exercise_type, p.count, p.timestamp, p.sensor_log, p.ai_integrity, p.ai_reason, p.ai_confidence
          FROM pushup_measurements p
          JOIN users u ON p.user_id = u.id
          ORDER BY p.timestamp DESC
          LIMIT 50
        `).all();
        return c.json({ exercises: exercises.results });
      } catch (e: any) {
        console.error('Admin exercises error:', e);
        return c.json({ error: '運動履歴の取得に失敗しました。' }, 500);
      }
    }
  )
  .delete(
    '/admin/exercises/:id',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const logId = c.req.param('id');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        await db.prepare('DELETE FROM pushup_measurements WHERE id = ?').bind(logId).run();
        return c.json({ success: true, message: '運動履歴を削除しました。' });
      } catch (e: any) {
        console.error('Admin delete exercise error:', e);
        return c.json({ error: '運動履歴の削除に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/admin/exercises/:id/audit',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const logId = c.req.param('id');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const log = await db.prepare('SELECT exercise_type, count, sensor_log FROM pushup_measurements WHERE id = ?').bind(logId).first<{ exercise_type: string, count: number, sensor_log: string | null }>();
        if (!log) {
          return c.json({ error: '運動履歴が見つかりません。' }, 404);
        }

        const aiService = new AIService(c.env.GEMINI_API_KEY);
        const result = await aiService.auditExerciseSensorLog(
          log.exercise_type,
          log.count,
          log.sensor_log || '[]'
        );

        await db.prepare('UPDATE pushup_measurements SET ai_integrity = ?, ai_reason = ?, ai_confidence = ? WHERE id = ?')
          .bind(result.integrity, result.reason, result.confidence, logId)
          .run();

        return c.json({
          success: true,
          integrity: result.integrity,
          reason: result.reason,
          confidence: result.confidence
        });
      } catch (e: any) {
        console.error('Admin AI audit error:', e);
        return c.json({ error: e.message || 'AI監査の実行に失敗しました。' }, 500);
      }
    }
  );

// --- 実績解除用ヘルパー関数 ---
async function unlockAchievement(db: D1Database, userId: string, achievementId: string): Promise<boolean> {
  try {
    const id = crypto.randomUUID();
    const res = await db.prepare('INSERT OR IGNORE INTO achievements (id, user_id, achievement_id) VALUES (?, ?, ?)')
      .bind(id, userId, achievementId)
      .run();
    return res.success;
  } catch (err) {
    console.error('Failed to unlock achievement:', achievementId, err);
    return false;
  }
}

async function checkAndUnlockCalorieBurst(db: D1Database, userId: string): Promise<void> {
  try {
    const stats = await db.prepare(`
      SELECT 
        exercise_type,
        SUM(count) as total_count
      FROM pushup_measurements
      WHERE user_id = ? AND date(timestamp) = date('now')
      GROUP BY exercise_type
    `).bind(userId).all<{ exercise_type: string, total_count: number }>();

    if (stats.results.length === 0) return;

    const exerciseTypes = stats.results.map(s => s.exercise_type);
    const cachedMetadata = await db.prepare(`
      SELECT exercise_type, unit_calories FROM exercise_metadata
      WHERE exercise_type IN (${exerciseTypes.map(() => '?').join(',')})
    `).bind(...exerciseTypes).all<{ exercise_type: string, unit_calories: number }>();

    let totalCalories = 0;
    for (const stat of stats.results) {
      const meta = cachedMetadata.results.find(m => m.exercise_type === stat.exercise_type);
      const unitCal = meta?.unit_calories || 0;
      totalCalories += unitCal * stat.total_count;
    }

    if (totalCalories >= 1000) {
      await unlockAchievement(db, userId, 'calorie_burst');
    }
  } catch (err) {
    console.error('Failed to check calorie burst achievement:', err);
  }
}

async function updateDailyMissionProgress(db: D1Database, userId: string, type: 'exercise' | 'meal', addCount: number): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const mission = await db.prepare('SELECT id, target_count, current_count, is_completed FROM user_missions WHERE user_id = ? AND mission_date = ? AND target_type = ?')
      .bind(userId, today, type)
      .first<{ id: string, target_count: number, current_count: number, is_completed: number }>();

    if (!mission) return;

    const newCount = mission.current_count + addCount;
    const isCompleted = newCount >= mission.target_count ? 1 : 0;

    await db.prepare('UPDATE user_missions SET current_count = ?, is_completed = ? WHERE id = ?')
      .bind(newCount, isCompleted, mission.id)
      .run();
  } catch (err) {
    console.error('Failed to update daily mission progress:', err);
  }
}

export type AppType = typeof routes;
export default app;
