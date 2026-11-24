import http from 'node:http';
import path from 'node:path';
import express from 'express';
import dotenv from 'dotenv';
import { createApp } from './src/server/app.ts';
import { attachWebSocketServer } from './src/server/ws.ts';

dotenv.config({ path: ['.env.development.local', '.env.local', '.env'] });

async function startServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT || 3000);

  const server = http.createServer(app);
  attachWebSocketServer(server);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ResQNet server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ResQNet server:', err);
  process.exit(1);
});
