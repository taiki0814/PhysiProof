/** Bundle with esbuild for Node, then pass the output and downloaded Overpass JSON paths. */
import { readFile, writeFile } from 'node:fs/promises';
import { prefectureBoundaries } from '../packages/backend/src/data/prefectureBoundaries';
import { findPrefecture } from '../packages/backend/src/services/prefectureSpots';
import { chestCandidateCenter } from '../packages/backend/src/services/mapChestGeometry';

type Candidate = [latitude: number, longitude: number, osmWayId: number];
type Way = { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
const restricted = new Set(['private', 'no', 'customers', 'permit', 'destination', 'delivery',
  'agricultural', 'forestry', 'military', 'residents']);

function isPublicWalkingWay(tags: Record<string, string>) {
  if (restricted.has(tags.access) || restricted.has(tags.foot) || 'access:conditional' in tags || 'foot:conditional' in tags) return false;
  if (['indoor', 'fee', 'area', 'construction'].some(key => tags[key] === 'yes')) return false;
  const footAllowed = ['yes', 'designated', 'permissive'].includes(tags.foot);
  const publicAccess = ['yes', 'permissive'].includes(tags.access);
  return ['footway', 'pedestrian'].includes(tags.highway)
    || (tags.highway === 'path' && footAllowed)
    || (tags.leisure === 'track' && tags.sport === 'running' && (publicAccess || footAllowed));
}

async function main() {
  const [output, ...inputs] = process.argv.slice(2);
  if (!output || !inputs.length) throw new Error('Expected an output path and one or more Overpass JSON inputs');
  const candidates = new Map(prefectureBoundaries.map(region => [region.code, new Map<string, Candidate>()]));
  for (const input of inputs) {
    const data = JSON.parse(await readFile(input, 'utf8')) as { remark?: string; elements: Way[] };
    if (data.remark || !Array.isArray(data.elements)) throw new Error('Incomplete map data: ' + input);
    for (const way of data.elements) {
      if (way.type !== 'way' || !Number.isSafeInteger(way.id) || !way.geometry || !way.tags || !isPublicWalkingWay(way.tags)) continue;
      const center = chestCandidateCenter(way.geometry.map(point => ({ latitude: point.lat, longitude: point.lon })));
      if (!center) continue;
      const region = findPrefecture(center.latitude, center.longitude);
      if (!region) continue;
      const pool = candidates.get(region.code)!;
      // Retain a representative per roughly 1 km cell so dense parks do not
      // crowd out an entire municipality in the weekly draw.
      const cell = `${Math.floor(center.latitude * 111.195)},${Math.floor(center.longitude * 90)}`;
      if (!pool.has(cell)) pool.set(cell, [Number(center.latitude.toFixed(6)), Number(center.longitude.toFixed(6)), way.id]);
    }
  }
  const pools = [...candidates].map(([code, cells]) => [code, [...cells.values()]] as const);
  const missing = pools.filter(([, points]) => !points.length).map(([code]) => code);
  if (missing.length) throw new Error(`No eligible closed walking way in ${missing.join(', ')}`);
  const rows = pools.map(([code, points]) => `  "${code}": ${JSON.stringify(points)},`).join('\n');
  await writeFile(output, `// © OpenStreetMap contributors, ODbL 1.0. See CHEST_CANDIDATE_DATA.md.\n`
    + `export const chestCandidates: Readonly<Record<string, readonly (readonly [number, number, number])[]>> = {\n${rows}\n};\n`);
  console.log(pools.map(([code, points]) => `${code}=${points.length}`).join(' '));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
