import { describe, it, expect, vi, afterEach } from 'vitest';
import { area } from '@turf/area';
import { polygon } from '@turf/helpers';
import { replayBattleMap, contains, parseRegion, mergeRegions } from './battleMapEngine';
import type { MapEvent, MapRow, MapRules, Region } from './battleMapEngine';
import { chooseSpots, generateBattleSpots, metresBetween } from './battleSpots';
import { createTeamBattleSchema, startRunningSessionSchema } from '@my-app/shared';

const start = Date.parse('2026-10-08T00:00:00Z'), end = start + 3600000;
const rules: MapRules = { starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(), map_mode: 'isolated', spot_holding_multiplier: 1.2, spot_capture_points: .1, holding_points_per_1000_sqm_full_period: 1 };
const rectangle = (x: number, y: number, w = .001, h = .001) => polygon([[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]]);
const a = rectangle(139, 35), b = rectangle(139.003, 35);
const spot = { id: 's', latitude: 35.0005, longitude: 139.0005 };
let sequence = 0;
const event = (kind: 'territory' | 'capture', shape: Region | null, time: number, team = 'a', id = 'one'): MapEvent => ({ id: ++sequence, kind, territory_id: kind === 'territory' ? id : null, team_id: team, user_id: 'u', geometry_json: shape ? JSON.stringify(shape.geometry) : null, area_sqm: shape ? area(shape) : 0, recorded_at: new Date(time).toISOString() });
const replay = (events: MapEvent[], baseline: MapRow[] = [], spots = [spot], now = end, participants = ['a', 'b']) => replayBattleMap(rules, baseline, events, spots, participants, [{ user_id: 'u', team_id: 'a' }, { user_id: 'u', team_id: 'b' }], now);
const base = (shape: Region, id = 'one'): MapRow => ({ territory_id: id, team_id: 'a', geometry_json: JSON.stringify(shape.geometry), area_sqm: area(shape) });

