import { z } from 'zod';

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, '色は6桁のカラーコードで指定してください');
export const uniformPersonalizationSchema = z.object({
  jersey_name: z.string().trim().max(12, '名前は12文字以内で入力してください'),
  number: z.string().regex(/^\d{0,3}$/, '背番号は3桁以内の数字で入力してください'),
}).strict();

// Keep version 1 assets stable: new artwork should receive a new ID/version.
export const uniformDesignSchema = z.object({
  version: z.literal(1),
  base_id: z.enum(['classic', 'raglan', 'tank']),
  pattern_id: z.enum(['plain', 'diagonal', 'chevron', 'split', 'gradient', 'ink', 'grid', 'lightning']),
  line_id: z.enum(['none', 'shoulder', 'side', 'sleeve', 'arc', 'slash']),
  emblem_id: z.enum(['none', 'shield', 'flame', 'bolt', 'wing', 'star', 'mountain', 'wave', 'paw']),
  colors: z.object({
    body: colorSchema, secondary: colorSchema, collar: colorSchema,
    pattern: colorSchema, line: colorSchema, emblem: colorSchema, text: colorSchema,
  }).strict(),
  line_width: z.number().min(2).max(12),
  emblem_position: z.enum(['chest_left', 'chest_center', 'sleeve_left', 'back']),
  emblem_size: z.number().min(0.7).max(1.5),
  emblem_offset_x: z.number().min(-8).max(8),
  emblem_offset_y: z.number().min(-8).max(8),
  font_id: z.enum(['block', 'rounded', 'mono']),
  jersey_name: uniformPersonalizationSchema.shape.jersey_name,
  number: uniformPersonalizationSchema.shape.number,
}).strict();

export const saveUniformSchema = z.object({
  design: uniformDesignSchema,
  // Prevent a stale editor overwriting another device/member's update.
  revision: z.number().int().nonnegative(),
}).strict();
export const saveUniformPersonalizationSchema = z.object({
  personalization: uniformPersonalizationSchema,
  revision: z.number().int().nonnegative(),
}).strict();
export const uniformRecordSchema = z.object({ design: uniformDesignSchema, revision: z.number().int().nonnegative() });
export const uniformStateSchema = z.object({
  personal: uniformRecordSchema,
  team: z.object({
    id: z.string(), name: z.string(), can_edit: z.boolean(),
    design: uniformDesignSchema, revision: z.number().int().nonnegative(),
    personalization: uniformPersonalizationSchema,
    personalization_revision: z.number().int().nonnegative(),
  }).nullable(),
});
export const memberUniformStateSchema = z.object({
  personal: uniformDesignSchema,
  team: uniformDesignSchema,
});

export type UniformDesign = z.infer<typeof uniformDesignSchema>;
export type UniformPersonalization = z.infer<typeof uniformPersonalizationSchema>;
export type UniformState = z.infer<typeof uniformStateSchema>;
export type MemberUniformState = z.infer<typeof memberUniformStateSchema>;
export type SaveUniform = z.infer<typeof saveUniformSchema>;
