import type { D1Database } from '@cloudflare/workers-types';
import { issueSession } from './authSession';
import { issueUniformAdminSession } from './uniformAdminSession';

export type LoginProfile = {
  id: string; name: string; avatar_id: string; avatar_image: string | null;
  login_id: string; role: string; password_hash: string; territory_map_visibility: 'private' | 'friends';
  current_weight: number | null; target_weight: number | null;
  target_calories_burned: number | null; target_calories_consumed: number | null;
  gender: string | null; age: number | null; height: number | null;
  level: number; xp: number; status_points: number;
  stat_str: number; stat_agi: number; stat_def: number; stat_vit: number;
  team_id: string | null; team_name: string | null;
};

export function readLoginProfile(db: D1Database, key: 'id' | 'login_id', value: string) {
  return db.prepare(`SELECT u.id,u.name,u.avatar_id,u.avatar_image,u.login_id,u.role,u.password_hash,u.territory_map_visibility,
    u.current_weight,u.target_weight,u.target_calories_burned,u.target_calories_consumed,u.gender,u.age,u.height,
    u.level,u.xp,u.status_points,u.stat_str,u.stat_agi,u.stat_def,u.stat_vit,u.team_id,t.name AS team_name
    FROM users u LEFT JOIN teams t ON u.team_id=t.id WHERE u.${key}=?`).bind(value).first<LoginProfile>();
}

export async function createLoginResponse(db: D1Database, user: LoginProfile) {
  const accessToken = await issueSession(db, user.id, user.password_hash);
  let uniformAdminToken: string | undefined;
  if (user.role === 'admin') {
    try { uniformAdminToken = await issueUniformAdminSession(db, user.id); }
    catch { /* A missing admin migration must not prevent an ordinary login. */ }
  }
  const { id, password_hash, ...profile } = user;
  return {
    ...profile, success: true as const, userId: id, accessToken, uniformAdminToken,
    avatar_id: user.avatar_id || 'default', avatar_image: user.avatar_image || null,
    role: user.role || 'user', team_id: user.team_id || null, team_name: user.team_name || null,
  };
}
