import app from './api/index.ts';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n Profit Dashboard pronto!`);
    console.log(` > No Computador: http://localhost:${PORT}`);
    console.log(` > No Celular (mesmo Wi-Fi): http://192.168.1.5:${PORT}\n`);
  });
}

startServer();
