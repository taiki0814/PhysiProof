import { z } from 'zod';

export const UNIFORM_REGION_LIMIT = 16;
export const UNIFORM_REGION_DIMENSION = 512;
const partId = z.string().regex(/^part-(?:[1-9]|1[0-6])$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const uniformColorPartSchema = z.object({
  id: partId, name: z.string().trim().min(1).max(30), color,
}).strict();
export const uniformRegionSummarySchema = z.object({
  version: z.literal(1), width: z.number().int().min(1).max(UNIFORM_REGION_DIMENSION),
  height: z.number().int().min(1).max(UNIFORM_REGION_DIMENSION),
  parts: z.array(uniformColorPartSchema).min(1).max(UNIFORM_REGION_LIMIT),
}).strict().refine(v => new Set(v.parts.map(p => p.id)).size === v.parts.length, '部位IDが重複しています。');
export const uniformColorRegionsSchema = z.object({
  version: z.literal(1), width: z.number().int().min(1).max(UNIFORM_REGION_DIMENSION),
  height: z.number().int().min(1).max(UNIFORM_REGION_DIMENSION),
  parts: z.array(uniformColorPartSchema).min(1).max(UNIFORM_REGION_LIMIT),
  labels_base64: z.string().max(Math.ceil(UNIFORM_REGION_DIMENSION ** 2 / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict().superRefine((v, ctx) => {
  try {
    const bytes = atob(v.labels_base64), allowed = new Set([0, ...v.parts.map(p => Number(p.id.slice(5)))]);
    if (bytes.length !== v.width * v.height || new Set(v.parts.map(p => p.id)).size !== v.parts.length) throw new Error();
    let assigned=false;
    for(let i=0;i<bytes.length;i++){const n=bytes.charCodeAt(i);if(!allowed.has(n))throw new Error();if(n)assigned=true;}
    if(!assigned)throw new Error();
  } catch { ctx.addIssue({ code: 'custom', message: '部位マップのサイズ・ID・内容が不正です。' }); }
});
export type UniformColorRegions = z.infer<typeof uniformColorRegionsSchema>;
export type UniformRegionSummary = z.infer<typeof uniformRegionSummarySchema>;
export const uniformPartPaletteSchema = z.record(partId, color).refine(v => Object.keys(v).length <= UNIFORM_REGION_LIMIT);
export const uniformPartColorsSchema = z.object({
  front_pattern: uniformPartPaletteSchema.optional(), back_pattern: uniformPartPaletteSchema.optional(), emblem: uniformPartPaletteSchema.optional(),
}).strict();
export type UniformPartPalette = z.infer<typeof uniformPartPaletteSchema>;
