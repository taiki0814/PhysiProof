import { beforeEach, describe, expect, it, vi } from 'vitest';
const get = vi.hoisted(() => vi.fn());
vi.mock('./hc', () => ({ default: { api: { territories: { $get: get } } }, API_BASE_URL: 'fixture' }));
import { PUBLIC_MAP_CACHE_KEY, loadWorldTerritories, readPublicMapCache, writePublicMapCache } from './territoryCache';
import { escapeMapText } from './mapText';
const data = [{id:'public-area',user_id:'owner',age_band:'20'}];
let storage: Storage;
beforeEach(() => {
  const items = new Map<string,string>();
  storage = { getItem:k=>items.get(k)??null, setItem:(k,v)=>{items.set(k,v);}, removeItem:k=>{items.delete(k);} } as Storage;
  vi.stubGlobal('localStorage', storage); get.mockReset();
});
describe('bounded online-only public territory cache', () => {
  it('renders user-supplied map labels as text, not executable popup markup', () => {
    expect(escapeMapText('<img src=x onerror="bad()">')).toBe('&lt;img src=x onerror=&quot;bad()&quot;&gt;');
  });
  it('bounds storage size, age, malformed JSON and future timestamps', () => {
    for (const raw of ['{', JSON.stringify({etag:'x',saved:0,territories:[]}), 'x'.repeat(2_000_001), JSON.stringify({etag:'x',saved:Date.now()+100000,territories:[]})]) {
      storage.setItem(PUBLIC_MAP_CACHE_KEY,raw); expect(readPublicMapCache(storage)).toBeNull();
      expect(storage.getItem(PUBLIC_MAP_CACHE_KEY)).toBeNull();
    }
    writePublicMapCache(storage,{etag:'x',saved:Date.now(),territories:[{large:'x'.repeat(2_000_001)}]});
    expect(storage.getItem(PUBLIC_MAP_CACHE_KEY)).toBeNull();
  });
  it('uses a snapshot only after the server confirms 304', async () => {
    writePublicMapCache(storage,{etag:'"revision-1"',saved:Date.now(),territories:data});
    get.mockResolvedValue(new Response(null,{status:304}));
    expect(await loadWorldTerritories('all')).toEqual(data);
    expect(get.mock.calls[0][1].headers).toEqual({'If-None-Match':'"revision-1"'});
  });
  it('replaces an outdated snapshot and never uses it when offline', async () => {
    writePublicMapCache(storage,{etag:'old',saved:Date.now(),territories:data});
    get.mockRejectedValueOnce(new Error('offline'));
    await expect(loadWorldTerritories('all')).rejects.toThrow('offline');
    get.mockResolvedValue(new Response(JSON.stringify({territories:[]}),{headers:{ETag:'new'}}));
    expect(await loadWorldTerritories('all')).toEqual([]);
    expect(readPublicMapCache(storage)?.etag).toBe('new');
  });
  it('never persists friends-only responses or reuses public data for that scope', async () => {
    get.mockResolvedValue(new Response(JSON.stringify({territories:data}),{headers:{ETag:'friend'}}));
    expect(await loadWorldTerritories('friends')).toEqual(data);
    expect(storage.getItem(PUBLIC_MAP_CACHE_KEY)).toBeNull();
    expect(get.mock.calls[0][1].headers).toEqual({});
  });
  it('storage quota/disabled storage must not break the live response', async () => {
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('disabled');},removeItem:()=>{},setItem:()=>{throw Error('quota');}});
    get.mockResolvedValue(new Response(JSON.stringify({territories:data}),{headers:{ETag:'latest'}}));
    expect(await loadWorldTerritories('all')).toEqual(data);
  });
});
