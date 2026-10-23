import app from './index';
import { purgeRunningTelemetry } from './services/runningRetention';
import type { D1Database, ExecutionContext, ScheduledController } from '@cloudflare/workers-types';
type Env={DB:D1Database};
export default {
  fetch:app.fetch,
  scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext){
    ctx.waitUntil(purgeRunningTelemetry(env.DB));
  },
};
