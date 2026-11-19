import { afterEach, describe, expect, it, vi } from 'vitest';
import { androidLoginReturn, androidRequestId, createAndroidProof, isAndroidApp, openAndroidBrowser } from './androidApp';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Android app authentication boundary', () => {
  const requestId = 'f45bb240-1c17-4ad2-9a14-b7f1ffbcf658';
  it('permits only the fixed approval route after browser login', () => {
    expect(androidLoginReturn('?app_request=' + requestId)).toBe('/app-login?request=' + requestId);
    for (const value of ['https://evil.example', '../dashboard', requestId + '&proof=secret', '1-1-1-1-1', '', null]) {
      expect(androidRequestId(value)).toBeNull();
      expect(androidLoginReturn('?app_request=' + encodeURIComponent(value || ''))).toBeNull();
    }
    expect(androidLoginReturn('?returnTo=https://evil.example')).toBeNull();
  });
  it('recognizes the app even if its WebView lacks the privileged bridges', () => {
    vi.stubGlobal('window', {}); vi.stubGlobal('navigator', { userAgent: 'Chrome Mobile' });
    expect(isAndroidApp()).toBe(false);
    vi.stubGlobal('navigator', { userAgent: 'Chrome Mobile FoopeAndroid/0.3.0' });
    expect(isAndroidApp()).toBe(true);
    vi.stubGlobal('navigator', { userAgent: 'Chrome Mobile' }); vi.stubGlobal('window', { FoopeApp: {} });
    expect(isAndroidApp()).toBe(true);
  });
  it('uses a fresh cryptographic proof whose hash is safe to transmit', async () => {
    const first = await createAndroidProof(), second = await createAndroidProof();
    expect(first.proof).toMatch(/^[a-f0-9]{64}$/);
    expect(first.proof).not.toBe(first.proof_hash);
    expect(second.proof).not.toBe(first.proof);
    const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.proof))), b => b.toString(16).padStart(2, '0')).join('');
    expect(first.proof_hash).toBe(expected);
  });
  it('opens only an opaque request in the native browser, without session tokens or proof', async () => {
    const sent: Record<string, string>[] = [];
    const bridge: { onmessage: ((event: { data: string }) => void) | null; postMessage: (value: string) => void } = {
      onmessage: null,
      postMessage(value) {
        const command = JSON.parse(value); sent.push(command);
        bridge.onmessage?.({ data: JSON.stringify({ id: command.id, data: { opened: true } }) });
      },
    };
    vi.stubGlobal('window', { FoopeApp: bridge });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('The browser handoff must not access stored tokens'); } });
    await openAndroidBrowser(requestId);
    expect(sent[0]).toEqual({ id: expect.any(String), command: 'signin', request_id: requestId });
    await expect(openAndroidBrowser('https://evil.example')).rejects.toThrow();
    expect(sent).toHaveLength(1);
    await openAndroidBrowser();
    expect(sent[1]).toEqual({ id: expect.any(String), command: 'website' });
  });
  it('fails closed when a native bridge is missing or replies with an error', async () => {
    vi.stubGlobal('window', {});
    await expect(openAndroidBrowser(requestId)).rejects.toThrow('WebView');
    const bridge: { onmessage: ((event: { data: string }) => void) | null; postMessage: (value: string) => void } = {
      onmessage: null, postMessage(value) { bridge.onmessage?.({ data: JSON.stringify({ id: JSON.parse(value).id, error: 'denied' }) }); },
    };
    vi.stubGlobal('window', { FoopeApp: bridge });
    await expect(openAndroidBrowser(requestId)).rejects.toThrow('ブラウザー');
  });
});
