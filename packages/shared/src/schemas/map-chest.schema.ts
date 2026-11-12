import { z } from 'zod';

export const CHEST_TIERS = [
  { id: 'small', label: '小', area: 500 },
  { id: 'medium', label: '中', area: 10000 },
  { id: 'large', label: '大', area: 40000 },
] as const;

export const CHEST_INNER_MARGIN_M = 12;
export const CHEST_MAX_TRACE_POINTS = 900;

export const CHEST_REWARDS = [
  { id: 'chest-sprout', name: 'トレイルスプラウト', tier: 'small', kind: 'emblem' },
  { id: 'chest-ripple', name: 'リップルライン', tier: 'small', kind: 'pattern' },
  { id: 'chest-compass', name: 'ノースコンパス', tier: 'medium', kind: 'emblem' },
  { id: 'chest-switchback', name: 'スイッチバック', tier: 'medium', kind: 'pattern' },
  { id: 'chest-crown', name: 'サミットクラウン', tier: 'large', kind: 'emblem' },
  { id: 'chest-aurora', name: 'オーロラリボン', tier: 'large', kind: 'pattern' },
] as const;

export const chestTierSchema = z.enum(['small', 'medium', 'large']);
export const chestRewardIdSchema = z.enum(['chest-sprout', 'chest-ripple', 'chest-compass', 'chest-switchback', 'chest-crown', 'chest-aurora']);
export const chestLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export const mapChestSchema = chestLocationSchema.extend({
  id: z.string().uuid(),
  claimed: z.boolean(),
});
export const mapChestsSchema = z.object({
  prefecture: z.string(),
  expires_at: z.number().int(),
  chests: z.array(mapChestSchema).max(12),
});
export const chestInventorySchema = z.object({
  rewards: z.array(chestRewardIdSchema),
  completion_badges: z.number().int().nonnegative(),
});
export const chestResultSchema = z.object({
  tier: chestTierSchema,
  reward_id: chestRewardIdSchema.nullable(),
});
export type ChestTier = z.infer<typeof chestTierSchema>;
export type MapChest = z.infer<typeof mapChestSchema>;
export type ChestResult = z.infer<typeof chestResultSchema>;
export type ChestRewardId = z.infer<typeof chestRewardIdSchema>;
