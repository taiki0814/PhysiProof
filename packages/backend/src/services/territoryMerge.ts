import { union } from '@turf/union';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';

export interface RawTerritory {
  id: string;
  area_polygon: string;
  fortification_level: number;
  latitude: number;
  longitude: number;
  time_period: string;
}

export interface NewTerritoryInput {
  latitude: number;
  longitude: number;
  time_period: string;
  area_polygon: string; // JSON string of [lat, lng][]
}

export interface MergeGroupResult {
  originalIds: string[];
  poly: any;
  fortification_level: number;
  latitude: number;
  longitude: number;
  time_period: string;
  hasNew: boolean;
}

/**
 * 新領域と自分の既存領域をマージし、重なっている領域を1つの領域に統合したグループ一覧を返します。
 */
export function performTerritoryMerge(
  newInput: NewTerritoryInput | null,
  existingTerritories: RawTerritory[]
): MergeGroupResult[] {
  // 1. 新ポリゴンの準備
  let activePoly = null;
  if (newInput) {
    try {
      const coords: [number, number][] = JSON.parse(newInput.area_polygon);
      if (Array.isArray(coords) && coords.length >= 3) {
        const ring = coords.map(([lat, lng]) => [lng, lat] as [number, number]);
        const f = ring[0], l = ring[ring.length - 1];
        if (f[0] !== l[0] || f[1] !== l[1]) ring.push(f);
        activePoly = turfPolygon([ring]);
      }
    } catch (e) {
      console.error('Failed to parse new polygon:', e);
    }
  }

  const groups: MergeGroupResult[] = [];

  // 新領域をグループとして追加
  if (newInput && activePoly) {
    groups.push({
      originalIds: [],
      poly: activePoly,
      fortification_level: 1,
      latitude: newInput.latitude,
      longitude: newInput.longitude,
      time_period: newInput.time_period,
      hasNew: true
    });
  }

  // 既存の領域をそれぞれ単一のグループとして追加
  for (const myT of existingTerritories) {
    try {
      const myCoords: [number, number][] = JSON.parse(myT.area_polygon);
      if (!Array.isArray(myCoords) || myCoords.length < 3) continue;

      const myRing = myCoords.map(([lat, lng]) => [lng, lat] as [number, number]);
      const mf = myRing[0], ml = myRing[myRing.length - 1];
      if (mf[0] !== ml[0] || mf[1] !== ml[1]) myRing.push(mf);

      const myTurfPoly = turfPolygon([myRing]);
      groups.push({
        originalIds: [myT.id],
        poly: myTurfPoly,
        fortification_level: myT.fortification_level,
        latitude: myT.latitude,
        longitude: myT.longitude,
        time_period: myT.time_period,
        hasNew: false
      });
    } catch (e) {
      console.error('Failed to parse existing polygon for merge:', e);
    }
  }

  // 重なっているグループ同士を再帰的にマージ
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const g1 = groups[i];
        const g2 = groups[j];

        // union を試みる。重ならない場合は MultiPolygon が返るため判定する
        const merged = union(featureCollection([g1.poly, g2.poly]));
        if (merged && merged.geometry.type === 'Polygon') {
          g1.poly = merged as any;
          g1.originalIds.push(...g2.originalIds);
          g1.fortification_level = Math.max(g1.fortification_level, g2.fortification_level);
          g1.hasNew = g1.hasNew || g2.hasNew;

          // 代表値は、既存領域がある場合は既存領域を優先、なければ新しい情報を引き継ぐ
          if (g1.originalIds.length === 0 && g2.originalIds.length > 0) {
            g1.latitude = g2.latitude;
            g1.longitude = g2.longitude;
            g1.time_period = g2.time_period;
          }

          groups.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return groups;
}
