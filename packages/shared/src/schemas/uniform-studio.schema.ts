import { z } from 'zod';

export const UNIFORM_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const UNIFORM_THUMBNAIL_MAX_BYTES = 128 * 1024;
export const UNIFORM_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const path = z.string().max(20000).regex(/^[MmLlHhVvCcSsQqTtAaZzEe0-9+.,\s-]*$/);
export const uniformModelProfileSchema = z.object({
  outer: path.min(1), body: path.min(1), sleeveSeam: path, sideSeam: path,
  hem: path, cuff: path, cuffSeam: path,
  neckline: path.optional(), collar: path.optional(), cavity: path.optional(),
}).strict();
export const uniformModelDefinitionSchema = z.object({
  format: z.literal('physiproof-uniform-model'), version: z.literal(1),
  view_box: z.literal('0 0 600 640'),
  front: uniformModelProfileSchema, back: uniformModelProfileSchema,
}).strict().refine(value => JSON.stringify(value).length <= 100000, 'モデル定義は100KB以内です。');
export type UniformModelDefinition = z.infer<typeof uniformModelDefinitionSchema>;
export const uniformAssetRefSchema = z.object({ id, revision: z.number().int().min(1).max(1000000) }).strict();
export type UniformAssetRef = z.infer<typeof uniformAssetRefSchema>;
export const studioPatternSchema = z.union([z.enum(['none', 'stripe', 'block', 'shoulder']), uniformAssetRefSchema]);
export const studioEmblemSchema = z.union([z.enum(['none', 'shield', 'star', 'monogram', 'circle']), uniformAssetRefSchema]);
export const studioFontSchema = z.enum(['athletic', 'serif', 'sans', 'mono']);
export const studioUniformDesignSchema = z.object({
  version: z.literal(2), model: uniformAssetRefSchema,
  front_pattern: studioPatternSchema, back_pattern: studioPatternSchema,
  fabric: z.enum(['knit', 'mesh', 'pique']), emblem: studioEmblemSchema,
  emblem_position: z.enum(['left', 'center', 'right']),
  colors: z.object({ body: color, accent: color, detail: color, text: color }).strict(),
  jersey_name: z.string().trim().max(12), number: z.string().regex(/^\d{0,3}$/),
  name_font: studioFontSchema, number_font: studioFontSchema,
  name_position: z.enum(['high', 'middle', 'low']), number_position: z.enum(['high', 'middle', 'low']),
  name_size: z.number().int().min(12).max(32), number_size: z.number().int().min(60).max(150),
}).strict();
export type StudioUniformDesign = z.infer<typeof studioUniformDesignSchema>;

const drawingLayer = z.object({
  id: z.string().regex(/^layer-[a-zA-Z0-9-]{1,80}$/),
  type: z.enum(['rect', 'ellipse', 'triangle', 'star', 'shield', 'line', 'pen']),
  name: z.string().trim().min(1).max(50).regex(/^[^<>\u0000-\u001f\u007f-\u009f]+$/),
  x: z.number().finite().min(-4000).max(4000), y: z.number().finite().min(-4000).max(4000),
  width: z.number().finite().min(1).max(4000), height: z.number().finite().min(1).max(4000),
  fill: z.union([color, z.literal('none')]), stroke: z.union([color, z.literal('none')]),
  strokeWidth: z.number().finite().min(0).max(40), opacity: z.number().finite().min(0).max(1),
  points: z.array(z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)])).min(2).max(2048).optional(),
}).strict().superRefine((layer, ctx) => {
  const isLine = layer.type === 'line' || layer.type === 'pen';
  if (isLine ? !layer.points || layer.fill !== 'none' || (layer.type === 'line' && layer.points.length !== 2) : layer.points !== undefined) {
    ctx.addIssue({ code: 'custom', message: '線の点・塗りの設定が不正です。' });
  }
});
export const uniformDrawingSourceSchema = z.object({
  format: z.literal('uniform-studio-drawing'), version: z.literal(1),
  document: z.object({
    kind: z.enum(['pattern', 'emblem']),
    template: z.enum(['pattern-body', 'pattern-all', 'pattern-repeat', 'emblem-shield', 'emblem-circle', 'emblem-blank']),
    name: z.string().trim().min(1).max(60).regex(/^[^<>\u0000-\u001f\u007f-\u009f]+$/),
    width: z.number().int(), height: z.number().int(), layers: z.array(drawingLayer).max(100),
  }).strict(),
}).strict().superRefine(({ document: d }, ctx) => {
  const size = d.template === 'pattern-body' ? [244, 480] : d.template === 'pattern-all' ? [432, 480] : [400, 400];
  if (!d.template.startsWith(d.kind) || d.width !== size[0] || d.height !== size[1]
    || new Set(d.layers.map(l => l.id)).size !== d.layers.length || d.layers.reduce((n, l) => n + (l.points?.length ?? 0), 0) > 20000) {
    ctx.addIssue({ code: 'custom', message: '原稿のサイズ・種類・レイヤー・点数が不正です。' });
  }
});
export type UniformDrawingSource = z.infer<typeof uniformDrawingSourceSchema>;

