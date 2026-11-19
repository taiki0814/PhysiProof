import { afterEach, describe, expect, it, vi } from 'vitest';
import client from './hc';

afterEach(() => { vi.unstubAllGlobals(); });
describe('authentication request header isolation', () => {
  const id = 'f45bb240-1c17-4ad2-9a14-b7f1ffbcf658';
  function setup() {
    const fetch = vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'physiproof_access_token' ? 'new-session' : key === 'physiproof_uniform_admin_token' ? 'admin-token' : null });
    return fetch;
  }
  it('keeps public Android handoff requests free of browser session and admin credentials', async () => {
    const fetch = setup();
    await client.api.auth.android.start.$post({ json: { proof_hash: 'a'.repeat(64) } });
    await client.api.auth.android[':request_id'].$get({ param: { request_id: id } });
    await client.api.auth.android[':request_id'].exchange.$post({ param: { request_id: id }, json: { proof: 'b'.repeat(64) } });
    for (const [, init] of fetch.mock.calls as unknown as [unknown, RequestInit][]) {
      const headers = new Headers(init.headers);
      expect(headers.has('Authorization')).toBe(false);
      expect(headers.has('X-Uniform-Admin-Token')).toBe(false);
    }
  });
  it('uses the exact confirmed session and excludes admin-only headers from approval preflight', async () => {
    const fetch = setup();
    await client.api.auth.android[':request_id'].approve.$post({ param: { request_id: id }, json: { confirmation_code: '12345678' } }, { headers: { Authorization: 'Bearer confirmed-session' } });
    const [, init] = (fetch.mock.calls as unknown as [unknown, RequestInit][])[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer confirmed-session');
    expect(headers.get('Authorization')).not.toContain(',');
    expect(headers.has('X-Uniform-Admin-Token')).toBe(false);
  });
  it('retains ordinary authenticated and admin API headers', async () => {
    const fetch = setup();
    await client.api.auth.google.link.$get();
    const [, init] = (fetch.mock.calls as unknown as [unknown, RequestInit][])[0];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer new-session');
    expect(headers.get('X-Uniform-Admin-Token')).toBe('admin-token');
  });
});
