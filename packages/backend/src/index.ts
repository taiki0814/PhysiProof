import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { pushupMeasurementSchema, bulkPushupMeasurementSchema, predictionRequestSchema, mealAnalysisRequestSchema, loginSchema, signupSchema, validateMovementIntegrity, calculatePhysicsFallback, createTerritorySchema, updateProfileSchema, achievementSchema, mealRecordSchema, chatRequestSchema, chatMessageSchema, claimMissionRewardRequestSchema, createTrainingScheduleSchema, systemSettingsSchema, ACHIEVEMENT_DEFINITIONS, allocateStatsSchema, adminUpdateUserSchema, adminSendNotificationSchema, createTeamSchema, joinTeamSchema, createTeamBattleSchema, teamBattleInvitationStatusSchema, teamBattleParticipantRoleSchema, teamBattleStatusSchema, sendFriendRequestSchema, respondFriendRequestSchema, friendSearchQuerySchema } from '@my-app/shared';
import type { CreateTeamBattle, TeamBattleSummary } from '@my-app/shared';
import type { D1Database } from '@cloudflare/workers-types';
import { AIService } from './services/aiService';
import { IntegrityService } from './services/integrityService';
import { performTerritoryMerge, NewTerritoryInput } from './services/territoryMerge';
import { firebaseAuth, verifyUserOwnership, optionalAuth } from './middleware/auth';
import { difference } from '@turf/difference';
import { union } from '@turf/union';
import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PhysiProof/1.0 (taiki0814/PhysiProof)'
      }
    });
    if (!res.ok) return '';
    const data = (await res.json()) as any;
    if (data && data.address) {
      const addr = data.address;
      const province = addr.province || addr.state || '';
      const city = addr.city || addr.town || addr.village || '';
      const suburb = addr.suburb || '';
      const road = addr.road || '';
      const name = `${province}${city}${suburb}${road}`.trim();
      return name || data.display_name || '';
    }
    return (data && data.display_name) || '';
  } catch (e) {
    console.error('Failed to reverse geocode:', e);
    return '';
  }
}

