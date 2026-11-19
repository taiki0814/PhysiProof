import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { tokenHash } from './authSession';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000,
});
const identitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().email().max(320),
  email_verified: z.literal(true),
  nonce: z.string().min(1).max(255),
  name: z.string().max(200).optional(),
});

export function googleClientId(value: string | undefined) {
  return value && /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null;
}

export async function verifyGoogleIdentity(credential: string, clientId: string, nonceHash: string) {
  const { payload } = await jwtVerify(credential, keys, {
    algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId, requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
    maxTokenAge: '10 minutes', clockTolerance: 5,
  });
  const identity = identitySchema.parse(payload);
  if (await tokenHash(identity.nonce) !== nonceHash) throw new Error('Google login challenge mismatch');
  return { subject: identity.sub, email: identity.email, name: identity.name?.slice(0, 50) ?? '' };
}
