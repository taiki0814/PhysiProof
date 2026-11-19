import { hc } from 'hono/client';
// 型定義のみをインポートするように注意
import type { AppType } from '@my-app/backend';

// 本番環境: VITE_API_URL (例: https://my-app-backend.xxx.workers.dev)
// 開発環境: 空文字 (Vite の proxy が /api をローカルの 8787 へ転送)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const client = hc<AppType>(API_BASE_URL, {
  headers: {
    'Content-Type': 'application/json',
  },
  fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
    const path = new URL(String(url), 'http://localhost').pathname;
    const isPublicGoogleAuth = /^\/api\/auth\/google\/(config|challenge|signin)\/?$/.test(path);
    const isPublicAndroidAuth = /^\/api\/auth\/android\/(start|[a-f0-9-]+(?:\/exchange)?)\/?$/i.test(path);
    const isPublicAuth = isPublicGoogleAuth || isPublicAndroidAuth;
    const accessToken = isPublicAuth ? null : localStorage.getItem('physiproof_access_token');

    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (!isPublicAuth && !path.startsWith('/api/auth/android/')) {
      const adminToken = localStorage.getItem('physiproof_uniform_admin_token');
      if (adminToken) headers.set('X-Uniform-Admin-Token', adminToken);
    }
    // Headers merges case-insensitively; an explicit approval session must not be
    // replaced by a newly switched account or combined with its bearer token.
    new Headers(options?.headers).forEach((value, key) => headers.set(key, value));
    const modifiedOptions = { ...options, headers };

    try {
      const res = await fetch(url, modifiedOptions);
      if (res.status === 401 && !path.endsWith('/auth/login') && !isPublicAuth) {
        window.dispatchEvent(new Event('physiproof-session-expired'));
      }
      return res;
    } catch (err) {
      if (!path.startsWith('/api/auth/')) console.error('Fetch error:', err);
      throw err;
    }
  }
});

export { API_BASE_URL };
export default client;

