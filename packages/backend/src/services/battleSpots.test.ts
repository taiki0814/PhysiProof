import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateBattleSpots, SpotPlacementError } from './battleSpots';

const providers = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const key = 'https://physiproof-cache.invalid/walking-paths/v2/35/139/2000';
const publicMap = {
  elements: Array.from({ length: 39 }, (_, i) => ({
    tags: { highway: 'footway', foot: 'yes' },
    geometry: [{ lat: 34.981 + i * .001, lon: 138.975 }, { lat: 34.981 + i * .001, lon: 139.025 }],
  })),
};
const ok = () => new Response(JSON.stringify(publicMap));
function edgeCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (r: Request) => entries.get(r.url)?.clone()),
    put: vi.fn(async (r: Request, value: Response) => { entries.set(r.url, value.clone()); }),
  };
  vi.stubGlobal('caches', { default: cache });
  return { entries, cache };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('resilient spot walking-map retrieval', () => {
  it('uses a smaller explicitly-public query with bounded requests and identifying headers', async () => {
    const fetcher = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetcher);
    const spots = await generateBattleSpots(35, 139, 2000);
    expect(spots.length).toBeGreaterThan(5);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(providers[0]);
    expect(options?.headers).toMatchObject({ 'User-Agent': expect.stringContaining('PhysiProof') });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const query = (options?.body as URLSearchParams).get('data')!;
    expect(query).toContain('[timeout:10][maxsize:33554432]');
    expect(query).toContain('around:2200,35,139');
    expect(query).toContain('way.walking[foot~"^(yes|designated|permissive)$"]');
    expect(query).toContain('[access~"^(yes|permissive)$"][!foot]');
  });

  it.each([500, 502, 503, 504])('falls back once on HTTP %s and caches success', async status => {
    const { entries } = edgeCache();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status })).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetcher);
    expect((await generateBattleSpots(35, 139, 2000)).length).toBeGreaterThan(5);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(providers);
    expect(entries.get(key)?.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(entries.get(`${key}/last-success`)?.headers.get('Cache-Control')).toBe('public, max-age=86400');
    await generateBattleSpots(35.0001, 139.0001, 2000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['network', 'timeout', 'invalid JSON', 'partial JSON', 'invalid geometry'])(
    'falls back on %s without accepting an incomplete map', async failure => {
      const fetcher = vi.fn();
      if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('fetch failed'));
      else if (failure === 'timeout') fetcher.mockRejectedValueOnce(new DOMException('expired', 'TimeoutError'));
      else if (failure === 'invalid JSON') fetcher.mockResolvedValueOnce(new Response('not json'));
      else if (failure === 'partial JSON') fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...publicMap, remark: 'runtime error: timeout' })));
      else fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ elements: [{ geometry: [{ lat: 999, lon: 139 }] }] })));
      fetcher.mockResolvedValueOnce(ok());
      vi.stubGlobal('fetch', fetcher);
      expect((await generateBattleSpots(35, 139, 2000)).length).toBeGreaterThan(5);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it.each([406, 429])('does not switch or retry on HTTP %s; honors Retry-After', async status => {
    const { entries } = edgeCache();
    const fetcher = vi.fn(async () => new Response('', { status, headers: { 'Retry-After': '3600' } }));
    vi.stubGlobal('fetch', fetcher);
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toBeInstanceOf(SpotPlacementError);
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toBeInstanceOf(SpotPlacementError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(entries.get(key)?.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it.each(['invalid', '0', '-10'])('uses at least a 30-second cooldown for Retry-After %s', async retryAfter => {
    const { entries } = edgeCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': retryAfter } })));
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toBeInstanceOf(SpotPlacementError);
    expect(entries.get(key)?.headers.get('Cache-Control')).toBe('public, max-age=30');
  });

  it('parses a date-form Retry-After', async () => {
    const { entries } = edgeCache();
    const now = Date.parse('2026-10-09T00:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': new Date(now + 90000).toUTCString() } })));
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toBeInstanceOf(SpotPlacementError);
    expect(entries.get(key)?.headers.get('Cache-Control')).toBe('public, max-age=90');
  });

  it('reuses a last successful map during an outage but never regenerates stored battle spots', async () => {
    const { entries } = edgeCache();
    const fetcher = vi.fn().mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetcher);
    await generateBattleSpots(35, 139, 2000);
    entries.delete(key); // fresh one-hour entry expired; 24-hour success still exists
    fetcher.mockImplementation(async () => new Response('', { status: 504 }));
    expect((await generateBattleSpots(35, 139, 2000)).length).toBeGreaterThan(5);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await entries.get(key)?.clone().json()).toEqual({ unavailable: true });
    expect((await generateBattleSpots(35, 139, 2000)).length).toBeGreaterThan(5);
    expect(fetcher).toHaveBeenCalledTimes(3); // cooldown + recent success avoid more requests
  });

  it.each(['expired', 'future', 'corrupt', 'partial'])('rejects %s last-success data when both providers fail', async kind => {
    const { entries } = edgeCache();
    const saved = kind === 'expired' ? Date.now() - 86400001 : kind === 'future' ? Date.now() + 60000 : Date.now();
    entries.set(`${key}/last-success`, new Response(kind === 'corrupt' ? 'bad json' : JSON.stringify({
      saved_at: saved, data: kind === 'partial' ? { ...publicMap, remark: 'timeout' } : publicMap,
    })));
    const fetcher = vi.fn(async () => new Response('', { status: 504 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('recovers from a corrupt fresh cache', async () => {
    const { entries } = edgeCache();
    entries.set(key, new Response('invalid json'));
    const fetcher = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetcher);
    expect((await generateBattleSpots(35, 139, 2000)).length).toBeGreaterThan(5);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not fail placement when optional cache reads/writes are unavailable', async () => {
    vi.stubGlobal('caches', { default: { match: vi.fn(async () => { throw new Error('cache failed'); }), put: vi.fn(async () => { throw new Error('cache failed'); }) } });
    const fetcher = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetcher);
    expect((await generateBattleSpots(35, 139, 2000)).length).toBeGreaterThan(5);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent same-rounded-area fetches and clears pending state', async () => {
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const first = generateBattleSpots(35, 139, 2000);
    const second = generateBattleSpots(35.0001, 139.0001, 2000);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    release(ok());
    const spots = await Promise.all([first, second]);
    expect(spots.every(s => s.length > 5)).toBe(true);
    fetcher.mockImplementation(async () => ok());
    await generateBattleSpots(35, 139, 2000);
    expect(fetcher).toHaveBeenCalledTimes(2); // no cache in this test; no leaked in-flight entry
  });

  it('never switches provider just because a valid map has no public walking ways', async () => {
    const fetcher = vi.fn(async () => new Response('{"elements":[]}'));
    vi.stubGlobal('fetch', fetcher);
    await expect(generateBattleSpots(35, 139, 2000)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
