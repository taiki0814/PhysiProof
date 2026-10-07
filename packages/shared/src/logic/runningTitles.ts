import type { RunningTitle, RunningTitleProgress } from '../schemas/running-title.schema';

// Keep thresholds in ascending order. Distances are stored and compared in meters.
export const RUNNING_TITLE_DEFINITIONS: readonly RunningTitle[] = [
  { level: 1, name: 'はじまりのランナー', required_distance_m: 1_000 },
  { level: 2, name: 'かけだしランナー', required_distance_m: 5_000 },
  { level: 3, name: 'まちかどランナー', required_distance_m: 10_000 },
  { level: 4, name: 'いちにんまえランナー', required_distance_m: 25_000 },
  { level: 5, name: 'うわさのランナー', required_distance_m: 50_000 },
  { level: 6, name: 'すごうでランナー', required_distance_m: 100_000 },
  { level: 7, name: 'ベテランランナー', required_distance_m: 200_000 },
  { level: 8, name: 'カリスマランナー', required_distance_m: 300_000 },
  { level: 9, name: 'マスターランナー', required_distance_m: 500_000 },
  { level: 10, name: '街の英雄ランナー', required_distance_m: 750_000 },
  { level: 11, name: '伝説のランナー', required_distance_m: 1_000_000 },
  { level: 12, name: 'えいえんのランナー', required_distance_m: 2_000_000 },
];

export function getRunningTitleProgress(totalDistanceM: number): RunningTitleProgress {
  const total = Number.isFinite(totalDistanceM) ? Math.max(0, totalDistanceM) : 0;
  let currentTitle: RunningTitle | null = null;
  let nextTitle: RunningTitle | null = null;

  for (const title of RUNNING_TITLE_DEFINITIONS) {
    if (total >= title.required_distance_m) {
      currentTitle = title;
    } else {
      nextTitle = title;
      break;
    }
  }

  const currentThreshold = currentTitle?.required_distance_m ?? 0;
  return {
    total_distance_m: total,
    current_title: currentTitle,
    next_title: nextTitle,
    remaining_distance_m: nextTitle ? nextTitle.required_distance_m - total : 0,
    progress_ratio: nextTitle
      ? (total - currentThreshold) / (nextTitle.required_distance_m - currentThreshold)
      : 1,
  };
}
