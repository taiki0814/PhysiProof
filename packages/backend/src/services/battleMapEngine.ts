import { area } from '@turf/area';
import { union } from '@turf/union';
import { difference } from '@turf/difference';
import { feature, featureCollection, polygon } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import type { BattleSpot } from '@my-app/shared';
import { territoryGeometrySchema } from '@my-app/shared';

export type Region = Feature<Polygon | MultiPolygon>;
export type MapRow = { territory_id: string; team_id: string; geometry_json: string; area_sqm: number };
export type MapEvent = { id: number; kind: 'territory' | 'capture'; territory_id: string | null; team_id: string | null; user_id: string | null; geometry_json: string | null; area_sqm: number; recorded_at: string };
export type MapRules = { starts_at: string; ends_at: string; map_mode: 'shared' | 'isolated'; spot_holding_multiplier: number; spot_capture_points: number; holding_points_per_1000_sqm_full_period: number };
export function timestamp(value: string) { return Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'); }

export function parseRegion(raw: string): Region {
  const data = JSON.parse(raw);
  if (data?.type === 'Polygon' || data?.type === 'MultiPolygon') return feature(territoryGeometrySchema.parse(data)) as Region;
  if (!Array.isArray(data) || data.length < 3) throw new Error('領域の座標が不正です。');
  const ring = data.map((p: unknown) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) throw new Error('領域の座標が不正です。');
    return [p[1], p[0]];
  });
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push(ring[0]);
  return polygon([ring]);
}
export function mergeRegions(regions: Region[]): Region | null {
  if (!regions.length) return null;
  return regions.length === 1 ? regions[0] : union(featureCollection(regions));
}
export function subtractRegion(source: Region, mask: Region | null): Region | null {
  return mask ? difference(featureCollection([source, mask])) : source;
}
export function components(region: Region): Region[] {
  return region.geometry.type === 'Polygon' ? [region] : region.geometry.coordinates.map(rings => polygon(rings));
}
// Strict interior containment, including holes: boundary points are not captured.
function insideRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-14 && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0]) && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])) return false;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function contains(region: Region, lat: number, lng: number): boolean {
  return components(region).some(part => {
    const rings = part.geometry.coordinates as Position[][];
    if (!insideRing([lng, lat], rings[0])) return false;
    // Hole boundary is excluded too (a small cross product check covers its edge).
    return !rings.slice(1).some(ring => insideRing([lng, lat], ring) || ring.some((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return Math.abs((lng - a[0]) * (b[1] - a[1]) - (lat - a[1]) * (b[0] - a[0])) < 1e-14 && lng >= Math.min(a[0], b[0]) && lng <= Math.max(a[0], b[0]) && lat >= Math.min(a[1], b[1]) && lat <= Math.max(a[1], b[1]);
    }));
  });
}

