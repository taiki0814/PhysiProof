import type { D1Database } from '@cloudflare/workers-types';
export async function purgeRunningTelemetry(db:D1Database){
  await db.batch([
    db.prepare("UPDATE running_sessions SET status='abandoned' WHERE status='active' AND julianday(last_heartbeat_at)<julianday('now','-90 seconds')"),
    db.prepare("UPDATE running_motion SET last_fix_json=NULL,steps=NULL WHERE received_at_ms < (julianday('now')-2440587.5)*86400000-120000 AND last_fix_json IS NOT NULL"),
    db.prepare("DELETE FROM running_place_passages WHERE julianday(bucket_at)<julianday('now','-56 days')"),
  ]);
}