describe('battle map immutable scoring and geometry', () => {
  it('awards first capture and only 20% holding extra from confirmation onwards', () => {
    const result = replay([event('territory', a, start), event('capture', a, start + 1800000)]);
    expect(result.scores.get('a')!.holding_points).toBeCloseTo(area(a) / 1000);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo(area(a) / 1000 * .1);
    expect(result.scores.get('a')).toMatchObject({ captured_spots: 1, spot_capture_points: .1 });
  });
  it('does not stack multiple spots on the same component but gives each first bonus', () => {
    const result = replay([event('territory', a, start), event('capture', a, start)], [], [spot, { ...spot, id: 's2', longitude: 139.0007 }]);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo(area(a) / 1000 * .2);
    expect(result.scores.get('a')!.spot_capture_points).toBe(.2);
  });
  it('does not buff an unconnected same-team component', () => {
    const shape = mergeRegions([a, b])!;
    const result = replay([event('territory', shape, start), event('capture', a, start)]);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo(area(a) / 1000 * .2);
  });
  it('excludes original geometry even after merging into a spotted region', () => {
    const old = rectangle(139, 35, .0005);
    const result = replay([event('territory', a, start), event('capture', a, start)], [base(old)]);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo((area(a) - area(old)) / 1000 * .2);
    expect(result.scores.get('a')!.holding_points).toBeCloseTo((area(a) - area(old)) / 1000);
  });
  it('starts old ownership unbuffed, with no initial bonus', () => {
    const result = replay([], [base(a)]);
    expect(result.spots[0].owner_team_id).toBeNull();
    expect(result.scores.get('a')).toMatchObject({ holding_points: 0, holding_bonus_points: 0, captured_spots: 0 });
  });
  it('first capture is per team/spot; retaking never farms bonuses', () => {
    const result = replay([event('territory', a, start, 'a'), event('capture', a, start, 'a'),
      event('territory', null, start + 1000, 'a'), event('territory', a, start + 1000, 'b', 'two'), event('capture', a, start + 1000, 'b'),
      event('territory', a, start + 2000, 'a'), event('territory', null, start + 2000, 'b', 'two'), event('capture', a, start + 2000, 'a')]);
    expect(result.spots[0]).toMatchObject({ owner_team_id: 'a', first_capture_team_ids: ['a', 'b'] });
    expect(result.scores.get('a')!.spot_capture_points).toBe(.1);
    expect(result.scores.get('b')!.spot_capture_points).toBe(.1);
  });
  it('outsiders remove ownership and territory without getting a buff or capture', () => {
    const result = replay([event('territory', a, start), event('capture', a, start), event('territory', null, start + 1800000),
      event('territory', a, start + 1800000, 'outside'), event('capture', a, start + 1800000, 'outside')]);
    expect(result.spots[0].owner_team_id).toBeNull();
    expect(result.scores.has('outside')).toBe(false);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo(area(a) / 1000 * .1);
    expect(result.scores.get('a')!.spot_capture_points).toBe(.1);
  });
  it('splitting a component removes the buff from the detached region', () => {
    const whole = rectangle(139, 35, .004);
    const split = mergeRegions([a, b])!;
    const result = replay([event('territory', whole, start), event('capture', whole, start), event('territory', split, start + 1800000)]);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo((area(whole) + area(a)) / 1000 * .1);
  });
  it('stops at ends_at, rejects boundary-time capture, and replays identically later', () => {
    const events = [event('territory', a, start), event('capture', a, end), event('territory', b, end + 1000)];
    expect(replay(events, [], [spot], end + 100000)).toEqual(replay(events));
    expect(replay(events).scores.get('a')!.captured_spots).toBe(0);
  });
  it('has no effect before start or from events before start', () => {
    const events = [event('territory', a, start - 1000), event('capture', a, start - 1000)];
    expect(replay(events, [], [spot], start - 1000).scores.get('a')!.holding_points).toBe(0);
    expect(replay(events).scores.get('a')!.captured_spots).toBe(0);
  });
  it('caps buff to positive net growth after losses elsewhere; signed area remains', () => {
    const result = replay([event('territory', a, start), event('capture', a, start), event('territory', null, start, 'a', 'old')], [base(b, 'old')]);
    expect(result.scores.get('a')!.holding_bonus_points).toBeCloseTo(0);
    expect(result.scores.get('a')!.territory_delta_sqm).toBeCloseTo(0);
  });
  it('requires a roster member, not just a participating team', () => {
    const capture = event('capture', a, start); capture.user_id = 'not-registered';
    expect(replay([event('territory', a, start), capture]).scores.get('a')!.captured_spots).toBe(0);
  });
  it('excludes exact outer/hole boundaries and preserves holes', () => {
    const hole = rectangle(139.0002, 35.0002, .0006, .0006);
    const shape = polygon([a.geometry.coordinates[0], hole.geometry.coordinates[0]]);
    expect(contains(shape, 35.0005, 139.0005)).toBe(false);
    expect(contains(shape, 35.0005, 139.0002)).toBe(false);
    expect(contains(shape, 35, 139.0005)).toBe(false);
    expect(contains(shape, 35.0001, 139.0001)).toBe(true);
    expect(parseRegion(JSON.stringify(shape.geometry))).toEqual(shape);
  });
});