type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY: string;
  GEMINI_API_KEY_MAP?: string;
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
        user = await db.prepare(`
          SELECT 
            u.id, u.name, u.avatar_id, u.avatar_image, u.login_id, u.role, 
            u.current_weight, u.target_weight, u.target_calories_burned, u.target_calories_consumed, 
            u.gender, u.age, u.height, u.level, u.xp, u.status_points, 
            u.stat_str, u.stat_agi, u.stat_def, u.stat_vit, u.team_id, t.name as team_name
          FROM users u
          LEFT JOIN teams t ON u.team_id = t.id
          WHERE u.login_id = ? AND u.password_hash = ?
        `)
          .bind(loginId, password)
          .first<{ 
            id: string, name: string, avatar_id: string, avatar_image: string | null, login_id: string, role: string, 
            current_weight: number | null, target_weight: number | null, target_calories_burned: number | null, 
            target_calories_consumed: number | null, gender: string | null, age: number | null, height: number | null, 
            level: number, xp: number, status_points: number, stat_str: number, stat_agi: number, stat_def: number, stat_vit: number,
            team_id: string | null, team_name: string | null
          }>();
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
        target_weight: user.target_weight,
        target_calories_burned: user.target_calories_burned,
        target_calories_consumed: user.target_calories_consumed,
        gender: user.gender,
        age: user.age,
        height: user.height,
        level: user.level,
        xp: user.xp,
        status_points: user.status_points,
        stat_str: user.stat_str,
        stat_agi: user.stat_agi,
        stat_def: user.stat_def,
        stat_vit: user.stat_vit,
        team_id: user.team_id || null,
        team_name: user.team_name || null
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

      // 3. Nonce、運動記録、対戦ポイントを同一バッチで保存する。
      // 対戦ポイントはオンラインの単件エンドポイントだけで加算し、bulk同期は対象外。
      const results = await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO used_nonces (nonce) VALUES (?)').bind(data.nonce),
        c.env.DB.prepare(
          'INSERT INTO pushup_measurements (user_id, exercise_type, count, timestamp, sensor_log) VALUES (?, ?, ?, ?, ?)'
        ).bind(data.user_id, data.exercise_type, data.count, data.timestamp, JSON.stringify(data.sensor_log)),
        c.env.DB.prepare(`
          INSERT OR IGNORE INTO team_battle_contributions
            (battle_id, source_nonce, user_id, team_id, points)
          SELECT b.id, ?, ?, member.team_id, ?
          FROM team_battles b
          JOIN team_battle_members member
            ON member.battle_id = b.id AND member.user_id = ?
          JOIN team_battle_participants participant
            ON participant.battle_id = b.id
              AND participant.team_id = member.team_id
              AND participant.invitation_status = 'accepted'
          JOIN users current_member
            ON current_member.id = member.user_id AND current_member.team_id = member.team_id
          WHERE b.status = 'accepted'
            AND datetime(b.starts_at) <= CURRENT_TIMESTAMP
            AND CURRENT_TIMESTAMP < datetime(b.ends_at)
        `).bind(data.nonce, data.user_id, data.count, user.sub)
      ]);
      const savedMeasurement = results[1];

      if (savedMeasurement.success) {
        const newUnlocked: string[] = [];
        if (await checkAndUnlockCalorieBurst(c.env.DB, data.user_id)) newUnlocked.push('calorie_burst');
        if (await checkAndUnlockPushupMaster(c.env.DB, data.user_id)) newUnlocked.push('pushup_master');
        await updateDailyMissionProgress(c.env.DB, data.user_id, 'exercise', data.count);

        const newAchievementsData = newUnlocked.map(id => {
          const def = ACHIEVEMENT_DEFINITIONS[id];
          return {
            id,
            title: def?.title || id,
            icon: def?.icon || '🏆',
            description: def?.description || ''
          };
        });

        const xpResult = await addXpAndCheckLevelUp(c.env.DB, data.user_id, data.count);

        return c.json({ 
          message: 'プッシュアップの記録を保存しました。', 
          newAchievements: newAchievementsData,
          xpInfo: xpResult
        }, 201);
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

      const newUnlocked: string[] = [];
      if (statements.length > 0) {
        await c.env.DB.batch(statements);
        if (await checkAndUnlockCalorieBurst(c.env.DB, user.sub)) newUnlocked.push('calorie_burst');
        if (await checkAndUnlockPushupMaster(c.env.DB, user.sub)) newUnlocked.push('pushup_master');
        await updateDailyMissionProgress(c.env.DB, user.sub, 'exercise', totalCount);
      }

      const newAchievementsData = newUnlocked.map(id => {
        const def = ACHIEVEMENT_DEFINITIONS[id];
        return {
          id,
          title: def?.title || id,
          icon: def?.icon || '🏆',
          description: def?.description || ''
        };
      });

      let xpResult = null;
      if (totalCount > 0) {
        xpResult = await addXpAndCheckLevelUp(c.env.DB, user.sub, totalCount);
      }

      return c.json({
        message: '一括送信処理が完了しました。',
        details: results,
        newAchievements: newAchievementsData,
        xpInfo: xpResult
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
      const aiService = new AIService(c.env.GEMINI_API_KEY, db);
      
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
          INSERT INTO weight_predictions (id, user_id, current_weight, target_weight, total_calories_burned, meal_calories_consumed, days_to_target, advice, daily_calorie_deficit, gender, age, height)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            prediction.dailyCalorieDeficit,
            data.gender || null,
            data.age || null,
            data.height || null
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
        const list = await db.prepare('SELECT id, current_weight, target_weight, total_calories_burned, meal_calories_consumed, days_to_target, advice, daily_calorie_deficit, gender, age, height, created_at FROM weight_predictions WHERE user_id = ? ORDER BY created_at DESC')
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
      const newUnlocked: string[] = [];

      const dbUser = await db.prepare('SELECT name, team_id FROM users WHERE id = ?').bind(user.sub).first<{ name: string, team_id: string | null }>();
      const attackerName = dbUser?.name || '他のユーザー';
      const myTeamId = dbUser?.team_id || null;

      const distance = data.distance_m || 0;
      const duration = data.duration_sec || 0;
      const avgSpeed = data.avg_speed_kmh || (duration > 0 ? (distance / 1000) / (duration / 3600) : 0);

      if (avgSpeed > 40) {
        return c.json({ error: '移動速度が速すぎます（平均速度が40km/hを超えています）。自転車や乗り物での移動は無効です。' }, 400);
      }

      const address = await reverseGeocode(data.latitude, data.longitude);

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

        let newTurfPoly: any = null;
        let activeNewPoly: any = null;

        if (Array.isArray(newCoords) && newCoords.length >= 3) {
          // [lat, lng] → [lng, lat] (GeoJSON 形式) に変換し、閉じたリングにする
          const newRing = newCoords.map(([lat, lng]) => [lng, lat] as [number, number]);
          const first = newRing[0];
          const last = newRing[newRing.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            newRing.push(first);
          }

          try {
            newTurfPoly = turfPolygon([newRing]);
          } catch (pe) {
            console.error('Failed to create Turf polygon from new territory:', pe);
          }

          if (newTurfPoly) {
            // 自分以外の他人の領域をすべて取得（防衛レベルも含めて取得）
            const otherTerritories = await db.prepare('SELECT id, user_id, team_id, area_polygon, area_sqm, fortification_level, address, latitude FROM territories WHERE user_id != ?')
              .bind(user.sub)
              .all<{ id: string, user_id: string, team_id: string | null, area_polygon: string, area_sqm: number, fortification_level: number, address: string | null, latitude: number }>();

            const deleteIds: string[] = [];
            const updateStatements: any[] = [];
            activeNewPoly = newTurfPoly; // 防衛レベル4でくり抜かれた場合の最終保存用新ポリゴン

            for (const oldT of otherTerritories.results) {
              try {
                const isSameTeam = myTeamId && oldT.team_id === myTeamId;
                if (isSameTeam) continue;

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

                const oldArea = turfArea(oldTurfPoly);
                if (oldArea <= 0) continue;

                // 重なり（交差）の割合を計算する（追加ライブラリ無しの difference 差分アプローチ）
                // 元々の新ポリゴン（newTurfPoly）を基準に判定する
                const initialDiff = difference(featureCollection([oldTurfPoly, newTurfPoly]));
                let overlapArea = 0;
                if (!initialDiff) {
                  overlapArea = oldArea;
                } else {
                  overlapArea = Math.max(0, oldArea - turfArea(initialDiff));
                }
                const overlapRatio = overlapArea / oldArea;

                const level = oldT.fortification_level || 1;

                // 差分の座標を抽出するヘルパー関数
                const getCoordsFromPoly = (geom: any): [number, number][] => {
                  if (geom.geometry.type === 'MultiPolygon') {
                    const parts = geom.geometry.coordinates;
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
                      } catch {}
                    }
                    return parts[maxPartIndex][0]
                      .slice(0, -1)
                      .map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
                  } else {
                    return geom.geometry.coordinates[0]
                      .slice(0, -1)
                      .map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
                  }
                };

                if (level === 1) {
                  // 防衛レベル 1: 通常削り
                  const diff = difference(featureCollection([oldTurfPoly, newTurfPoly]));
                  if (!diff) {
                    deleteIds.push(oldT.id);
                    await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                    continue;
                  }
                  const remainingAreaSqm = turfArea(diff);
                  if (remainingAreaSqm < 1) {
                    deleteIds.push(oldT.id);
                    await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                    continue;
                  }
                  const remainingCoords = getCoordsFromPoly(diff);
                  if (remainingCoords.length < 3) {
                    deleteIds.push(oldT.id);
                    await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                    continue;
                  }
                  updateStatements.push(
                    db.prepare('UPDATE territories SET area_polygon = ?, area_sqm = ? WHERE id = ?')
                      .bind(JSON.stringify(remainingCoords), remainingAreaSqm, oldT.id)
                  );
                  await createTerritoryNotification(db, oldT.user_id, '⚠️ 領土が削られました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）の一部が「${attackerName}」によって削られました。`, 'territory_lost');
                } 
                else if (level === 2) {
                  // 防衛レベル 2: 半分以上削られた場合のみ奪われる
                  if (overlapRatio >= 0.5) {
                    const diff = difference(featureCollection([oldTurfPoly, newTurfPoly]));
                    if (!diff) {
                      deleteIds.push(oldT.id);
                      await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                      continue;
                    }
                    const remainingAreaSqm = turfArea(diff);
                    if (remainingAreaSqm < 1) {
                      deleteIds.push(oldT.id);
                      await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                      continue;
                    }
                    const remainingCoords = getCoordsFromPoly(diff);
                    if (remainingCoords.length < 3) {
                      deleteIds.push(oldT.id);
                      await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                      continue;
                    }
                    updateStatements.push(
                      db.prepare('UPDATE territories SET area_polygon = ?, area_sqm = ? WHERE id = ?')
                        .bind(JSON.stringify(remainingCoords), remainingAreaSqm, oldT.id)
                    );
                    await createTerritoryNotification(db, oldT.user_id, '⚠️ 領土が削られました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）の一部が「${attackerName}」によって削られました。`, 'territory_lost');
                  } else {
                    // 削られない（メリット発動：何もしない）
                  }
                } 
                else if (level === 3) {
                  // 防衛レベル 3: 全体を囲まれない限り奪われない
                  if (overlapRatio >= 0.99) {
                    deleteIds.push(oldT.id);
                    await createTerritoryNotification(db, oldT.user_id, '🚨 領土完全制覇されました', `あなたの領土（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」によって完全に上書きされました。`, 'territory_lost');
                  } else {
                    // 削られない（メリット発動：何もしない）
                  }
                } 
                else if (level >= 4) {
                  // 防衛レベル 4: 一度までは全体を囲まれても取られない（Lv.3にダウン）
                  // その代わり、敵（newTurfPoly）側からこの領域をくり抜く
                  if (overlapRatio >= 0.99) {
                    updateStatements.push(
                      db.prepare('UPDATE territories SET fortification_level = 3 WHERE id = ?')
                        .bind(oldT.id)
                    );
                    const newDiff = difference(featureCollection([activeNewPoly, oldTurfPoly]));
                    if (newDiff) {
                      activeNewPoly = newDiff as any;
                    } else {
                      activeNewPoly = null;
                    }
                    await createTerritoryNotification(db, oldT.user_id, '🛡️ 要塞のレベルがダウンしました', `あなたの防衛要塞（${oldT.address || '緯度 ' + oldT.latitude.toFixed(4) + ' 付近'}）が「${attackerName}」の攻撃により防衛レベルが3にダウンしました。`, 'territory_lost');
                  } else {
                    // 完全に囲まれていない場合は削られない（メリット発動：何もしない）
                  }
                }
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
              if (await unlockAchievement(db, user.sub, 'conqueror')) {
                newUnlocked.push('conqueror');
              }
            }
          }
        }

        // ── 自分の既存領域およびチーム領域とのマージロジック ──
        // 新領域が自分または同チームメンバーの既存領域と重なる場合、@turf/union で統合する
        const existingTerritoriesCount = await db.prepare('SELECT COUNT(*) as cnt FROM territories WHERE user_id = ?')
          .bind(user.sub)
          .first<{ cnt: number }>();

        // 自分の全既存領域および同チームの領域を取得
        const myTerritories = await db.prepare('SELECT id, area_polygon, area_sqm, fortification_level, latitude, longitude, time_period FROM territories WHERE user_id = ? OR (team_id IS NOT NULL AND team_id = ?)')
          .bind(user.sub, myTeamId)
          .all<{ id: string, area_polygon: string, area_sqm: number, fortification_level: number, latitude: number, longitude: number, time_period: string }>();

        const deleteIds: string[] = [];
        const updateStatements: any[] = [];
        const insertStatements: any[] = [];
        let newOrUpdatedId: string | null = null;
        let isMerged = false;

        // activeNewPoly（防衛レベル4によるくり抜きを適用した後のポリゴン）から新規獲得データを再構成
        let finalNewInput: NewTerritoryInput | null = data;
        if (activeNewPoly) {
          let remainingCoords: [number, number][];
          if (activeNewPoly.geometry.type === 'MultiPolygon') {
            const parts = activeNewPoly.geometry.coordinates;
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
              } catch {}
            }
            remainingCoords = parts[maxPartIndex][0]
              .slice(0, -1)
              .map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
          } else {
            remainingCoords = activeNewPoly.geometry.coordinates[0]
              .slice(0, -1)
              .map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
          }

          if (remainingCoords.length >= 3) {
            finalNewInput = {
              ...data,
              area_polygon: JSON.stringify(remainingCoords)
            };
          } else {
            finalNewInput = null; // 面積が極小すぎて消滅
          }
        } else {
          finalNewInput = null; // 完全にくり抜かれて消滅
        }

        try {
          // 重なっている自分の領域を再帰的にマージ
          const groups = performTerritoryMerge(finalNewInput, myTerritories.results);

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
                  db.prepare('INSERT INTO territories (id, user_id, team_id, latitude, longitude, area_polygon, area_sqm, time_period, fortification_level, distance_m, duration_sec, avg_speed_kmh, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                    .bind(newId, user.sub, myTeamId, g.latitude, g.longitude, finalAreaPolygon, finalAreaSqm, g.time_period, g.fortification_level, distance, duration, avgSpeed, address)
                );
              } else {
                // 既存の領域のいずれかにマージされた
                const targetId = g.originalIds[0];
                newOrUpdatedId = targetId;
                isMerged = true;
                updateStatements.push(
                  db.prepare('UPDATE territories SET latitude = ?, longitude = ?, area_polygon = ?, area_sqm = ?, time_period = ?, fortification_level = ?, distance_m = distance_m + ?, duration_sec = duration_sec + ?, avg_speed_kmh = ?, address = ? WHERE id = ?')
                    .bind(g.latitude, g.longitude, finalAreaPolygon, finalAreaSqm, g.time_period, g.fortification_level, distance, duration, avgSpeed, address, targetId)
                );
                deleteIds.push(...g.originalIds.slice(1));
              }
            } else {
              // 既存領域同士がマージされたケース
              if (g.originalIds.length > 1) {
                const targetId = g.originalIds[0];
                updateStatements.push(
                  db.prepare('UPDATE territories SET latitude = ?, longitude = ?, area_polygon = ?, area_sqm = ?, time_period = ?, fortification_level = ?, distance_m = distance_m + ?, duration_sec = duration_sec + ?, avg_speed_kmh = ?, address = ? WHERE id = ?')
                    .bind(g.latitude, g.longitude, finalAreaPolygon, finalAreaSqm, g.time_period, g.fortification_level, distance, duration, avgSpeed, address, targetId)
              );
              deleteIds.push(...g.originalIds.slice(1));
              }
            }
          }
        } catch (mergeError) {
          console.error('Failed to perform territory merge, falling back to inserting as standalone:', mergeError);
          // マージに失敗した場合は、フォールバックとして「独立した新しい領土」として直接保存します
          const newId = crypto.randomUUID();
          newOrUpdatedId = newId;
          isMerged = false;
          // deleteIds / updateStatements をクリアし、新規インサートのみを設定
          deleteIds.length = 0;
          updateStatements.length = 0;
          insertStatements.length = 0;
          insertStatements.push(
            db.prepare('INSERT INTO territories (id, user_id, team_id, latitude, longitude, area_polygon, area_sqm, time_period, fortification_level, distance_m, duration_sec, avg_speed_kmh, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(newId, user.sub, myTeamId, data.latitude, data.longitude, data.area_polygon, data.area_sqm, data.time_period, 0, distance, duration, avgSpeed, address)
          );
        }

        // 支配領域の上限数チェック
        const currentCountVal = myTerritories.results.length;
        const finalCount = currentCountVal - deleteIds.length + insertStatements.length;

        let maxTerritories = 10000;
        try {
          const maxTerrSettings = await db.prepare("SELECT value FROM system_settings WHERE key = 'max_territories'").first<{ value: string }>();
          if (maxTerrSettings) {
            maxTerritories = parseInt(maxTerrSettings.value, 10);
          }
        } catch (se) {
          // テーブルが無い等の場合はチェックをスルーまたはデフォルト値 10000 とする
        }

        if (finalCount > maxTerritories) {
          return c.json({ error: `支配領域の保有上限（最大 ${maxTerritories} 個）に達しているため、これ以上新しい領域を追加できません。既存の領域を整理するか、管理者に設定変更を依頼してください。` }, 400);
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

        if (await checkAndUnlockTerritoryMonarch(db, user.sub)) newUnlocked.push('territory_monarch');
        if (await checkAndUnlockWorldTraveler(db, user.sub)) newUnlocked.push('world_traveler');
        if (await checkAndUnlockActiveStreak(db, user.sub)) newUnlocked.push('active_streak');
        if (await checkAndUnlockCalorieBurst(db, user.sub)) newUnlocked.push('calorie_burst');

        if (!existingTerritoriesCount || existingTerritoriesCount.cnt === 0) {
          if (await unlockAchievement(db, user.sub, 'first_close')) {
            newUnlocked.push('first_close');
          }
        }

        const newAchievementsData = newUnlocked.map(id => {
          const def = ACHIEVEMENT_DEFINITIONS[id];
          return {
            id,
            title: def?.title || id,
            icon: def?.icon || '🏆',
            description: def?.description || ''
          };
        });

        const totalMerged = deleteIds.length + (isMerged ? 1 : 0);
        const finalId = newOrUpdatedId || crypto.randomUUID();

        const xpResult = await addXpAndCheckLevelUp(db, user.sub, 50);

        return c.json({ 
          success: true, 
          message: totalMerged > 0 ? `${totalMerged}個の領域を統合しました` : '領域を保存しました', 
          id: finalId,
          newAchievements: newAchievementsData,
          xpInfo: xpResult
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
            t.team_id,
            u.name as user_name,
            t.latitude,
            t.longitude,
            t.area_polygon,
            t.area_sqm,
            t.time_period,
            t.fortification_level,
            t.captured_at,
            t.address
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

        if (data.target_calories_burned !== undefined) {
          updates.push('target_calories_burned = ?');
          params.push(data.target_calories_burned);
        }

        if (data.target_calories_consumed !== undefined) {
          updates.push('target_calories_consumed = ?');
          params.push(data.target_calories_consumed);
        }

        if (data.gender !== undefined) {
          updates.push('gender = ?');
          params.push(data.gender);
        }

        if (data.age !== undefined) {
          updates.push('age = ?');
          params.push(data.age);
        }

        if (data.height !== undefined) {
          updates.push('height = ?');
          params.push(data.height);
        }

        params.push(user.sub);

        await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
          .bind(...params)
          .run();

        const newUnlocked: string[] = [];
        if (data.avatar_id === 'custom' && data.avatar_image) {
          if (await unlockAchievement(db, user.sub, 'customizer')) {
            newUnlocked.push('customizer');
          }
        }

        const newAchievementsData = newUnlocked.map(id => {
          const def = ACHIEVEMENT_DEFINITIONS[id];
          return {
            id,
            title: def?.title || id,
            icon: def?.icon || '🏆',
            description: def?.description || ''
          };
        });

        return c.json({ 
          success: true, 
          message: 'プロフィールを更新しました', 
          name: data.name, 
          avatar_id: data.avatar_id,
          avatar_image: data.avatar_image || null,
          login_id: data.login_id,
          current_weight: data.current_weight !== undefined ? data.current_weight : null,
          target_weight: data.target_weight !== undefined ? data.target_weight : null,
          target_calories_burned: data.target_calories_burned !== undefined ? data.target_calories_burned : null,
          target_calories_consumed: data.target_calories_consumed !== undefined ? data.target_calories_consumed : null,
          gender: data.gender !== undefined ? data.gender : null,
          age: data.age !== undefined ? data.age : null,
          height: data.height !== undefined ? data.height : null,
          newAchievements: newAchievementsData
        });
      } catch (e: any) {
        console.error('Profile update error:', e);
        return c.json({ error: 'プロフィールの更新に失敗しました' }, 500);
      }
    }
  )
  .get(
    '/ranking',
    optionalAuth,
    zValidator('query', z.object({ 
      period: z.enum(['morning', 'afternoon', 'night', 'all']).optional().default('all'),
      duration: z.enum(['daily', 'weekly', 'yearly', 'all']).optional().default('all'),
      type: z.enum(['individual', 'team']).optional().default('individual'),
      team_id: z.string().optional(),
      player_id: z.string().optional(),
      friends_only: z.enum(['true', 'false']).optional().default('false')
    })),
    async (c) => {
      const db = c.env.DB;
      const { period, duration, type, team_id, player_id, friends_only } = c.req.valid('query');
      
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
      
      if (type === 'team') {
        const ranking = await db.prepare(`
          SELECT 
            team.id,
            team.name,
            COALESCE(SUM(t.area_sqm), 0) as total_area_sqm,
            COUNT(DISTINCT t.id) as territories_count
          FROM teams team
          LEFT JOIN territories t ON team.id = t.team_id ${joinConditions}
          GROUP BY team.id
          ORDER BY total_area_sqm DESC
          LIMIT 10
        `).all<{ id: string, name: string, total_area_sqm: number, territories_count: number }>();

        const formattedRanking = ranking.results.map((row, i) => ({
          rank: i + 1,
          name: row.name,
          avatar_id: 'team_shield',
          avatar_image: null,
          territories: row.territories_count,
          points: Math.floor(row.total_area_sqm)
        }));

        return c.json({
          ranking: formattedRanking.length > 0 ? formattedRanking : [
            { rank: 1, name: 'NO DATA', avatar_id: 'team_shield', territories: 0, points: 0 }
          ]
        });
      } else {
        if (player_id) {
          try {
            const row = await db.prepare(`
              SELECT rank, name, avatar_id, avatar_image, territories_count, total_area_sqm
              FROM (
                SELECT 
                  u.id as user_id,
                  u.name,
                  u.avatar_id,
                  u.avatar_image,
                  COUNT(DISTINCT t.id) as territories_count,
                  COALESCE(SUM(t.area_sqm), 0) as total_area_sqm,
                  ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(t.area_sqm), 0) DESC) as rank
                FROM users u
                LEFT JOIN territories t ON u.id = t.user_id ${joinConditions}
                GROUP BY u.id
              )
              WHERE user_id = ?
            `).bind(player_id).first<{ rank: number, name: string, avatar_id: string | null, avatar_image: string | null, territories_count: number, total_area_sqm: number }>();

            if (!row) {
              return c.json({ ranking: [{ rank: 0, name: 'NOT FOUND', avatar_id: 'default', territories: 0, points: 0 }] });
            }

            return c.json({
              ranking: [{
                rank: row.rank,
                name: row.name,
                avatar_id: row.avatar_id || 'default',
                avatar_image: row.avatar_image || null,
                territories: row.territories_count,
                points: Math.floor(row.total_area_sqm)
              }]
            });
          } catch (err) {
            console.error('Failed to query single player ranking:', err);
            return c.json({ error: 'ランキング取得に失敗しました。' }, 500);
          }
        } else {
          const whereClauses: string[] = [];
          const bindParams: any[] = [];

          if (team_id) {
            whereClauses.push('u.team_id = ?');
            bindParams.push(team_id);
          }

          if (friends_only === 'true') {
            const user = c.get('firebaseUser');
            if (user && user.sub) {
              whereClauses.push('(u.id IN (SELECT friend_id FROM friends WHERE user_id = ?) OR u.id = ?)');
              bindParams.push(user.sub, user.sub);
            } else {
              return c.json({ ranking: [] });
            }
          }

          const userFilter = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

          const ranking = await db.prepare(`
            SELECT 
              u.name,
              u.avatar_id,
              u.avatar_image,
              COALESCE(SUM(t.area_sqm), 0) as total_area_sqm,
              COUNT(DISTINCT t.id) as territories_count
            FROM users u
            LEFT JOIN territories t ON u.id = t.user_id ${joinConditions}
            ${userFilter}
            GROUP BY u.id
            ORDER BY total_area_sqm DESC
            LIMIT 10
          `).bind(...bindParams).all<{ name: string, avatar_id: string, avatar_image: string | null, total_area_sqm: number, territories_count: number }>();

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
      }
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

      // 1. 筋肉運動（プッシュアップ等）の集計
      let enrichedStats: Array<{ exercise_type: string, total_count: number, estimated_calories: number }> = [];

      if (stats.results.length > 0) {
        const exerciseTypes = stats.results.map(s => s.exercise_type);
        const cachedMetadata = await db.prepare(`
          SELECT exercise_type, unit_calories FROM exercise_metadata
          WHERE exercise_type IN (${exerciseTypes.map(() => '?').join(',')})
        `).bind(...exerciseTypes).all<{ exercise_type: string, unit_calories: number }>();

        const missingTypes = exerciseTypes.filter(type => !cachedMetadata.results.find(m => m.exercise_type === type));

        let finalMetadata = [...cachedMetadata.results];

        if (missingTypes.length > 0) {
          const aiService = new AIService(c.env.GEMINI_API_KEY, db);
          try {
            const aiResults = await aiService.calculateExerciseCalories(missingTypes.map(t => ({ exercise_type: t, total_count: 1 })));
            
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
        
        enrichedStats = stats.results.map(stat => {
          const meta = finalMetadata.find(m => m.exercise_type === stat.exercise_type);
          const unitCal = meta?.unit_calories || 0;
          return {
            ...stat,
            estimated_calories: Math.round(unitCal * stat.total_count * 10) / 10
          };
        });
      }

      // 2. 支配領域（ランニング・ウォーキング）の集計と消費カロリー算出
      let terrDateFilter = '';
      if (period === 'daily') {
        terrDateFilter = "AND date(captured_at) = date('now')";
      } else if (period === 'weekly') {
        terrDateFilter = "AND captured_at >= datetime('now', '-7 days')";
      }

      const territories = await db.prepare(`
        SELECT 
          distance_m,
          duration_sec,
          avg_speed_kmh
        FROM territories
        WHERE user_id = ? ${terrDateFilter}
      `).bind(user.sub).all<{ distance_m: number, duration_sec: number, avg_speed_kmh: number }>();

      const userWeight = await db.prepare('SELECT current_weight FROM users WHERE id = ?').bind(user.sub).first<{ current_weight: number | null }>();
      const weight = userWeight?.current_weight || 70;

      let runningCalories = 0;
      let runningDistance = 0;
      let walkingCalories = 0;
      let walkingDistance = 0;

      for (const t of territories.results) {
        const dist = t.distance_m || 0;
        const dur = t.duration_sec || 0;
        const speed = t.avg_speed_kmh || 0;
        if (dist <= 0 || dur <= 0) continue;

        const isRunning = speed >= 6.0;
        const mets = isRunning ? 8.3 : 3.5;
        const hours = dur / 3600;
        const cal = 1.05 * mets * hours * weight;

        if (isRunning) {
          runningCalories += cal;
          runningDistance += dist;
        } else {
          walkingCalories += cal;
          walkingDistance += dist;
        }
      }

      if (runningDistance > 0) {
        enrichedStats.push({
          exercise_type: 'ランニング（支配領域）',
          total_count: Math.round(runningDistance),
          estimated_calories: Math.round(runningCalories * 10) / 10
        });
      }
      if (walkingDistance > 0) {
        enrichedStats.push({
          exercise_type: 'ウォーキング（支配領域）',
          total_count: Math.round(walkingDistance),
          estimated_calories: Math.round(walkingCalories * 10) / 10
        });
      }
      
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
      const aiService = new AIService(c.env.GEMINI_API_KEY, db);
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
        const newUnlocked: string[] = [];
        if (await checkAndUnlockCalorieChampion(db, user.sub)) newUnlocked.push('calorie_champion');
        if (await checkAndUnlockCalorieBurst(db, user.sub)) newUnlocked.push('calorie_burst');

        const newAchievementsData = newUnlocked.map(id => {
          const def = ACHIEVEMENT_DEFINITIONS[id];
          return {
            id,
            title: def?.title || id,
            icon: def?.icon || '🏆',
            description: def?.description || ''
          };
        });

        const xpResult = await addXpAndCheckLevelUp(db, user.sub, 20);

        return c.json({
          ...analysis,
          id: mealId,
          created_at: new Date().toISOString(),
          newAchievements: newAchievementsData,
          xpInfo: xpResult
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
    '/schedules',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      try {
        const list = await db.prepare('SELECT id, user_id, title, scheduled_at, completed, created_at FROM training_schedules WHERE user_id = ? ORDER BY scheduled_at ASC')
          .bind(user.sub)
          .all();
        return c.json({ schedules: list.results });
      } catch (e) {
        console.error('Failed to get schedules:', e);
        return c.json({ error: 'スケジュールの取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/schedules',
    firebaseAuth,
    validate(createTrainingScheduleSchema),
    async (c) => {
      const data = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const scheduleId = crypto.randomUUID();
      try {
        await db.prepare('INSERT INTO training_schedules (id, user_id, title, scheduled_at, completed) VALUES (?, ?, ?, ?, 0)')
          .bind(scheduleId, user.sub, data.title, data.scheduled_at)
          .run();
        return c.json({
          success: true,
          schedule: {
            id: scheduleId,
            user_id: user.sub,
            title: data.title,
            scheduled_at: data.scheduled_at,
            completed: 0
          }
        }, 201);
      } catch (e) {
        console.error('Failed to create schedule:', e);
        return c.json({ error: 'スケジュールの追加に失敗しました。' }, 500);
      }
    }
  )
  .delete(
    '/schedules/:id',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      const scheduleId = c.req.param('id');
      try {
        await db.prepare('DELETE FROM training_schedules WHERE id = ? AND user_id = ?')
          .bind(scheduleId, user.sub)
          .run();
        return c.json({ success: true, message: 'スケジュールを削除しました。' });
      } catch (e) {
        console.error('Failed to delete schedule:', e);
        return c.json({ error: 'スケジュールの削除に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/schedules/:id/toggle',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      const user = c.get('firebaseUser');
      const scheduleId = c.req.param('id');
      try {
        const schedule = await db.prepare('SELECT completed FROM training_schedules WHERE id = ? AND user_id = ?')
          .bind(scheduleId, user.sub)
          .first<{ completed: number }>();
        if (!schedule) {
          return c.json({ error: 'スケジュールが見つかりません。' }, 404);
        }
        const newCompleted = schedule.completed === 1 ? 0 : 1;
        await db.prepare('UPDATE training_schedules SET completed = ? WHERE id = ? AND user_id = ?')
          .bind(newCompleted, scheduleId, user.sub)
          .run();
        return c.json({ success: true, completed: newCompleted });
      } catch (e) {
        console.error('Failed to toggle schedule:', e);
        return c.json({ error: 'ステータスの更新に失敗しました。' }, 500);
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
      const aiService = new AIService(c.env.GEMINI_API_KEY, db);

      try {
        // 1. ユーザーのメッセージを保存
        const userMsgId = crypto.randomUUID();
        await db.prepare('INSERT INTO chat_messages (id, user_id, sender, message) VALUES (?, ?, ?, ?)')
          .bind(userMsgId, user.sub, 'user', message)
          .run();

        const isScholarUnlocked = await checkAndUnlockChatScholar(db, user.sub);

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
        const todayIso = new Date().toISOString();
        const systemInstruction = `
あなたはPhysiProof（フィジプルーフ）という健康管理・領土獲得ゲームアプリの専属AIパーソナルコーチです。
ユーザーは日々の運動記録、食事のカロリー、マップでのテリトリー獲得などを頑張っています。
ユーザーからの健康、ダイエット、筋トレ、食事に関する質問に対して、専門的でありながら親しみやすくモチベーションを高める口調で答えてください。
回答は簡潔にし（スマホ画面で見やすいため）、常にポジティブで具体的なアドバイス（例: 「スクワットをあと10回増やしてみよう！」「タンパク質が足りないから鶏胸肉がおすすめ！」など）を心がけてください。
また、アプリのコンセプトである「支配エリア」「運動証明」「PFCバランス」などの用語に触れられるときは、積極的に関連付けてアドバイスしてください。

【トレーニングスケジュールの自動追加】
ユーザーからトレーニングスケジュール（計画・予定・予約）をカレンダーや予定に入れたいと依頼された場合、ユーザーが指定した日時とトレーニング内容（例: 「スクワット50回」「ランニング」など）を解釈し、必ず回答の末尾に、以下のマーカーフォーマットを付加して出力してください（必ず1行で出力すること）：
__SCHEDULE_ADD__:{"title":"予定のタイトル","scheduled_at":"ISO8601形式の予定日時"}

※現在の日時は ${todayIso} です。「明日」「明後日」「来週の水曜の20時」などの相対的・曖昧な表現は、この現在日時を基準にして正確な未来 of ISO8601日時（日本時間等のタイムゾーン情報を含めても構いません。例: 2026-06-22T20:00:00）を算出して指定してください。
※ユーザーからのトレーニング計画の追加依頼には快く応じる返答を書いてください（例：「了解！明日の20時にスクワット50回の予定をカレンダーに登録しておいたよ！頑張ろう！」など）。
※このマーカー部分はバックエンドで自動的にカレンダーに登録され、ユーザー画面上には表示されません。必ず正確なJSON形式にしてください。
`;

        // 4. AIの返答を生成
        const aiResponse = await aiService.generateChatResponse(systemInstruction, formattedHistory);

        // マーカーの解析とDB登録
        const marker = '__SCHEDULE_ADD__:';
        let cleanAiResponse = aiResponse;
        
        if (aiResponse.includes(marker)) {
          const lines = aiResponse.split('\n');
          const cleanLines: string[] = [];
          
          for (const line of lines) {
            if (line.includes(marker)) {
              try {
                const jsonStr = line.substring(line.indexOf(marker) + marker.length).trim();
                const scheduleData = JSON.parse(jsonStr);
                if (scheduleData && scheduleData.title && scheduleData.scheduled_at) {
                  const scheduleId = crypto.randomUUID();
                  
                  // 日付フォーマットの調整
                  let scheduledAt = scheduleData.scheduled_at;
                  try {
                    const d = new Date(scheduledAt);
                    if (!isNaN(d.getTime())) {
                      scheduledAt = d.toISOString();
                    }
                  } catch (e) {
                    console.error('Failed to parse date in marker:', e);
                  }

                  await db.prepare('INSERT INTO training_schedules (id, user_id, title, scheduled_at, completed) VALUES (?, ?, ?, ?, 0)')
                    .bind(scheduleId, user.sub, scheduleData.title, scheduledAt)
                    .run();
                  console.log('AI automatically scheduled training:', scheduleData);
                }
              } catch (parseErr) {
                console.error('Failed to parse AI schedule marker:', parseErr);
              }
            } else {
              cleanLines.push(line);
            }
          }
          cleanAiResponse = cleanLines.join('\n').trim();
        }

        // 5. AIの返答を保存
        const aiMsgId = crypto.randomUUID();
        await db.prepare('INSERT INTO chat_messages (id, user_id, sender, message) VALUES (?, ?, ?, ?)')
          .bind(aiMsgId, user.sub, 'ai', cleanAiResponse)
          .run();

        const newUnlocked: string[] = [];
        if (isScholarUnlocked) newUnlocked.push('chat_scholar');

        const newAchievementsData = newUnlocked.map(id => {
          const def = ACHIEVEMENT_DEFINITIONS[id];
          return {
            id,
            title: def?.title || id,
            icon: def?.icon || '🏆',
            description: def?.description || ''
          };
        });

        return c.json({
          userMessage: { id: userMsgId, sender: 'user', message, created_at: new Date().toISOString() },
          aiMessage: { id: aiMsgId, sender: 'ai', message: cleanAiResponse, created_at: new Date().toISOString() },
          newAchievements: newAchievementsData
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

          if (isCompleted === 1) {
            await checkAndUnlockMissionChampion(db, user.sub);
          }

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

        const isFirstFortressUnlocked = await checkAndUnlockFirstFortress(db, user.sub);

        const newUnlocked: string[] = [];
        if (isFirstFortressUnlocked) newUnlocked.push('first_fortress');

        const newAchievementsData = newUnlocked.map(id => {
          const def = ACHIEVEMENT_DEFINITIONS[id];
          return {
            id,
            title: def?.title || id,
            icon: def?.icon || '🏆',
            description: def?.description || ''
          };
        });

        const xpResult = await addXpAndCheckLevelUp(db, user.sub, 100);

        return c.json({ 
          success: true, 
          message: '領土を要塞化しました！', 
          newFortificationLevel: newLevel,
          newAchievements: newAchievementsData,
          xpInfo: xpResult
        });
      } catch (e: any) {
        console.error('Failed to claim mission reward:', e);
        return c.json({ error: '報酬の受け取りに失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/settings',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const settings = await db.prepare('SELECT key, value FROM system_settings').all<{ key: string; value: string }>();
        const settingsMap: Record<string, string> = {};
        for (const row of settings.results) {
          settingsMap[row.key] = row.value;
        }
        return c.json({ settings: settingsMap });
      } catch (e: any) {
        console.error('Admin settings get error:', e);
        return c.json({ error: 'システム設定の取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/admin/settings',
    firebaseAuth,
    zValidator('json', systemSettingsSchema),
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      const body = c.req.valid('json');
      try {
        const statements = [
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('max_territories', body.max_territories),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_home_menu', body.show_home_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_map_menu', body.show_map_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_exercise_menu', body.show_exercise_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_ai_predict_menu', body.show_ai_predict_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_meal_menu', body.show_meal_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_friends_menu', body.show_friends_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_team_menu', body.show_team_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_ranking_menu', body.show_ranking_menu ?? 'true'),
          db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind('show_chat_menu', body.show_chat_menu ?? 'true'),
        ];
        await db.batch(statements);
        return c.json({ success: true, message: 'システム設定を更新しました。' });
      } catch (e: any) {
        console.error('Admin settings post error:', e);
        return c.json({ error: 'システム設定の更新に失敗しました。' }, 500);
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
        const users = await db.prepare('SELECT id, login_id, password_hash as password, name, role, current_weight, target_weight, target_calories_burned, target_calories_consumed, gender, age, height, level, xp, status_points, stat_str, stat_agi, stat_def, stat_vit, created_at FROM users').all();
        return c.json({ users: users.results });
      } catch (e: any) {
        console.error('Admin users error:', e);
        return c.json({ error: 'ユーザー一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/achievements',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const users = await db.prepare('SELECT id, name FROM users').all<{ id: string, name: string }>();
        const achievements = await db.prepare('SELECT id, user_id, achievement_id, unlocked_at FROM achievements').all<{ id: string, user_id: string, achievement_id: string, unlocked_at: string }>();
        return c.json({ users: users.results, achievements: achievements.results });
      } catch (e: any) {
        console.error('Admin achievements error:', e);
        return c.json({ error: '実績データの取得に失敗しました。' }, 500);
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
  .post(
    '/admin/users/:id',
    firebaseAuth,
    validate(adminUpdateUserSchema),
    async (c) => {
      const user = c.get('firebaseUser');
      const targetUserId = c.req.param('id');
      const data = c.req.valid('json');
      const db = c.env.DB;

      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      const targetUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(targetUserId).first();
      if (!targetUser) {
        return c.json({ error: '対象のユーザーが見つかりません。' }, 404);
      }

      const keys = Object.keys(data);
      if (keys.length === 0) {
        return c.json({ success: true, message: '更新するデータがありません。' });
      }

      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => (data as any)[k]);
      values.push(targetUserId);

      try {
        await db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).bind(...values).run();
        return c.json({ success: true, message: 'ユーザー情報を更新しました。' });
      } catch (e: any) {
        console.error('Admin update user error:', e);
        return c.json({ error: 'ユーザー情報の更新に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/admin/notifications',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        const notifications = await db.prepare(`
          SELECT n.id, n.user_id, u.name as user_name, n.title, n.message, n.type, n.is_read, n.created_at
          FROM notifications n
          JOIN users u ON n.user_id = u.id
          ORDER BY n.created_at DESC
          LIMIT 100
        `).all();
        return c.json({ notifications: notifications.results });
      } catch (e: any) {
        console.error('Admin notifications error:', e);
        return c.json({ error: '通知一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/admin/notifications',
    firebaseAuth,
    validate(adminSendNotificationSchema),
    async (c) => {
      const user = c.get('firebaseUser');
      const { user_id, title, message, type } = c.req.valid('json');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      const targetUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
      if (!targetUser) {
        return c.json({ error: '送信先ユーザーが見つかりません。' }, 404);
      }

      try {
        const notifId = crypto.randomUUID();
        await db.prepare('INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)')
          .bind(notifId, user_id, title, message, type)
          .run();
        return c.json({ success: true, message: '通知を送信しました。' });
      } catch (e: any) {
        console.error('Admin create notification error:', e);
        return c.json({ error: '通知の送信に失敗しました。' }, 500);
      }
    }
  )
  .delete(
    '/admin/notifications/:id',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const notifId = c.req.param('id');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        await db.prepare('DELETE FROM notifications WHERE id = ?').bind(notifId).run();
        return c.json({ success: true, message: '通知を削除しました。' });
      } catch (e: any) {
        console.error('Admin delete notification error:', e);
        return c.json({ error: '通知の削除に失敗しました。' }, 500);
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
          SELECT t.id, t.user_id, u.name as user_name, t.latitude, t.longitude, t.area_polygon, t.area_sqm, t.fortification_level, t.captured_at, t.time_period, t.distance_m, t.duration_sec, t.avg_speed_kmh, t.ai_integrity, t.ai_reason, t.ai_confidence, t.address
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

        const aiService = new AIService(c.env.GEMINI_API_KEY_MAP || c.env.GEMINI_API_KEY, db);
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

        const aiService = new AIService(c.env.GEMINI_API_KEY, db);
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
  )
  .get(
    '/admin/api-usage',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      
      const dbUser = await db.prepare('SELECT role FROM users WHERE id = ?').bind(user.sub).first<{ role: string }>();
      if (!dbUser || dbUser.role !== 'admin') {
        return c.json({ error: '管理者権限がありません。' }, 403);
      }

      try {
        // 全体サマリー（api_type別）
        const summary = await db.prepare(`
          SELECT 
            api_type,
            COUNT(*) as total_calls,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
            ROUND(AVG(response_time_ms), 0) as avg_response_ms
          FROM api_usage_logs
          GROUP BY api_type
        `).all<{ api_type: string; total_calls: number; success_count: number; error_count: number; avg_response_ms: number }>();

        // エンドポイント別詳細
        const byEndpoint = await db.prepare(`
          SELECT 
            api_type,
            endpoint,
            COUNT(*) as total_calls,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
            ROUND(AVG(response_time_ms), 0) as avg_response_ms
          FROM api_usage_logs
          GROUP BY api_type, endpoint
          ORDER BY total_calls DESC
        `).all<{ api_type: string; endpoint: string; total_calls: number; success_count: number; error_count: number; avg_response_ms: number }>();

        // 日別推移（直近14日）
        const daily = await db.prepare(`
          SELECT 
            date(created_at) as date,
            api_type,
            COUNT(*) as total_calls,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
          FROM api_usage_logs
          WHERE created_at >= datetime('now', '-14 days')
          GROUP BY date(created_at), api_type
          ORDER BY date(created_at) DESC
        `).all<{ date: string; api_type: string; total_calls: number; error_count: number }>();

        // 直近のエラーログ（最新20件）
        const recentErrors = await db.prepare(`
          SELECT 
            id, api_type, endpoint, error_message, response_time_ms, created_at
          FROM api_usage_logs
          WHERE status = 'error'
          ORDER BY created_at DESC
          LIMIT 20
        `).all<{ id: string; api_type: string; endpoint: string; error_message: string; response_time_ms: number; created_at: string }>();

        return c.json({
          summary: summary.results,
          byEndpoint: byEndpoint.results,
          daily: daily.results,
          recentErrors: recentErrors.results
        });
      } catch (e: any) {
        console.error('Admin API usage error:', e);
        return c.json({ error: 'API使用状況の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/users',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      try {
        const users = await db.prepare('SELECT id, name, avatar_id, avatar_image FROM users ORDER BY name ASC').all();
        return c.json({ success: true, users: users.results });
      } catch (e: any) {
        console.error('Failed to list users:', e);
        return c.json({ error: 'ユーザー一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/settings',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      try {
        const settings = await db.prepare('SELECT key, value FROM system_settings').all<{ key: string; value: string }>();
        const settingsMap: Record<string, string> = {};
        for (const row of settings.results) {
          settingsMap[row.key] = row.value;
        }
        return c.json({ success: true, settings: settingsMap });
      } catch (e: any) {
        console.error('Failed to get system settings:', e);
        return c.json({ error: '設定の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/friends',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      try {
        const friends = await db.prepare(`
          SELECT 
            u.id,
            u.name,
            u.login_id,
            u.avatar_id,
            u.avatar_image,
            u.level,
            f.created_at as friend_since
          FROM friends f
          JOIN users u ON f.friend_id = u.id
          WHERE f.user_id = ?
          ORDER BY u.name ASC
        `).bind(user.sub).all();
        return c.json({ success: true, friends: friends.results || [] });
      } catch (e: any) {
        console.error('Failed to get friends:', e);
        return c.json({ error: 'フレンド一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/friends/requests',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      try {
        const requests = await db.prepare(`
          SELECT 
            fr.id as request_id,
            fr.sender_id,
            fr.created_at,
            u.name as sender_name,
            u.login_id as sender_login_id,
            u.avatar_id as sender_avatar_id,
            u.avatar_image as sender_avatar_image,
            u.level as sender_level
          FROM friend_requests fr
          JOIN users u ON fr.sender_id = u.id
          WHERE fr.receiver_id = ? AND fr.status = 'pending'
          ORDER BY fr.created_at DESC
        `).bind(user.sub).all();
        return c.json({ success: true, requests: requests.results || [] });
      } catch (e: any) {
        console.error('Failed to get friend requests:', e);
        return c.json({ error: 'フレンド申請一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/friends/search',
    firebaseAuth,
    zValidator('query', friendSearchQuerySchema),
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const { q } = c.req.valid('query');
      
      if (!q || q.trim() === '') {
        return c.json({ success: true, users: [] });
      }

      try {
        const searchTerm = `%${q.trim()}%`;
        const matchedUsers = await db.prepare(`
          SELECT 
            u.id,
            u.name,
            u.login_id,
            u.avatar_id,
            u.avatar_image,
            u.level,
            (
              SELECT status FROM friend_requests 
              WHERE sender_id = ? AND receiver_id = u.id
            ) as sent_status,
            (
              SELECT status FROM friend_requests 
              WHERE sender_id = u.id AND receiver_id = ?
            ) as received_status,
            (
              SELECT COUNT(*) FROM friends 
              WHERE user_id = ? AND friend_id = u.id
            ) as is_friend
          FROM users u
          WHERE u.id != ? AND (u.name LIKE ? OR u.login_id LIKE ?)
          LIMIT 20
        `).bind(user.sub, user.sub, user.sub, user.sub, searchTerm, searchTerm).all<{
          id: string;
          name: string;
          login_id: string;
          avatar_id: string | null;
          avatar_image: string | null;
          level: number;
          sent_status: string | null;
          received_status: string | null;
          is_friend: number;
        }>();

        const formatted = matchedUsers.results.map(u => {
          let friend_status: 'none' | 'pending_sent' | 'pending_received' | 'friend' = 'none';
          if (u.is_friend > 0) {
            friend_status = 'friend';
          } else if (u.sent_status === 'pending') {
            friend_status = 'pending_sent';
          } else if (u.received_status === 'pending') {
            friend_status = 'pending_received';
          }
          return {
            id: u.id,
            name: u.name,
            login_id: u.login_id,
            avatar_id: u.avatar_id || 'default',
            avatar_image: u.avatar_image || null,
            level: u.level || 1,
            friend_status
          };
        });

        return c.json({ success: true, users: formatted });
      } catch (e: any) {
        console.error('Failed to search users:', e);
        return c.json({ error: 'ユーザー検索に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/friends/request',
    firebaseAuth,
    zValidator('json', sendFriendRequestSchema),
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const { target_user_id } = c.req.valid('json');

      if (target_user_id === user.sub) {
        return c.json({ error: '自分自身にフレンド申請を送ることはできません。' }, 400);
      }

      try {
        const existingFriend = await db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?')
          .bind(user.sub, target_user_id).first();
        if (existingFriend) {
          return c.json({ error: '既にフレンドです。' }, 400);
        }

        const existingReq = await db.prepare('SELECT id, status FROM friend_requests WHERE sender_id = ? AND receiver_id = ?')
          .bind(user.sub, target_user_id).first<{ id: string, status: string }>();

        if (existingReq) {
          if (existingReq.status === 'pending') {
            return c.json({ error: '既にフレンド申請を送信済みです。' }, 400);
          }
          await db.prepare("UPDATE friend_requests SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(existingReq.id).run();
        } else {
          const reqId = crypto.randomUUID();
          await db.prepare("INSERT INTO friend_requests (id, sender_id, receiver_id, status) VALUES (?, ?, ?, 'pending')")
            .bind(reqId, user.sub, target_user_id).run();
        }

        return c.json({ success: true, message: 'フレンド申請を送信しました。' });
      } catch (e: any) {
        console.error('Failed to send friend request:', e);
        return c.json({ error: 'フレンド申請の送信に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/friends/request/respond',
    firebaseAuth,
    zValidator('json', respondFriendRequestSchema),
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const { request_id, action } = c.req.valid('json');

      try {
        const reqRow = await db.prepare('SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?')
          .bind(request_id, user.sub).first<{ id: string, sender_id: string, receiver_id: string, status: string }>();

        if (!reqRow) {
          return c.json({ error: '該当するフレンド申請が見つかりません。' }, 404);
        }

        if (action === 'accept') {
          await db.batch([
            db.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(request_id),
            db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)").bind(reqRow.sender_id, reqRow.receiver_id),
            db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)").bind(reqRow.receiver_id, reqRow.sender_id),
          ]);
          return c.json({ success: true, message: 'フレンド申請を承認しました。' });
        } else {
          await db.prepare("UPDATE friend_requests SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(request_id);
          return c.json({ success: true, message: 'フレンド申請を拒否しました。' });
        }
      } catch (e: any) {
        console.error('Failed to respond friend request:', e);
        return c.json({ error: 'フレンド申請への回答処理に失敗しました。' }, 500);
      }
    }
  )
  .delete(
    '/friends/:friendId',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const friendId = c.req.param('friendId');

      try {
        await db.batch([
          db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').bind(user.sub, friendId, friendId, user.sub),
          db.prepare('DELETE FROM friend_requests WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)').bind(user.sub, friendId, friendId, user.sub)
        ]);
        return c.json({ success: true, message: 'フレンドを解除しました。' });
      } catch (e: any) {
        console.error('Failed to remove friend:', e);
        return c.json({ error: 'フレンド解除に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/users/me',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      try {
        const dbUser = await db.prepare(`
          SELECT 
            u.id, u.name, u.avatar_id, u.avatar_image, u.login_id, u.role, 
            u.current_weight, u.target_weight, u.target_calories_burned, u.target_calories_consumed, 
            u.gender, u.age, u.height, u.level, u.xp, u.status_points, 
            u.stat_str, u.stat_agi, u.stat_def, u.stat_vit, u.team_id, t.name as team_name
          FROM users u
          LEFT JOIN teams t ON u.team_id = t.id
          WHERE u.id = ?
        `)
          .bind(user.sub)
          .first();
        if (!dbUser) {
          return c.json({ error: 'ユーザーが見つかりません。' }, 404);
        }
        return c.json({ success: true, user: dbUser });
      } catch (e: any) {
        console.error('Failed to get user profile:', e);
        return c.json({ error: 'プロフィール取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/users/me/allocate-stats',
    firebaseAuth,
    validate(allocateStatsSchema),
    async (c) => {
      const { str, agi, def, vit } = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const dbUser = await db.prepare('SELECT status_points, stat_str, stat_agi, stat_def, stat_vit FROM users WHERE id = ?')
          .bind(user.sub)
          .first<{ status_points: number, stat_str: number, stat_agi: number, stat_def: number, stat_vit: number }>();

        if (!dbUser) {
          return c.json({ error: 'ユーザーが見つかりません。' }, 404);
        }

        const totalRequested = str + agi + def + vit;
        if (totalRequested > dbUser.status_points) {
          return c.json({ error: 'ステータスポイントが不足しています。' }, 400);
        }

        const newStr = dbUser.stat_str + str;
        const newAgi = dbUser.stat_agi + agi;
        const newDef = dbUser.stat_def + def;
        const newVit = dbUser.stat_vit + vit;
        const newPoints = dbUser.status_points - totalRequested;

        await db.prepare('UPDATE users SET stat_str = ?, stat_agi = ?, stat_def = ?, stat_vit = ?, status_points = ? WHERE id = ?')
          .bind(newStr, newAgi, newDef, newVit, newPoints, user.sub)
          .run();

        return c.json({
          success: true,
          message: 'ステータスを更新しました。',
          stats: {
            status_points: newPoints,
            stat_str: newStr,
            stat_agi: newAgi,
            stat_def: newDef,
            stat_vit: newVit
          }
        });
      } catch (e: any) {
        console.error('Failed to allocate stats:', e);
        return c.json({ error: 'ステータス更新に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/notifications',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      try {
        const list = await db.prepare('SELECT id, user_id, title, message, type, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
          .bind(user.sub)
          .all();
        return c.json({ notifications: list.results });
      } catch (e) {
        console.error('Failed to get notifications:', e);
        return c.json({ error: '通知の取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/notifications/:id/read',
    firebaseAuth,
    async (c) => {
      const notifId = c.req.param('id');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      try {
        await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
          .bind(notifId, user.sub)
          .run();
        return c.json({ success: true, message: '通知を既読にしました。' });
      } catch (e) {
        console.error('Failed to read notification:', e);
        return c.json({ error: '通知の更新に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/teams',
    firebaseAuth,
    validate(createTeamSchema),
    async (c) => {
      const { name } = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;
      const teamId = crypto.randomUUID();

      try {
        const existing = await db.prepare('SELECT id FROM teams WHERE name = ?').bind(name).first();
        if (existing) {
          return c.json({ error: '同名のチームが既に存在します。' }, 400);
        }

        await db.batch([
          db.prepare('INSERT INTO teams (id, name, owner_id) VALUES (?, ?, ?)')
            .bind(teamId, name, user.sub),
          db.prepare('UPDATE users SET team_id = ? WHERE id = ?')
            .bind(teamId, user.sub),
          db.prepare('UPDATE territories SET team_id = ? WHERE user_id = ?')
            .bind(teamId, user.sub)
        ]);

        return c.json({ success: true, teamId, name });
      } catch (e: any) {
        console.error('Failed to create team:', e);
        return c.json({ error: 'チームの作成に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/teams/join',
    firebaseAuth,
    validate(joinTeamSchema),
    async (c) => {
      const { team_id } = c.req.valid('json');
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const team = await db.prepare('SELECT id, name FROM teams WHERE id = ?').bind(team_id).first();
        if (!team) {
          return c.json({ error: '指定されたチームが存在しません。' }, 404);
        }

        await db.batch([
          db.prepare('UPDATE users SET team_id = ? WHERE id = ?')
            .bind(team_id, user.sub),
          db.prepare('UPDATE territories SET team_id = ? WHERE user_id = ?')
            .bind(team_id, user.sub)
        ]);

        return c.json({ success: true, teamId: team_id, name: team.name });
      } catch (e: any) {
        console.error('Failed to join team:', e);
        return c.json({ error: 'チームへの参加に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/teams/leave',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const dbUser = await db.prepare('SELECT team_id FROM users WHERE id = ?').bind(user.sub).first<{ team_id: string | null }>();
        if (!dbUser || !dbUser.team_id) {
          return c.json({ error: 'チームに所属していません。' }, 400);
        }

        await db.batch([
          db.prepare('UPDATE users SET team_id = NULL WHERE id = ?').bind(user.sub),
          db.prepare('UPDATE territories SET team_id = NULL WHERE user_id = ?').bind(user.sub)
        ]);

        return c.json({ success: true, message: 'チームを脱退しました。' });
      } catch (e: any) {
        console.error('Failed to leave team:', e);
        return c.json({ error: 'チームからの脱退に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/teams/me',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const dbUser = await db.prepare('SELECT team_id FROM users WHERE id = ?').bind(user.sub).first<{ team_id: string | null }>();
        if (!dbUser || !dbUser.team_id) {
          return c.json({ success: true, team: null });
        }

        const team = await db.prepare('SELECT id, name, owner_id, created_at FROM teams WHERE id = ?').bind(dbUser.team_id).first<{ id: string, name: string, owner_id: string, created_at: string }>();
        if (!team) {
          return c.json({ success: true, team: null });
        }

        const members = await db.prepare('SELECT id, name, level, avatar_id, avatar_image FROM users WHERE team_id = ?').bind(dbUser.team_id).all();

        return c.json({
          success: true,
          team: {
            id: team.id,
            name: team.name,
            owner_id: team.owner_id,
            created_at: team.created_at,
            members: members.results
          }
        });
      } catch (e: any) {
        console.error('Failed to get team info:', e);
        return c.json({ error: 'チーム情報の取得に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/teams',
    firebaseAuth,
    async (c) => {
      const db = c.env.DB;
      try {
        const teams = await db.prepare(`
          SELECT 
            t.id, t.name, t.owner_id, t.created_at, u.name as owner_name,
            (SELECT COUNT(*) FROM users WHERE team_id = t.id) as member_count
          FROM teams t
          JOIN users u ON t.owner_id = u.id
          ORDER BY member_count DESC, t.created_at DESC
        `).all();

        return c.json({ success: true, teams: teams.results });
      } catch (e: any) {
        console.error('Failed to list teams:', e);
        return c.json({ error: 'チーム一覧の取得に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/teams/battles',
    firebaseAuth,
    validate(createTeamBattleSchema),
    async (c) => {
      const data = c.req.valid('json') as CreateTeamBattle;
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const myTeam = await db.prepare(`
          SELECT t.id FROM teams t
          JOIN users u ON u.team_id = t.id
          WHERE u.id = ? AND t.owner_id = ?
        `).bind(user.sub, user.sub).first<{ id: string }>();
        if (!myTeam) {
          return c.json({ error: 'チーム対戦の申請はチームリーダーのみ行えます。' }, 403);
        }
        if (data.opponent_team_ids.includes(myTeam.id)) {
          return c.json({ error: '自分のチームを対戦相手には選べません。' }, 400);
        }

        const opponentPlaceholders = data.opponent_team_ids.map(() => '?').join(', ');
        const opponents = await db.prepare(`SELECT id FROM teams WHERE id IN (${opponentPlaceholders})`)
          .bind(...data.opponent_team_ids).all<{ id: string }>();
        if (opponents.results.length !== data.opponent_team_ids.length) {
          return c.json({ error: '選択した対戦相手の中に見つからないチームがあります。' }, 404);
        }

        const startsAt = Date.parse(data.starts_at);
        const endsAt = Date.parse(data.ends_at);
        if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt <= Date.now() || endsAt <= startsAt) {
          return c.json({ error: '対戦開始は未来の日時にし、終了日時は開始日時より後にしてください。' }, 400);
        }

        const battleId = crypto.randomUUID();
        const statements = [
          db.prepare(`
          INSERT INTO team_battles
            (id, team_a_id, team_b_id, created_by, starts_at, ends_at)
          VALUES (?, ?, ?, ?, ?, ?)
          `).bind(battleId, myTeam.id, data.opponent_team_ids[0], user.sub, data.starts_at, data.ends_at),
          db.prepare(`
            INSERT INTO team_battle_participants
              (battle_id, team_id, role, invitation_status, invited_at, responded_at)
            VALUES (?, ?, 'host', 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `).bind(battleId, myTeam.id),
          db.prepare(`
            INSERT OR IGNORE INTO team_battle_members (battle_id, user_id, team_id)
            SELECT ?, id, team_id FROM users WHERE team_id = ?
          `).bind(battleId, myTeam.id),
          ...data.opponent_team_ids.map((teamId) => db.prepare(`
            INSERT INTO team_battle_participants
              (battle_id, team_id, role, invitation_status, invited_at)
            VALUES (?, ?, 'opponent', 'pending', CURRENT_TIMESTAMP)
          `).bind(battleId, teamId)),
        ];
        await db.batch(statements);

        return c.json({ success: true, battle_id: battleId });
      } catch (e) {
        console.error('Failed to create team battle:', e);
        return c.json({ error: '対戦の申し込みに失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/teams/battles/:id/accept',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const battleId = c.req.param('id');
      const db = c.env.DB;

      try {
        const myTeam = await db.prepare(`
          SELECT t.id FROM teams t
          JOIN users u ON u.team_id = t.id
          WHERE u.id = ? AND t.owner_id = ?
        `).bind(user.sub, user.sub).first<{ id: string }>();
        if (!myTeam) return c.json({ error: 'チームリーダーのみ対戦申請を承認できます。' }, 403);

        const invitation = await db.prepare(`
          SELECT p.invitation_status, b.status, b.starts_at
          FROM team_battle_participants p
          JOIN team_battles b ON b.id = p.battle_id
          WHERE p.battle_id = ? AND p.team_id = ? AND p.role = 'opponent'
        `).bind(battleId, myTeam.id).first<{ invitation_status: string; status: string; starts_at: string }>();
        if (!invitation) return c.json({ error: '自チーム宛ての対戦申請が見つかりません。' }, 403);
        if (invitation.status !== 'pending' || invitation.invitation_status !== 'pending') {
          return c.json({ error: 'この対戦申請はすでに処理されています。' }, 409);
        }
        if (Date.parse(invitation.starts_at) <= Date.now()) {
          return c.json({ error: '開始日時を過ぎた申請は承認できません。' }, 409);
        }

        const acceptance = await db.batch([
          db.prepare(`
            UPDATE team_battle_participants
            SET invitation_status = 'accepted', responded_at = CURRENT_TIMESTAMP
            WHERE battle_id = ? AND team_id = ? AND role = 'opponent' AND invitation_status = 'pending'
              AND EXISTS (
                SELECT 1 FROM team_battles
                WHERE id = ? AND status = 'pending' AND julianday(starts_at) > julianday(CURRENT_TIMESTAMP)
              )
              AND EXISTS (
                SELECT 1 FROM teams t JOIN users u ON u.team_id = t.id
                WHERE t.id = ? AND u.id = ? AND t.owner_id = u.id
              )
          `).bind(battleId, myTeam.id, battleId, myTeam.id, user.sub),
          db.prepare(`
            INSERT OR IGNORE INTO team_battle_members (battle_id, user_id, team_id)
            SELECT ?, id, team_id FROM users
            WHERE team_id = ?
              AND EXISTS (
                SELECT 1 FROM team_battle_participants
                WHERE battle_id = ? AND team_id = ? AND invitation_status = 'accepted'
              )
              AND EXISTS (SELECT 1 FROM team_battles WHERE id = ? AND status = 'pending')
          `).bind(battleId, myTeam.id, battleId, myTeam.id, battleId),
          db.prepare(`
            INSERT OR IGNORE INTO team_battle_members (battle_id, user_id, team_id)
            SELECT ?, u.id, u.team_id FROM users u
            WHERE u.team_id = (
              SELECT team_id FROM team_battle_participants
              WHERE battle_id = ? AND role = 'host'
            )
              AND NOT EXISTS (
                SELECT 1 FROM team_battle_members m
                WHERE m.battle_id = ? AND m.team_id = u.team_id
              )
              AND EXISTS (SELECT 1 FROM team_battles WHERE id = ? AND status = 'pending')
          `).bind(battleId, battleId, battleId, battleId),
          db.prepare(`
            UPDATE team_battles
            SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'pending'
              AND NOT EXISTS (
                SELECT 1 FROM team_battle_participants
                WHERE battle_id = ? AND invitation_status <> 'accepted'
              )
          `).bind(battleId, battleId),
        ]);
        if (acceptance[0].meta.changes === 0) {
          return c.json({ error: 'この対戦申請はすでに処理されています。' }, 409);
        }
        return c.json({ success: true, battle_ready: acceptance[3].meta.changes > 0 });
      } catch (e) {
        console.error('Failed to accept team battle:', e);
        return c.json({ error: '対戦の承認に失敗しました。' }, 500);
      }
    }
  )
  .post(
    '/teams/battles/:id/reject',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const battleId = c.req.param('id');
      const db = c.env.DB;

      try {
        const myTeam = await db.prepare(`
          SELECT t.id FROM teams t
          JOIN users u ON u.team_id = t.id
          WHERE u.id = ? AND t.owner_id = ?
        `).bind(user.sub, user.sub).first<{ id: string }>();
        if (!myTeam) return c.json({ error: 'チームリーダーのみ対戦申請を辞退できます。' }, 403);

        const invitation = await db.prepare(`
          SELECT p.invitation_status, b.status
          FROM team_battle_participants p
          JOIN team_battles b ON b.id = p.battle_id
          WHERE p.battle_id = ? AND p.team_id = ? AND p.role = 'opponent'
        `).bind(battleId, myTeam.id).first<{ invitation_status: string; status: string }>();
        if (!invitation) return c.json({ error: '自チーム宛ての対戦申請が見つかりません。' }, 403);
        if (invitation.status !== 'pending' || invitation.invitation_status !== 'pending') {
          return c.json({ error: 'この対戦申請はすでに処理されています。' }, 409);
        }

        const rejection = await db.batch([
          db.prepare(`
            UPDATE team_battle_participants
            SET invitation_status = 'rejected', responded_at = CURRENT_TIMESTAMP
            WHERE battle_id = ? AND team_id = ? AND role = 'opponent' AND invitation_status = 'pending'
              AND EXISTS (SELECT 1 FROM team_battles WHERE id = ? AND status = 'pending')
          `).bind(battleId, myTeam.id, battleId),
          db.prepare(`
            UPDATE team_battles SET status = 'rejected'
            WHERE id = ? AND status = 'pending'
              AND EXISTS (
                SELECT 1 FROM team_battle_participants
                WHERE battle_id = ? AND team_id = ? AND invitation_status = 'rejected'
              )
          `).bind(battleId, battleId, myTeam.id),
        ]);
        if (rejection[0].meta.changes === 0) {
          return c.json({ error: 'この対戦申請はすでに処理されています。' }, 409);
        }
        return c.json({ success: true });
      } catch (e) {
        console.error('Failed to reject team battle:', e);
        return c.json({ error: '対戦申請の辞退に失敗しました。' }, 500);
      }
    }
  )
  .get(
    '/teams/battles',
    firebaseAuth,
    async (c) => {
      const user = c.get('firebaseUser');
      const db = c.env.DB;

      try {
        const dbUser = await db.prepare('SELECT team_id FROM users WHERE id = ?')
          .bind(user.sub).first<{ team_id: string | null }>();
        const teamId = dbUser?.team_id || '';
        type BattleListRow = {
          id: string;
          starts_at: string;
          ends_at: string;
          created_at: string;
          display_status: string;
          participant_team_id: string | null;
          participant_team_name: string | null;
          role: string | null;
          invitation_status: string | null;
          score: number;
        };
        const battleRows = await db.prepare(`
          SELECT
            b.id, b.starts_at, b.ends_at, b.created_at,
            CASE
              WHEN b.status = 'pending' AND julianday(CURRENT_TIMESTAMP) >= julianday(b.starts_at) THEN 'expired'
              WHEN b.status = 'accepted' AND julianday(CURRENT_TIMESTAMP) >= julianday(b.ends_at) THEN 'completed'
              WHEN b.status = 'accepted' AND julianday(CURRENT_TIMESTAMP) >= julianday(b.starts_at) THEN 'active'
              WHEN b.status = 'accepted' THEN 'scheduled'
              ELSE b.status
            END AS display_status,
            p.team_id AS participant_team_id,
            t.name AS participant_team_name,
            p.role,
            p.invitation_status,
            COALESCE(SUM(c.points), 0) AS score
          FROM team_battles b
          LEFT JOIN team_battle_participants p ON p.battle_id = b.id
          LEFT JOIN teams t ON t.id = p.team_id
          LEFT JOIN team_battle_contributions c
            ON c.battle_id = b.id AND c.team_id = p.team_id
          WHERE EXISTS (
              SELECT 1 FROM team_battle_participants visible
              WHERE visible.battle_id = b.id AND visible.team_id = ?
            )
            OR EXISTS (
              SELECT 1 FROM team_battle_members m
              WHERE m.battle_id = b.id AND m.user_id = ?
            )
          GROUP BY b.id, p.team_id, p.role, p.invitation_status, t.name
          ORDER BY b.created_at DESC,
            CASE WHEN p.role = 'host' THEN 0 ELSE 1 END,
            t.name COLLATE NOCASE
        `).bind(teamId, user.sub).all<BattleListRow>();

        const battleById = new Map<string, TeamBattleSummary>();
        for (const row of battleRows.results) {
          let battle = battleById.get(row.id);
          if (!battle) {
            battle = {
              id: row.id,
              participants: [],
              starts_at: row.starts_at,
              ends_at: row.ends_at,
              display_status: teamBattleStatusSchema.parse(row.display_status),
            };
            battleById.set(row.id, battle);
          }
          if (row.participant_team_id && row.participant_team_name && row.role && row.invitation_status) {
            battle.participants.push({
              team_id: row.participant_team_id,
              team_name: row.participant_team_name,
              role: teamBattleParticipantRoleSchema.parse(row.role),
              invitation_status: teamBattleInvitationStatusSchema.parse(row.invitation_status),
              score: row.score,
            });
          }
        }

        return c.json({ success: true, battles: Array.from(battleById.values()) });
      } catch (e) {
        console.error('Failed to list team battles:', e);
        return c.json({ error: 'チーム対戦一覧の取得に失敗しました。' }, 500);
      }
    }
  );

// --- 実績解除用ヘルパー関数 ---
async function unlockAchievement(db: D1Database, userId: string, achievementId: string): Promise<boolean> {
  try {
    const exist = await db.prepare('SELECT id FROM achievements WHERE user_id = ? AND achievement_id = ?')
      .bind(userId, achievementId)
      .first();
    if (exist) {
      return false; // すでに解除済み
    }
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO achievements (id, user_id, achievement_id) VALUES (?, ?, ?)')
      .bind(id, userId, achievementId)
      .run();
    return true; // 新規解除
  } catch (err) {
    console.error('Failed to unlock achievement:', achievementId, err);
    return false;
  }
}

async function checkAndUnlockCalorieBurst(db: D1Database, userId: string): Promise<boolean> {
  try {
    const userWeight = await db.prepare('SELECT current_weight FROM users WHERE id = ?').bind(userId).first<{ current_weight: number | null }>();
    const weight = userWeight?.current_weight || 70;

    let totalCalories = 0;

    // 1. 筋肉運動（プッシュアップ等）の消費カロリー算出
    const stats = await db.prepare(`
      SELECT 
        exercise_type,
        SUM(count) as total_count
      FROM pushup_measurements
      WHERE user_id = ? AND date(timestamp) = date('now')
      GROUP BY exercise_type
    `).bind(userId).all<{ exercise_type: string, total_count: number }>();

    if (stats.results.length > 0) {
      const exerciseTypes = stats.results.map(s => s.exercise_type);
      const cachedMetadata = await db.prepare(`
        SELECT exercise_type, unit_calories FROM exercise_metadata
        WHERE exercise_type IN (${exerciseTypes.map(() => '?').join(',')})
      `).bind(...exerciseTypes).all<{ exercise_type: string, unit_calories: number }>();

      for (const stat of stats.results) {
        const meta = cachedMetadata.results.find(m => m.exercise_type === stat.exercise_type);
        const unitCal = meta?.unit_calories || 0;
        totalCalories += unitCal * stat.total_count;
      }
    }

    // 2. 支配領域（ランニング・ウォーキング）の消費カロリー算出
    const territories = await db.prepare(`
      SELECT 
        distance_m,
        duration_sec,
        avg_speed_kmh
      FROM territories
      WHERE user_id = ? AND date(captured_at) = date('now')
    `).bind(userId).all<{ distance_m: number, duration_sec: number, avg_speed_kmh: number }>();

    let territoryCalories = 0;
    for (const t of territories.results) {
      const dist = t.distance_m || 0;
      const dur = t.duration_sec || 0;
      const speed = t.avg_speed_kmh || 0;
      if (dist <= 0 || dur <= 0) continue;

      const isRunning = speed >= 6.0;
      const mets = isRunning ? 8.3 : 3.5;
      const hours = dur / 3600;
      territoryCalories += 1.05 * mets * hours * weight;
    }

    totalCalories += territoryCalories;

    if (totalCalories >= 1000) {
      return await unlockAchievement(db, userId, 'calorie_burst');
    }
  } catch (err) {
    console.error('Failed to check calorie burst achievement:', err);
  }
  return false;
}

async function checkAndUnlockPushupMaster(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT SUM(count) as total FROM pushup_measurements WHERE user_id = ?')
      .bind(userId)
      .first<{ total: number | null }>();
    if (res && res.total !== null && res.total >= 100) {
      return await unlockAchievement(db, userId, 'pushup_master');
    }
  } catch (err) {
    console.error('Failed to check pushup_master achievement:', err);
  }
  return false;
}

async function checkAndUnlockTerritoryMonarch(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT COUNT(*) as count FROM territories WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    if (res && res.count >= 10) {
      return await unlockAchievement(db, userId, 'territory_monarch');
    }
  } catch (err) {
    console.error('Failed to check territory_monarch achievement:', err);
  }
  return false;
}

async function checkAndUnlockMissionChampion(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT COUNT(*) as count FROM user_missions WHERE user_id = ? AND is_completed = 1')
      .bind(userId)
      .first<{ count: number }>();
    if (res && res.count >= 5) {
      return await unlockAchievement(db, userId, 'mission_champion');
    }
  } catch (err) {
    console.error('Failed to check mission_champion achievement:', err);
  }
  return false;
}

async function checkAndUnlockChatScholar(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE user_id = ? AND sender = 'user'")
      .bind(userId)
      .first<{ count: number }>();
    if (res && res.count >= 10) {
      return await unlockAchievement(db, userId, 'chat_scholar');
    }
  } catch (err) {
    console.error('Failed to check chat_scholar achievement:', err);
  }
  return false;
}

async function checkAndUnlockCalorieChampion(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT COUNT(*) as count FROM meals WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    if (res && res.count >= 10) {
      return await unlockAchievement(db, userId, 'calorie_champion');
    }
  } catch (err) {
    console.error('Failed to check calorie_champion achievement:', err);
  }
  return false;
}

async function checkAndUnlockFirstFortress(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT COUNT(*) as count FROM territories WHERE user_id = ? AND fortification_level >= 3')
      .bind(userId)
      .first<{ count: number }>();
    if (res && res.count > 0) {
      return await unlockAchievement(db, userId, 'first_fortress');
    }
  } catch (err) {
    console.error('Failed to check first_fortress achievement:', err);
  }
  return false;
}

async function checkAndUnlockWorldTraveler(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT SUM(distance_m) as total FROM territories WHERE user_id = ?')
      .bind(userId)
      .first<{ total: number | null }>();
    if (res && res.total !== null && res.total >= 10000) {
      return await unlockAchievement(db, userId, 'world_traveler');
    }
  } catch (err) {
    console.error('Failed to check world_traveler achievement:', err);
  }
  return false;
}

async function checkAndUnlockActiveStreak(db: D1Database, userId: string): Promise<boolean> {
  try {
    const res = await db.prepare('SELECT SUM(area_sqm) as total FROM territories WHERE user_id = ?')
      .bind(userId)
      .first<{ total: number | null }>();
    if (res && res.total !== null && res.total >= 1000) {
      return await unlockAchievement(db, userId, 'active_streak');
    }
  } catch (err) {
    console.error('Failed to check active_streak achievement:', err);
  }
  return false;
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

    if (isCompleted === 1) {
      await checkAndUnlockMissionChampion(db, userId);
    }
  } catch (err) {
    console.error('Failed to update daily mission progress:', err);
  }
}

async function addXpAndCheckLevelUp(
  db: D1Database,
  userId: string,
  xpAmount: number
): Promise<{ levelUp: boolean; newLevel: number; newXp: number; newStatusPoints: number }> {
  const user = await db.prepare('SELECT level, xp, status_points FROM users WHERE id = ?')
    .bind(userId)
    .first<{ level: number | null, xp: number | null, status_points: number | null }>();

  if (!user) {
    return { levelUp: false, newLevel: 1, newXp: 0, newStatusPoints: 0 };
  }

  let currentLevel = user.level || 1;
  let currentXp = (user.xp || 0) + xpAmount;
  let currentStatusPoints = user.status_points || 0;
  let levelUpOccurred = false;

  while (currentXp >= currentLevel * 100) {
    currentXp -= currentLevel * 100;
    currentLevel += 1;
    currentStatusPoints += 3;
    levelUpOccurred = true;
  }

  await db.prepare('UPDATE users SET level = ?, xp = ?, status_points = ? WHERE id = ?')
    .bind(currentLevel, currentXp, currentStatusPoints, userId)
    .run();

  if (levelUpOccurred) {
    const notifId = crypto.randomUUID();
    await db.prepare('INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)')
      .bind(
        notifId,
        userId,
        '🎉 レベルアップ！',
        `おめでとうございます！レベル ${currentLevel} に到達しました。ステータスポイントが 3 ポイント付与されました。`,
        'level_up'
      )
      .run();
  }

  return {
    levelUp: levelUpOccurred,
    newLevel: currentLevel,
    newXp: currentXp,
    newStatusPoints: currentStatusPoints
  };
}

async function createTerritoryNotification(db: D1Database, victimUserId: string, title: string, message: string, type: string) {
  const notifId = crypto.randomUUID();
  try {
    await db.prepare('INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)')
      .bind(notifId, victimUserId, title, message, type)
      .run();
  } catch (e) {
    console.error('Failed to create territory notification:', e);
  }
}

export type AppType = typeof routes;
export default app;
