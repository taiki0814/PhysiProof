import { CHEST_INNER_MARGIN_M, CHEST_MAX_TRACE_POINTS, CHEST_TIERS } from '@my-app/shared';
import type { ChestTier } from '@my-app/shared';
import { metresBetween, type SpotPosition } from './battleSpots';

type Point = [number, number];
export type ChestPoint = { latitude: number | null; longitude: number | null; captured_at: number };
const project = (point: SpotPosition, origin: SpotPosition): Point => [
  (point.longitude - origin.longitude) * 111195 * Math.cos(origin.latitude * Math.PI / 180),
  (point.latitude - origin.latitude) * 111195,
];

function edgeDistance(a: Point, b: Point) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(...a);
  const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared));
  return Math.hypot(a[0] + dx * t, a[1] + dy * t);
}

function loopMetrics(points: SpotPosition[], chest: SpotPosition) {
  const vertices = points.map(point => project(point, chest));
  let twiceArea = 0, inside = false, clearance = Infinity;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i];
    twiceArea += a[0] * b[1] - b[0] * a[1];
    if ((a[1] > 0) !== (b[1] > 0) && a[0] + (b[0] - a[0]) * -a[1] / (b[1] - a[1]) > 0) inside = !inside;
    clearance = Math.min(clearance, edgeDistance(a, b));
  }
  return { area: Math.abs(twiceArea) / 2, clearance, inside };
}

function crossesItself(points: SpotPosition[], origin: SpotPosition) {
  const vertices = points.map(point => project(point, origin));
  const side = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const boundsOverlap = (a: number, b: number, c: number, d: number) =>
    Math.max(Math.min(a, b), Math.min(c, d)) <= Math.min(Math.max(a, b), Math.max(c, d));
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue;
      const c = vertices[j], d = vertices[(j + 1) % vertices.length];
      if (!boundsOverlap(a[0], b[0], c[0], d[0]) || !boundsOverlap(a[1], b[1], c[1], d[1])) continue;
      if (side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return true;
    }
  }
  return false;
}

export function chestTierForTrace(rows: ChestPoint[], chest: SpotPosition): ChestTier | null {
  if (rows.length > CHEST_MAX_TRACE_POINTS) return null;
  let points: SpotPosition[] = [], lastAt = 0;
  for (const row of rows) {
    if (row.latitude === null || row.longitude === null || row.captured_at - lastAt > 45000) points = [];
    lastAt = row.captured_at;
    if (row.latitude !== null && row.longitude !== null) points.push({ latitude: row.latitude, longitude: row.longitude });
  }
  if (points.length < 6 || metresBetween(points[0], points[points.length - 1]) > 25) return null;
  if (metresBetween(points[0], points[points.length - 1]) < 1) points.pop();
  const metrics = loopMetrics(points, chest);
  if (!metrics.inside || metrics.clearance < CHEST_INNER_MARGIN_M || crossesItself(points, chest)) return null;
  return [...CHEST_TIERS].reverse().find(tier => metrics.area >= tier.area)?.id ?? null;
}

/** Find a point inside a real closed walking way with room for the map marker. */
export function chestCandidateCenter(closedWay: SpotPosition[]): SpotPosition | null {
  if (closedWay.length < 4 || closedWay.length > 1000) return null;
  const start = closedWay[0], end = closedWay[closedWay.length - 1];
  if (start.latitude !== end.latitude || start.longitude !== end.longitude) return null;
  if (!closedWay.every(point => Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180)) return null;

  const points = closedWay.slice(0, -1);
  const center = {
    latitude: points.reduce((total, point) => total + point.latitude, 0) / points.length,
    longitude: points.reduce((total, point) => total + point.longitude, 0) / points.length,
  };
  const metrics = loopMetrics(points, center);
  if (!metrics.inside || metrics.clearance < CHEST_INNER_MARGIN_M + 6
    || metrics.area < CHEST_TIERS[0].area || metrics.area > 300000 || crossesItself(points, center)) return null;
  return center;
}
