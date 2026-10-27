import type {D1Database} from '@cloudflare/workers-types';
import {COURSE_REWARDS,COURSE_REWARD_MIN_LENGTH_M} from '@my-app/shared';

export function courseRewardStatements(db:D1Database,userId:string){
  return COURSE_REWARDS.map(reward=>db.prepare(`INSERT OR IGNORE INTO course_cosmetic_unlocks(user_id,reward_id)
    SELECT ?,? WHERE EXISTS(SELECT course_id FROM running_course_completions WHERE user_id=? AND length_m>=?
      GROUP BY course_id HAVING SUM(laps)>=? AND COUNT(DISTINCT date(completed_at,'+9 hours'))>=?)`)
    .bind(userId,reward.id,userId,COURSE_REWARD_MIN_LENGTH_M,reward.laps,reward.days));
}
export const coursePermission=`EXISTS(SELECT 1 FROM users u WHERE u.id=? AND (u.id=? OR
 (u.territory_map_visibility='friends' AND EXISTS(SELECT 1 FROM friends WHERE user_id=u.id AND friend_id=?)
 AND EXISTS(SELECT 1 FROM friends WHERE friend_id=u.id AND user_id=?))))`;
