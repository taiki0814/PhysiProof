import { describe, expect, it, vi } from 'vitest';
import { calculateBattleHolding, type TeamBattleAreaEvent } from '../index';

const startsAt = '2026-10-10T00:00:00.000Z';
const endsAt = '2026-10-10T00:01:40.000Z';
const startMs = Date.parse(startsAt);
const zeroHolding = {
  territory_delta_sqm: 0,
  holding_area_sqm_seconds: 0,
  holding_points: 0,
};

function event(seconds: number, area_delta_sqm: number): TeamBattleAreaEvent {
  return { recorded_at: new Date(startMs + seconds * 1000).toISOString(), area_delta_sqm };
}

function holding(events: readonly TeamBattleAreaEvent[], nowSeconds = 100, rate = 2) {
  return calculateBattleHolding(events, startsAt, endsAt, startMs + nowSeconds * 1000, rate);
}

describe('calculateBattleHolding', () => {
  it.each([
    { name: 'no events', events: [] },
    { name: 'only legacy area acquired before the battle', events: [event(-100, 5000), event(-1, 2000)] },
  ])('starts from zero with $name', ({ events }) => {
    expect(holding(events)).toEqual(zeroHolding);
  });

  it.each([
    {
      name: '1000 sqm held for the entire period', events: [event(0, 1000)],
      now: 100, rate: 1, delta: 1000, areaTime: 100_000, points: 1,
    },
    {
      name: '2000 sqm acquired halfway through the period', events: [event(50, 2000)],
      now: 100, rate: 1, delta: 2000, areaTime: 100_000, points: 1,
    },
    {
      name: 'a refresh one quarter into the full period', events: [event(0, 1000)],
      now: 25, rate: 2, delta: 1000, areaTime: 25_000, points: 0.5,
    },
    {
      name: 'two gains at different times', events: [event(10, 1000), event(40, 500)],
      now: 100, rate: 2, delta: 1500, areaTime: 120_000, points: 2.4,
    },
    {
      name: 'fractional area and a fractional coefficient', events: [event(0, 250.5)],
      now: 20, rate: 0.25, delta: 250.5, areaTime: 5010, points: 0.012525,
    },
  ])('integrates and normalizes $name', ({ events, now, rate, delta, areaTime, points }) => {
    const result = holding(events, now, rate);
    expect(result.territory_delta_sqm).toBe(delta);
    expect(result.holding_area_sqm_seconds).toBeCloseTo(areaTime, 8);
    expect(result.holding_points).toBeCloseTo(points, 8);
  });

  it('reduces future accrual after a partial loss without removing earned holding time', () => {
    // 2000 * 40 + 1500 * 60 = 170000 sqm-seconds.
    const result = holding([event(0, 2000), event(40, -500)]);
    expect(result.territory_delta_sqm).toBe(1500);
    expect(result.holding_area_sqm_seconds).toBe(170_000);
    expect(result.holding_points).toBeCloseTo(3.4, 8);
  });

  it('preserves earned time after full loss and resumes accrual on retake', () => {
    const events = [event(0, 1000), event(30, -1000), event(70, 1000)];
    const lost = {
      territory_delta_sqm: 0, holding_area_sqm_seconds: 30_000, holding_points: 0.6,
    };
    expect(holding(events, 30)).toEqual(lost);
    expect(holding(events, 60)).toEqual(lost);
    expect(holding(events, 70)).toEqual({ ...lost, territory_delta_sqm: 1000 });
    expect(holding(events)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 60_000, holding_points: 1.2,
    });
  });

  it('keeps losses of old area signed and earns nothing from an insufficient gain', () => {
    expect(holding([event(0, -1500), event(20, 1000)])).toEqual({
      ...zeroHolding, territory_delta_sqm: -500,
    });
  });

  it('starts accruing only after later gains exceed the outstanding negative delta', () => {
    const events = [event(0, -1500), event(20, 1000), event(70, 1000)];
    expect(holding(events, 60)).toEqual({ ...zeroHolding, territory_delta_sqm: -500 });
    expect(holding(events)).toEqual({
      territory_delta_sqm: 500, holding_area_sqm_seconds: 15_000, holding_points: 0.3,
    });
  });

  it('never subtracts earned time while the cumulative area is below zero', () => {
    expect(holding([event(0, 1000), event(30, -1500), event(70, 400)])).toEqual({
      territory_delta_sqm: -100, holding_area_sqm_seconds: 30_000, holding_points: 0.6,
    });
  });

  it('gives the same full-period points for short and long battles', () => {
    const events = [event(0, 1000)];
    const shortEnd = '2026-10-10T00:01:00.000Z';
    const longEnd = '2026-10-10T02:00:00.000Z';
    expect(calculateBattleHolding(events, startsAt, shortEnd, Date.parse(shortEnd), 3)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 60_000, holding_points: 3,
    });
    expect(calculateBattleHolding(events, startsAt, longEnd, Date.parse(longEnd), 3)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 7_200_000, holding_points: 3,
    });
  });

  it('normalizes an active refresh by the full duration rather than elapsed time', () => {
    const events = [event(0, 1000)];
    const longerEnd = '2026-10-10T00:03:20.000Z';
    expect(holding(events, 30)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 30_000, holding_points: 0.6,
    });
    expect(calculateBattleHolding(events, startsAt, longerEnd, startMs + 30_000, 2)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 30_000, holding_points: 0.3,
    });
  });

  const simultaneousEvents = [
    event(0, -500), event(10, 1000), event(10, -400), event(10, -100), event(40, 250),
  ];
  it.each([
    { name: 'chronological', events: simultaneousEvents },
    { name: 'reversed', events: [...simultaneousEvents].reverse() },
    {
      name: 'shuffled with gains and losses interleaved',
      events: [simultaneousEvents[3], simultaneousEvents[4], simultaneousEvents[0], simultaneousEvents[2], simultaneousEvents[1]],
    },
  ])('merges simultaneous signed deltas before integrating ($name)', ({ events }) => {
    expect(holding(events)).toEqual({
      territory_delta_sqm: 250, holding_area_sqm_seconds: 15_000, holding_points: 0.3,
    });
  });

  it('groups timestamps in the same server second before integrating', () => {
    const events = [event(10.1, 1000), event(10.9, -1000)];
    expect(holding(events)).toEqual(zeroHolding);
    expect(holding([...events].reverse())).toEqual(zeroHolding);
  });

  it('treats a zero-delta event as no change in held area', () => {
    expect(holding([event(0, 1000), event(20, 0)])).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 100_000, holding_points: 2,
    });
  });

  it.each([-60, -0.001])('returns all zeros before the battle starts (now offset %s seconds)', (now) => {
    expect(holding([event(-1, 5000), event(0, 1000), event(10, 500)], now)).toEqual(zeroHolding);
  });

  it('includes a start-time event without crediting time before the start', () => {
    expect(holding([event(-1, 5000), event(0, 1000)], 0)).toEqual({
      ...zeroHolding, territory_delta_sqm: 1000,
    });
  });

  it('clamps a capture in the first server second to a fractional battle start', () => {
    const fractionalStart = '2026-10-10T00:00:00.500Z';
    const fractionalEnd = '2026-10-10T00:01:40.500Z';
    const events = [event(0.499, 9000), event(0.9, 1000)];

    // Filter original timestamps first: the pre-start gain and future capture do not count.
    expect(calculateBattleHolding(events, fractionalStart, fractionalEnd, startMs + 800, 2)).toEqual(zeroHolding);
    expect(calculateBattleHolding(events, fractionalStart, fractionalEnd, startMs + 900, 2)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 400, holding_points: 0.008,
    });
    // The capture normalizes to 0.5 seconds, never 0: 1000 sqm * 100 seconds.
    expect(calculateBattleHolding(events, fractionalStart, fractionalEnd, Date.parse(fractionalEnd), 2)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 100_000, holding_points: 2,
    });
  });

  it('filters exact fractional end bounds before grouping and freezes one millisecond after the end', () => {
    const fractionalStart = '2026-10-10T00:00:00.500Z';
    const fractionalEnd = '2026-10-10T00:01:40.500Z';
    const events = [event(100.499, 500), event(100.5, -500), event(100.501, 9000), event(100.9, -1000)];
    const expected = {
      territory_delta_sqm: 500, holding_area_sqm_seconds: 250, holding_points: 0.005,
    };

    // Only the pre-end capture counts, held from second 100 to the exact end at 100.5.
    expect(calculateBattleHolding(events, fractionalStart, fractionalEnd, Date.parse(fractionalEnd), 2)).toEqual(expected);
    expect(calculateBattleHolding(events, fractionalStart, fractionalEnd, Date.parse(fractionalEnd) + 1, 2)).toEqual(expected);
    expect(calculateBattleHolding(events, fractionalStart, fractionalEnd, startMs + 101_000, 2)).toEqual(expected);
  });

  it('uses an inclusive start and exclusive end for area events', () => {
    const result = holding([
      event(-1, 5000), event(0, 1000), event(99, 500), event(100, 9000), event(101, 9000),
    ]);
    expect(result.territory_delta_sqm).toBe(1500);
    expect(result.holding_area_sqm_seconds).toBe(100_500);
    expect(result.holding_points).toBeCloseTo(2.01, 8);
  });

  it('includes an event exactly at now and ignores all later events', () => {
    expect(holding([event(0, 1000), event(30, 500), event(30.001, 9000), event(40, -500)], 30)).toEqual({
      territory_delta_sqm: 1500, holding_area_sqm_seconds: 30_000, holding_points: 0.6,
    });
  });

  it('freezes all results at the end even with later gains or losses', () => {
    const events = [event(20, 1000), event(60, -200), event(100, -800), event(101, 9000)];
    const finished = holding(events);
    expect(finished.territory_delta_sqm).toBe(800);
    expect(finished.holding_area_sqm_seconds).toBe(72_000);
    expect(finished.holding_points).toBeCloseTo(1.44, 8);
    expect(holding(events, 101)).toEqual(finished);
    expect(holding(events, 100_000)).toEqual(finished);
  });

  it('interprets SQL CURRENT_TIMESTAMP as UTC in a non-UTC timezone', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    try {
      expect(calculateBattleHolding(
        [{ recorded_at: '2026-10-10 00:00:00', area_delta_sqm: 1000 }],
        '2026-10-10 00:00:00', '2026-10-10 00:01:40', startMs + 50_000, 2,
      )).toEqual({
        territory_delta_sqm: 1000, holding_area_sqm_seconds: 50_000, holding_points: 1,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    { name: 'ISO UTC', start: startsAt, end: endsAt, recordedAt: startsAt },
    {
      name: 'ISO timezone offsets', start: '2026-10-10T09:00:00+09:00',
      end: '2026-10-10T09:01:40+09:00', recordedAt: '2026-10-09T20:00:00-04:00',
    },
    { name: 'mixed SQL and ISO at the same instant', start: startsAt, end: endsAt, recordedAt: '2026-10-10 00:00:00' },
  ])('supports $name dates', ({ start, end, recordedAt }) => {
    expect(calculateBattleHolding(
      [{ recorded_at: recordedAt, area_delta_sqm: 1000 }], start, end, startMs + 50_000, 2,
    )).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 50_000, holding_points: 1,
    });
  });

  it('merges SQL and ISO timestamps representing the same server second', () => {
    expect(holding([
      { recorded_at: '2026-10-10 00:00:10', area_delta_sqm: 1000 },
      { recorded_at: '2026-10-10T09:00:10+09:00', area_delta_sqm: -1000 },
    ])).toEqual(zeroHolding);
  });

  it('keeps refreshes repeatable and does not mutate or sort the event input', () => {
    const events = Object.freeze([Object.freeze(event(40, -500)), Object.freeze(event(0, 1000))]);
    const snapshot = events.map((entry) => ({ ...entry }));
    const first = holding(events, 60);
    expect(first).toEqual({
      territory_delta_sqm: 500, holding_area_sqm_seconds: 50_000, holding_points: 1,
    });
    expect(holding(events, 60)).toEqual(first);
    expect(holding(events, 100)).toEqual({
      territory_delta_sqm: 500, holding_area_sqm_seconds: 70_000, holding_points: 1.4,
    });
    expect(holding(events, 20)).toEqual({
      territory_delta_sqm: 1000, holding_area_sqm_seconds: 20_000, holding_points: 0.4,
    });
    expect(holding(events, 60)).toEqual(first);
    expect(events).toEqual(snapshot);
  });

  it.each([
    { name: 'invalid start', start: 'not-a-date', end: endsAt },
    { name: 'invalid end', start: startsAt, end: 'not-a-date' },
    { name: 'empty start', start: '', end: endsAt },
    { name: 'empty end', start: startsAt, end: '' },
    { name: 'zero duration', start: startsAt, end: startsAt },
    { name: 'negative duration', start: endsAt, end: startsAt },
  ])('rejects a window with $name', ({ start, end }) => {
    expect(() => calculateBattleHolding([], start, end, startMs, 1)).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects a non-finite now (%s)', (now) => {
    expect(() => calculateBattleHolding([], startsAt, endsAt, now, 1)).toThrow();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects an invalid rate (%s)', (rate) => {
    expect(() => holding([], 100, rate)).toThrow();
  });

  it.each(['', 'not-a-date'])('rejects an invalid event timestamp (%s)', (recorded_at) => {
    expect(() => holding([{ recorded_at, area_delta_sqm: 1000 }])).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('rejects a non-finite area delta (%s)', (delta) => {
    expect(() => holding([event(0, delta)])).toThrow();
  });
});
