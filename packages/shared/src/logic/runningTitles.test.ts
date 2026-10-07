import { describe, expect, it } from 'vitest';
import { getRunningTitleProgress } from './runningTitles';
import { runningTitleProgressSchema } from '../schemas/running-title.schema';

const milestones = [
  [1, 'はじまりのランナー'],
  [5, 'かけだしランナー'],
  [10, 'まちかどランナー'],
  [25, 'いちにんまえランナー'],
  [50, 'うわさのランナー'],
  [100, 'すごうでランナー'],
  [200, 'ベテランランナー'],
  [300, 'カリスマランナー'],
  [500, 'マスターランナー'],
  [750, '街の英雄ランナー'],
  [1_000, '伝説のランナー'],
  [2_000, 'えいえんのランナー'],
] as const;

describe('Lifetime running titles', () => {
  it.each(milestones)('grants the agreed title at exactly %s km', (km, name) => {
    const result = getRunningTitleProgress(km * 1_000);
    expect(result.current_title?.name).toBe(name);
    expect(runningTitleProgressSchema.safeParse(result).success).toBe(true);
  });

  it.each(milestones)('does not grant the %s km title one meter early', (km, name) => {
    const result = getRunningTitleProgress(km * 1_000 - 1);
    expect(result.current_title?.name).not.toBe(name);
    expect(result.next_title?.name).toBe(name);
    expect(result.remaining_distance_m).toBe(1);
    expect(result.progress_ratio).toBeLessThan(1);
  });

  it('shows progress to the first title before any title is earned', () => {
    const result = getRunningTitleProgress(250);
    expect(result.current_title).toBeNull();
    expect(result.next_title?.name).toBe('はじまりのランナー');
    expect(result.remaining_distance_m).toBe(750);
    expect(result.progress_ratio).toBe(0.25);
  });

  it('uses the current interval rather than all lifetime distance for progress', () => {
    const result = getRunningTitleProgress(17_500);
    expect(result.current_title?.name).toBe('まちかどランナー');
    expect(result.next_title?.name).toBe('いちにんまえランナー');
    expect(result.remaining_distance_m).toBe(7_500);
    expect(result.progress_ratio).toBe(0.5);
  });

  it('selects the highest earned title when several milestones are passed together', () => {
    const result = getRunningTitleProgress(60_000);
    expect(result.current_title?.name).toBe('うわさのランナー');
    expect(result.next_title?.required_distance_m).toBe(100_000);
  });

  it.each([2_000_000, 5_000_000])('keeps the highest title at %s meters without a next target', (distance) => {
    const result = getRunningTitleProgress(distance);
    expect(result.current_title?.name).toBe('えいえんのランナー');
    expect(result.next_title).toBeNull();
    expect(result.remaining_distance_m).toBe(0);
    expect(result.progress_ratio).toBe(1);
    expect(result.total_distance_m).toBe(distance);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('handles an initial or invalid total safely (%s)', (distance) => {
    const result = getRunningTitleProgress(distance);
    expect(result.total_distance_m).toBe(0);
    expect(result.current_title).toBeNull();
    expect(result.remaining_distance_m).toBe(1_000);
    expect(result.progress_ratio).toBe(0);
  });
});
