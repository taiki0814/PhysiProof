import type { TeamBattleAreaEvent } from '../schemas/team-battle.schema';

/** SQLite CURRENT_TIMESTAMP is UTC even though it does not include a timezone suffix. */
function serverTimestamp(value: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z` : value);
}

/** Integrate positive net area above the battle-start baseline; reads never mutate scores. */
export function calculateBattleHolding(
  events: readonly TeamBattleAreaEvent[], startsAt: string, endsAt: string,
  nowMs: number, pointsPer1000SqmFullPeriod: number,
): { territory_delta_sqm: number; holding_area_sqm_seconds: number; holding_points: number } {
  const start = serverTimestamp(startsAt), end = serverTimestamp(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(nowMs)
    || !Number.isFinite(pointsPer1000SqmFullPeriod) || pointsPer1000SqmFullPeriod <= 0) {
    throw new Error('Invalid battle holding window or coefficient');
  }
  const until = Math.max(start, Math.min(nowMs, end));
  const byTime = new Map<number, number>();
  for (const event of events) {
    const recordedTime = serverTimestamp(event.recorded_at);
    if (!Number.isFinite(recordedTime) || !Number.isFinite(event.area_delta_sqm)) throw new Error('Invalid battle area event');
    if (nowMs < start || recordedTime < start || recordedTime >= end || recordedTime > until) continue;
    // Ledger precision is one UTC second: merge row reorganization within that second.
    const time = Math.max(start, Math.floor(recordedTime / 1000) * 1000);
    byTime.set(time, (byTime.get(time) ?? 0) + event.area_delta_sqm);
  }
  let net = 0, areaTime = 0, cursor = start;
  for (const [time, delta] of [...byTime.entries()].sort(([a], [b]) => a - b)) {
    areaTime += Math.max(net, 0) * (time - cursor) / 1000;
    net += delta;
    cursor = time;
  }
  areaTime += Math.max(net, 0) * (until - cursor) / 1000;
  return {
    territory_delta_sqm: net,
    holding_area_sqm_seconds: areaTime,
    holding_points: areaTime / ((end - start) / 1000) / 1000 * pointsPer1000SqmFullPeriod,
  };
}