describe('spot distribution and input validation', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('keeps candidate spots spaced and within the chosen circle', () => {
    const center = { latitude: 35, longitude: 139 };
    const paths = [];
    for (let lat = 34.98; lat < 35.02; lat += .0002) for (let lng = 138.97; lng < 139.03; lng += .0002) paths.push({ latitude: lat, longitude: lng });
    const chosen = chooseSpots(center, 2000, paths, () => .5);
    expect(chosen.length).toBeGreaterThan(10);
    for (const [i, p] of chosen.entries()) {
      expect(metresBetween(center, p)).toBeLessThanOrEqual(2000);
      for (const q of chosen.slice(i + 1)) expect(metresBetween(p, q)).toBeGreaterThanOrEqual(500);
    }
    expect(chooseSpots(center, 2000, [], () => .5)).toEqual([]);
  });
  it('does not fallback to arbitrary coordinates on external failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toThrow('地図を取得');
  });
  it('rejects private and unknown-access walking paths', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ elements: [
      { tags: { foot: 'yes', access: 'private' }, geometry: [{ lat: 35, lon: 139 }, { lat: 35.02, lon: 139 }] },
      { tags: { highway: 'path' }, geometry: [{ lat: 35, lon: 139 }, { lat: 35.02, lon: 139 }] },
    ] }))));
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toThrow('公開された歩行路');
  });
  it('places spots only on explicitly public walking geometry and fixes their coordinates', async () => {
    const elements: { tags: { highway: string; foot: string }; geometry: { lat: number; lon: number }[] }[] = [];
    for (let lat = 34.981; lat < 35.02; lat += .001) elements.push({ tags: { highway: 'footway', foot: 'yes' }, geometry: [{ lat, lon: 138.975 }, { lat, lon: 139.025 }] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ elements }))));
    const spots = await generateBattleSpots(35, 139, 2000);
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ 'User-Agent': expect.stringContaining('PhysiProof') });
    expect(spots.length).toBeGreaterThan(5);
    for (const p of spots) {
      expect(elements.some(e => Math.abs(e.geometry[0].lat - p.latitude) < 1e-10)).toBe(true);
      expect(metresBetween({ latitude: 35, longitude: 139 }, p)).toBeLessThanOrEqual(2000);
    }
  });
  it('rejects invalid GeoJSON instead of letting corrupt positions enter the map', () => {
    expect(() => parseRegion('{"type":"Polygon","coordinates":[[[139,35],[139.1,35],[139.1,35.1],[139,35.1]]]}')).toThrow();
    expect(() => parseRegion('{"type":"Polygon","coordinates":[[[999,35],[139.1,35],[139.1,35.1],[999,35]]]}')).toThrow();
    expect(() => parseRegion('[[35,999],[35,139],[36,139]]')).toThrow();
  });
  it('caches walking data, not the randomly generated battle positions', async () => {
    const store = new Map<string, Response>();
    const cache = { match: vi.fn(async (r: Request) => store.get(r.url)?.clone()), put: vi.fn(async (r: Request, v: Response) => { store.set(r.url, v.clone()); }) };
    vi.stubGlobal('caches', { default: cache });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"elements":[]}')));
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toThrow('公開された歩行路');
    await expect(generateBattleSpots(35.0001, 139, 2000)).rejects.toThrow('公開された歩行路');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][1].headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
  it('shares a short cooldown after a provider error rather than querying it again', async () => {
    const store = new Map<string, Response>();
    const cache = { match: vi.fn(async (r: Request) => store.get(r.url)?.clone()), put: vi.fn(async (r: Request, v: Response) => { store.set(r.url, v.clone()); }) };
    vi.stubGlobal('caches', { default: cache });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toThrow('30秒');
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toThrow('30秒');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][1].headers.get('Cache-Control')).toBe('public, max-age=30');
  });
  it('requires a valid center for spots and forbids personal battle runs', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const payload = { opponent_team_ids: [id], starts_at: rules.starts_at, ends_at: rules.ends_at, map_mode: 'isolated', spots_enabled: true };
    expect(createTeamBattleSchema.safeParse(payload).success).toBe(false);
    expect(createTeamBattleSchema.safeParse({ ...payload, map_latitude: 35, map_longitude: 139 }).success).toBe(true);
    expect(startRunningSessionSchema.safeParse({ activity_mode: 'personal', battle_id: id }).success).toBe(false);
  });
});
