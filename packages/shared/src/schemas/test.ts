import { z } from 'zod';

export const testRequestSchema = z.object({
  name: z.string().min(1, '名前は必須です'),
});

export type TestRequest = z.infer<typeof testRequestSchema>;

export const testResponseSchema = z.object({
  message: z.string(),
});

export type TestResponse = z.infer<typeof testResponseSchema>;
