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
