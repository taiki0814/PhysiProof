import { z } from 'zod';
import { runningTrendCellSchema } from './running-trends.schema';

// Only administrator-registered public areas, never arbitrary spatial queries.
export const publicRunningPlaceSchema = z.object({
  name:z.string().trim().min(1).max(80), description:z.string().trim().max(240),
  south:z.number().finite().min(-85).max(85), north:z.number().finite().min(-85).max(85),
  west:z.number().finite().min(-180).max(180), east:z.number().finite().min(-180).max(180),
  active:z.boolean(), public_area_confirmed:z.literal(true),
}).strict().superRefine((p,c)=>{
  if(p.north-p.south<0.002||p.north-p.south>0.05||p.east-p.west<0.002||p.east-p.west>0.05)
    c.addIssue({code:'custom',path:['north'],message:'緯度・経度の幅は0.002〜0.05度で、北＞南・東＞西にしてください。'});
});
export const runningPlaceSchema=z.object({
  id:z.string().min(1).max(64), name:z.string(), description:z.string(),
  south:z.number(),north:z.number(),west:z.number(),east:z.number(),active:z.boolean(),
});
export const runningPlaceListSchema=z.object({places:z.array(runningPlaceSchema).max(100)});
export const placeTrendQuerySchema=z.object({place_id:z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),weeks:z.enum(['4','8']).default('4')}).strict();
export const placeSharingSchema=z.object({sharing:z.boolean()}).strict();
export const placeTrendResponseSchema=z.object({
  place:runningPlaceSchema, weeks:z.union([z.literal(4),z.literal(8)]), starts_at:z.string().datetime(),ends_at:z.string().datetime(),
  timezone:z.literal('Asia/Tokyo'),method:z.literal('place_passages'),sharing:z.boolean(),min_participants:z.literal(5),min_dates:z.literal(3),
  cells:z.array(runningTrendCellSchema.extend({count:z.null(),level:z.enum(['low','medium','high','insufficient'])})).length(84),
}).refine(p=>new Set(p.cells.map(c=>c.weekday*12+c.slot)).size===84,'集計区分が重複しています。');
export type RunningPlace=z.infer<typeof runningPlaceSchema>;
export type PublicRunningPlaceInput=z.infer<typeof publicRunningPlaceSchema>;
export type PlaceTrendResponse=z.infer<typeof placeTrendResponseSchema>;

export function placesAtFix<T extends RunningPlace>(places:T[],latitude:number,longitude:number):T[]{
  return places.filter(p=>p.active&&latitude>=p.south&&latitude<=p.north&&longitude>=p.west&&longitude<=p.east);
}
