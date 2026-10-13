import type {D1Database} from '@cloudflare/workers-types';

async function hashToken(token:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function issueUniformAdminSession(db:D1Database,userId:string) {
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await db.batch([
    db.prepare('DELETE FROM uniform_admin_sessions WHERE user_id=? OR expires_at<=CURRENT_TIMESTAMP').bind(userId),
    db.prepare("INSERT INTO uniform_admin_sessions(token_hash,user_id,expires_at) SELECT ?,?,datetime('now','+12 hours') WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin')")
      .bind(await hashToken(token),userId,userId),
  ]);
  return token;
}
export async function verifyUniformAdminSession(db:D1Database,userId:string,token:string|undefined) {
  if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
  const row=await db.prepare("SELECT s.user_id FROM uniform_admin_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>CURRENT_TIMESTAMP AND u.role='admin'")
    .bind(await hashToken(token),userId).first();
  return !!row;
}
