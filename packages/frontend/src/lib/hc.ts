import { hc } from 'hono/client';
// 型定義のみをインポートするように注意
import type { AppType } from '@my-app/backend';

const client = hc<AppType>('http://localhost:8787', {
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

export default client;
