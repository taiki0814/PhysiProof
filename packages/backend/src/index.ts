import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { testRequestSchema } from '@my-app/shared';

const app = new Hono().basePath('/api');

const routes = app
  .get('/hello', (c) => {
    return c.json({ message: 'Hello Hono!' });
  })
  .post(
    '/test',
    zValidator('json', testRequestSchema),
    (c) => {
      const data = c.req.valid('json');
      return c.json({ message: `こんにちは、${data.name}さん！Honoからの返信です。` });
    }
  );

export type AppType = typeof routes;
export default app;