export const uniformAssetMetadataSchema = z.object({
  name: z.string().trim().min(1).max(60), category: z.string().trim().min(1).max(30),
  description: z.string().trim().max(160), status: z.enum(['draft', 'published', 'hidden']),
  sort_order: z.number().int().min(0).max(999999), revision: z.number().int().min(0),
});
const png = z.string().startsWith('data:image/png;base64,');
const imagePayload = uniformAssetMetadataSchema.extend({
  png_data_url: png.max(Math.ceil(UNIFORM_IMAGE_MAX_BYTES / 3) * 4 + 22),
  thumbnail_data_url: png.max(Math.ceil(UNIFORM_THUMBNAIL_MAX_BYTES / 3) * 4 + 22),
  color_mode: z.enum(['original', 'tint']), placement: z.enum(['body', 'all', 'repeat']),
  scale: z.number().int().min(20).max(180), drawing_source: uniformDrawingSourceSchema.optional(),
});
export const saveUniformAssetSchema = z.discriminatedUnion('kind', [
  uniformAssetMetadataSchema.extend({ kind: z.literal('model'), model_definition: uniformModelDefinitionSchema }).strict(),
  imagePayload.extend({ kind: z.literal('pattern') }).strict(),
  imagePayload.extend({ kind: z.literal('emblem') }).strict(),
]).superRefine((asset, ctx) => {
  if (asset.kind !== 'model' && asset.drawing_source && (asset.drawing_source.document.kind !== asset.kind
    || new TextEncoder().encode(JSON.stringify(asset.drawing_source)).length > UNIFORM_SOURCE_MAX_BYTES)) {
    ctx.addIssue({ code: 'custom', message: '素材と原稿の種類・サイズが一致しません。' });
  }
});
export type SaveUniformAsset = z.infer<typeof saveUniformAssetSchema>;
export const uniformAssetSchema = uniformAssetMetadataSchema.extend({
  id, kind: z.enum(['model', 'pattern', 'emblem']), builtin: z.boolean(),
  width: z.number().int().nonnegative(), height: z.number().int().nonnegative(),
  color_mode: z.enum(['original', 'tint']), placement: z.enum(['body', 'all', 'repeat']), scale: z.number(),
  model_definition: uniformModelDefinitionSchema.nullable(), image_path: z.string().nullable(), thumbnail_path: z.string().nullable(),
  drawing_available: z.boolean(),
}).strict();
export type UniformAsset = z.infer<typeof uniformAssetSchema>;
export const uniformAssetQuerySchema = z.object({
  kind: z.enum(['model', 'pattern', 'emblem']).default('model'),
  search: z.string().trim().max(80).default(''), category: z.string().trim().max(30).default(''),
  page: z.string().regex(/^[1-9]\d{0,4}$/).default('1'), limit: z.enum(['12', '24']).default('12'),
});
export const adminUniformAssetQuerySchema = uniformAssetQuerySchema.extend({ status: z.enum(['all', 'draft', 'published', 'hidden']).default('all') });
export const uniformAssetListSchema = z.object({ items: z.array(uniformAssetSchema), total: z.number().int().nonnegative(), categories: z.array(z.string()), storage_ready: z.boolean() });
export type UniformAssetList = z.infer<typeof uniformAssetListSchema>;
