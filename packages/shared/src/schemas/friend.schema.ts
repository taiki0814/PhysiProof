import { z } from 'zod';

export const sendFriendRequestSchema = z.object({
  target_user_id: z.string().min(1, '対象のユーザーIDは必須です'),
});

export type SendFriendRequest = z.infer<typeof sendFriendRequestSchema>;

export const respondFriendRequestSchema = z.object({
  request_id: z.string().min(1, 'リクエストIDは必須です'),
  action: z.enum(['accept', 'reject']),
});

export type RespondFriendRequest = z.infer<typeof respondFriendRequestSchema>;

export const friendSearchQuerySchema = z.object({
  q: z.string().optional(),
});

export type FriendSearchQuery = z.infer<typeof friendSearchQuerySchema>;