/** Read-only, immutable event replay. Captures and holding stop exactly at ends_at. */
export function replayBattleMap(
  rules: MapRules, baseline: MapRow[], events: MapEvent[], spots: Pick<BattleSpot, 'id' | 'latitude' | 'longitude'>[],
  participants: string[], roster: { user_id: string; team_id: string }[], nowMs: number,
) {
  const start = timestamp(rules.starts_at), end = timestamp(rules.ends_at);
  const until = Math.max(start, Math.min(end, nowMs));
  const current = new Map<string, MapRow>(baseline.map(r => [r.territory_id, r]));
  const baselineArea = new Map<string, number>();
  const baselineGeometry = new Map<string, Region | null>();
  const originals = new Map<string, Region[]>();
  for (const row of baseline) {
    baselineArea.set(row.team_id, (baselineArea.get(row.team_id) ?? 0) + row.area_sqm);
    const rows = originals.get(row.team_id) ?? []; rows.push(parseRegion(row.geometry_json)); originals.set(row.team_id, rows);
  }
  for (const [team, regions] of originals) baselineGeometry.set(team, mergeRegions(regions));
  const liveSpots: BattleSpot[] = spots.map(s => ({ ...s, owner_team_id: null, first_capture_team_ids: [] }));
  const integrals = new Map(participants.map(team => [team, { base: 0, bonus: 0 }]));
  const eligibleUsers = new Set(roster.map(r => `${r.team_id}:${r.user_id}`));
  let cursor = start;
  let teamRegions = new Map<string, Region | null>();
  let teamAreas = new Map<string, number>();
  function refresh() {
    const groups = new Map<string, Region[]>(); teamAreas = new Map();
    for (const row of current.values()) {
      teamAreas.set(row.team_id, (teamAreas.get(row.team_id) ?? 0) + row.area_sqm);
      const group = groups.get(row.team_id) ?? []; group.push(parseRegion(row.geometry_json)); groups.set(row.team_id, group);
    }
    teamRegions = new Map([...groups].map(([team, shapes]) => [team, mergeRegions(shapes)]));
  }
  function buffArea(team: string) {
    const region = teamRegions.get(team);
    if (!region) return 0;
    let sqm = 0;
    for (const component of components(region)) {
      if (!liveSpots.some(s => s.owner_team_id === team && contains(component, s.latitude, s.longitude))) continue;
      const fresh = subtractRegion(component, baselineGeometry.get(team) ?? null);
      if (fresh) sqm += area(fresh);
    }
    // Shared-world losses elsewhere must still offset gains. No old area bonus,
    // and buffed area can never exceed positive team-wide net growth.
    return Math.min(sqm, Math.max(0, (teamAreas.get(team) ?? 0) - (baselineArea.get(team) ?? 0)));
  }
  function advance(time: number) {
    const seconds = Math.max(0, time - cursor) / 1000;
    for (const team of participants) {
      const integral = integrals.get(team)!;
      integral.base += Math.max(0, (teamAreas.get(team) ?? 0) - (baselineArea.get(team) ?? 0)) * seconds;
      integral.bonus += buffArea(team) * seconds * (rules.spot_holding_multiplier - 1);
    }
    cursor = time;
  }
  refresh();
  for (const event of [...events].sort((a, b) => timestamp(a.recorded_at) - timestamp(b.recorded_at) || a.id - b.id)) {
    const time = timestamp(event.recorded_at);
    if (nowMs < start || time < start || time >= end || time > until) continue;
    if (!Number.isFinite(time)) throw new Error('Invalid map event timestamp');
    advance(time);
    if (event.kind === 'territory' && event.territory_id) {
      if (event.geometry_json && event.team_id && event.area_sqm > 0) current.set(event.territory_id, { territory_id: event.territory_id, team_id: event.team_id, geometry_json: event.geometry_json, area_sqm: event.area_sqm });
      else current.delete(event.territory_id);
      refresh();
    } else if (event.kind === 'capture' && event.geometry_json) {
      const footprint = parseRegion(event.geometry_json);
      const eligible = event.team_id && participants.includes(event.team_id) && eligibleUsers.has(`${event.team_id}:${event.user_id}`);
      for (const spot of liveSpots) {
        if (contains(footprint, spot.latitude, spot.longitude)) {
          const actual = event.team_id ? teamRegions.get(event.team_id) : null;
          spot.owner_team_id = eligible && actual && contains(actual, spot.latitude, spot.longitude) ? event.team_id : null;
          if (spot.owner_team_id && !spot.first_capture_team_ids.includes(spot.owner_team_id)) spot.first_capture_team_ids.push(spot.owner_team_id);
        } else if (spot.owner_team_id) {
          const actual = teamRegions.get(spot.owner_team_id);
          if (!actual || !contains(actual, spot.latitude, spot.longitude)) spot.owner_team_id = null;
        }
      }
    }
  }
  advance(until);
  for (const spot of liveSpots) if (spot.owner_team_id) {
    const actual = teamRegions.get(spot.owner_team_id);
    if (!actual || !contains(actual, spot.latitude, spot.longitude)) spot.owner_team_id = null;
  }
  const coefficient = rules.holding_points_per_1000_sqm_full_period / ((end - start) / 1000) / 1000;
  const scores = new Map(participants.map(team => {
    const integral = integrals.get(team)!;
    const captures = liveSpots.filter(s => s.first_capture_team_ids.includes(team)).length;
    return [team, { territory_delta_sqm: (teamAreas.get(team) ?? 0) - (baselineArea.get(team) ?? 0), holding_area_sqm_seconds: integral.base, holding_points: integral.base * coefficient, holding_bonus_points: integral.bonus * coefficient, spot_capture_points: captures * rules.spot_capture_points, captured_spots: captures }];
  }));
  const territories = [...teamRegions].flatMap(([team, shape]) => shape ? components(shape).map((part, i) => ({
    id: `${team}:${i}`, team_id: team, geometry: part.geometry, area_sqm: area(part),
    buffed: liveSpots.some(s => s.owner_team_id === team && contains(part, s.latitude, s.longitude)) && !!subtractRegion(part, baselineGeometry.get(team) ?? null),
  })) : []);
  return { scores, territories, spots: liveSpots };
}
