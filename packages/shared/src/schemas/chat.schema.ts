import { z } from 'zod';

/**
 * AI チャットリクエストのバリデーションスキーマ
 */
export const chatRequestSchema = z.object({
  message: z.string().min(1, 'メッセージは必須です'),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * データベース保存用のチャットメッセージスキーマ
 */
export const chatMessageSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  sender: z.enum(['user', 'ai']),
  message: z.string(),
  created_at: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
