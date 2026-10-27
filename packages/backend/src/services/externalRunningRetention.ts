import type {D1Database} from '@cloudflare/workers-types';
import {EXTERNAL_RUNNING_WINDOW_MS} from '@my-app/shared';
export async function purgeExternalRunning(db:D1Database,now=Date.now()){
  await db.prepare('DELETE FROM external_running_records WHERE started_at_ms<?').bind(now-EXTERNAL_RUNNING_WINDOW_MS).run();
}
