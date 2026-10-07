import { z } from 'zod';
import { uniformDesignSchema } from './uniform.schema';

export const uniformTemplateMetadataSchema = z.object({
  name: z.string().trim().min(1, 'テンプレート名を入力してください').max(50, 'テンプレート名は50文字以内です'),
  category: z.string().trim().min(1, 'カテゴリを入力してください').max(30, 'カテゴリは30文字以内です'),
  description: z.string().trim().max(160, '説明は160文字以内です'),
  status: z.enum(['draft', 'published', 'hidden']),
  sort_order: z.number().int().min(0).max(999999),
}).strict();
export const saveUniformTemplateSchema = uniformTemplateMetadataSchema.extend({
  design: uniformDesignSchema,
  revision: z.number().int().nonnegative(),
}).strict();
export const uniformTemplateSchema = uniformTemplateMetadataSchema.extend({
  id: z.string().min(1).max(64), design: uniformDesignSchema,
  revision: z.number().int().positive(), created_at: z.string(), updated_at: z.string(),
});
export const uniformTemplateQuerySchema = z.object({
  search: z.string().trim().max(80).default(''), category: z.string().trim().max(30).default(''),
  page: z.string().regex(/^[1-9]\d{0,4}$/).default('1'),
  limit: z.enum(['12', '24']).default('12'),
});
export const adminUniformTemplateQuerySchema = uniformTemplateQuerySchema.extend({
  status: z.enum(['all', 'draft', 'published', 'hidden']).default('all'),
});
export const uniformTemplateListSchema = z.object({
  templates: z.array(uniformTemplateSchema), total: z.number().int().nonnegative(), categories: z.array(z.string()),
});
export type UniformTemplate = z.infer<typeof uniformTemplateSchema>;
export type UniformTemplateMetadata = z.infer<typeof uniformTemplateMetadataSchema>;
export type SaveUniformTemplate = z.infer<typeof saveUniformTemplateSchema>;
export type UniformTemplateList = z.infer<typeof uniformTemplateListSchema>;
