import { z } from 'zod';
import { profileAgeSchema } from './profile-map.schema';

export const loginSchema = z.object({
  loginId: z.string().min(3, 'ログインIDは3文字以上である必要があります'),
  password: z.string().min(6, 'パスワードは6文字以上である必要があります'),
});

export const signupSchema = loginSchema.extend({
  name: z.string().min(1, '名前を入力してください'),
  age: profileAgeSchema,
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type SignupRequest = z.infer<typeof signupSchema>;

export const authSessionResponseSchema = z.object({
  success: z.literal(true),
  userId: z.string(),
  accessToken: z.string().regex(/^[a-f0-9]{64}$/),
  uniformAdminToken: z.string().optional(),
  name: z.string(),
  login_id: z.string(),
  role: z.string(),
}).passthrough();
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const googleAuthConfigSchema = z.object({ client_id: z.string().nullable() });
export const googleAuthChallengeSchema = z.object({
  challenge_id: z.string().uuid(),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  client_id: z.string(),
});
export const googleAuthRequestSchema = z.object({
  challenge_id: z.string().uuid(),
  credential: z.string().min(20).max(8000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  profile: z.object({ name: z.string().trim().min(1).max(50), age: profileAgeSchema }).strict().optional(),
}).strict();
export const googleSignInResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('signed_in'), session: authSessionResponseSchema }),
  z.object({ status: z.literal('profile_required'), default_name: z.string() }),
]);
export const googleLinkStatusSchema = z.object({
  client_id: z.string().nullable(),
  linked: z.boolean(),
  email: z.string().nullable(),
});
export type GoogleAuthRequest = z.infer<typeof googleAuthRequestSchema>;
