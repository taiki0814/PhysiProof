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
    const currentUid = localStorage.getItem('physiproof_test_uid') || 'demo-user';
    const authHeader = `Bearer test-token:${currentUid}`;

    const modifiedOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
        'Authorization': authHeader
      }
    };

    try {
      const res = await fetch(url, modifiedOptions);
      return res;
    } catch (err) {
      console.error('Fetch error:', err);
      throw err;
    }
  }
});

export { API_BASE_URL };
export default client;

