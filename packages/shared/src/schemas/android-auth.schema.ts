import { z } from 'zod';
import { authSessionResponseSchema } from './auth.schema';

const proofHash = z.string().length(64).regex(/^[a-f0-9]{64}$/);
const confirmationCode = z.string().length(8).regex(/^[0-9]{8}$/);

export const androidAuthStartSchema = z.object({ proof_hash: proofHash }).strict();

export const androidAuthRequestSchema = z.object({
  request_id: z.string().uuid(),
  confirmation_code: confirmationCode,
  expires_at: z.string().datetime(),
}).strict();
export const androidAuthStartResultSchema = androidAuthRequestSchema;

export const androidAuthApproveSchema = z.object({ confirmation_code: confirmationCode }).strict();
export const androidAuthExchangeSchema = z.object({
  proof: z.string().length(64).regex(/^[a-fA-F0-9]{64}$/),
}).strict();
export const androidAuthExchangeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending') }).strict(),
  z.object({ status: z.literal('signed_in'), session: authSessionResponseSchema }).strict(),
]);

export type AndroidAuthRequest = z.infer<typeof androidAuthRequestSchema>;
export type AndroidAuthExchangeResult = z.infer<typeof androidAuthExchangeResultSchema>;
