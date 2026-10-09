import { describe, expect, it } from 'vitest';
import { prefectureBoundaries } from '../data/prefectureBoundaries';
import { locatePrefecture, withinPrefecture, choosePrefectureSpots, compactCandidates, parsePrefectureCandidates, prefectureWalkingQuery } from './prefectureSpots';
import { metresBetween } from './battleSpots';

const timestamp = '2026-10-09T01:00:00.000Z', now = Date.parse(timestamp);
const tokyo = prefectureBoundaries[12];
describe('prefecture identification and public-path spot placement', () => {
  it('contains all 47 unique codes, including detached island polygons', () => {
    expect(prefectureBoundaries).toHaveLength(47);
    expect(new Set(prefectureBoundaries.map(r => r.code)).size).toBe(47);
    expect(tokyo.polygons.length).toBeGreaterThan(10);
  });
  it.each([
    [35.7148,139.773,'JP-13'], [35.65,139.54,'JP-13'], [34.75,139.36,'JP-13'],
    [35.52,139.7,'JP-14'], [35.6,140.1,'JP-12'], [43.06,141.35,'JP-01'],
    [26.212,127.68,'JP-47'], [34.6937,135.5023,'JP-27'], [35.1815,136.9066,'JP-23'],
  ])('resolves %s,%s to %s without contacting a geocoder', (lat, lng, code) => {
    expect(locatePrefecture(lat, lng, timestamp, now).code).toBe(code);
  });
  it('rejects sea, overseas, invalid and stale/future fixes', () => {
    for (const p of [[0,0], [35.5,139.9], [NaN,139]]) expect(() => locatePrefecture(p[0],p[1],timestamp,now)).toThrow();
    expect(() => locatePrefecture(35.7148,139.773,timestamp,now+300001)).toThrow('5分');
    expect(() => locatePrefecture(35.7148,139.773,timestamp,now-30001)).toThrow();
    expect(locatePrefecture(35.7148,139.773,timestamp,now+300000).name).toBe('東京都');
  });
  it('does not use the wide bounding box to admit another prefecture', () => {
    expect(withinPrefecture(tokyo,35.52,139.7)).toBe(false);
    expect(withinPrefecture(tokyo,35.6,140.1)).toBe(false);
    expect(withinPrefecture(tokyo,34.75,139.36)).toBe(true);
  });
  it('queries only the prefecture and explicitly permitted walking ways, then clips actual nodes', () => {
    const query = prefectureWalkingQuery('JP-13');
    expect(query).toContain('ISO3166-2"="JP-13');
    expect(query).toContain('private|no|customers|permit');
    expect(query).toContain('node(w.walking)(area.pref)');
    expect(query).not.toContain('around:');
    expect(() => prefectureWalkingQuery('JP-13"];out;')).toThrow();
  });
  it('rejects partial/wrong-prefecture/invalid responses instead of accepting incomplete coverage', () => {
    const area = {type:'area',tags:{'ISO3166-2':'JP-13'}};
    const node = {type:'node',lat:35.7148,lon:139.773};
    expect(parsePrefectureCandidates({elements:[area,node,{type:'node',lat:35.6,lon:140.1}]},tokyo)).toEqual([{latitude:35.7148,longitude:139.773}]);
    for (const data of [{remark:'runtime error',elements:[area,node]}, {elements:[node]},
      {elements:[{type:'area',tags:{'ISO3166-2':'JP-12'}},node]}, {elements:[area,{...node,lat:NaN}]}]) {
      expect(() => parsePrefectureCandidates(data,tokyo)).toThrow();
    }
  });
  it('keeps distant geographic coverage when compacting a large catalogue', () => {
    const points = Array.from({length:30000}, (_,i)=>({latitude:35+i*.0001,longitude:139+(i%100)*.01}));
    points.push({latitude:26,longitude:127},{latitude:43,longitude:141});
    const compact = compactCandidates(points);
    expect(compact.length).toBeLessThanOrEqual(20000);
    expect(compact).toContainEqual(points.at(-1)); expect(compact).toContainEqual(points.at(-2));
  });
  it('uses random placement throughout a large region with a hard marker count and spacing, not an area cap', () => {
    const paths = Array.from({length:6400}, (_,i)=>({latitude:35.6+Math.floor(i/80)*.005,longitude:139.3+(i%80)*.005}));
    const spots = choosePrefectureSpots(paths,()=>.25), other = choosePrefectureSpots(paths,()=>.75);
    expect(spots.length).toBeGreaterThan(100); expect(spots.length).toBeLessThanOrEqual(512);
    expect(other).not.toEqual(spots);
    expect(Math.max(...spots.map(s=>s.longitude))-Math.min(...spots.map(s=>s.longitude))).toBeGreaterThan(.35);
    expect(Math.max(...spots.map(s=>s.latitude))-Math.min(...spots.map(s=>s.latitude))).toBeGreaterThan(.35);
    expect(spots.every(s=>paths.includes(s))).toBe(true);
    for(let i=0;i<spots.length;i++) for(let j=i+1;j<spots.length;j++) expect(metresBetween(spots[i],spots[j])).toBeGreaterThanOrEqual(500);
  });
  it('returns an empty result for no valid public-path candidates', () => {
    expect(choosePrefectureSpots([])).toEqual([]);
  });
});
