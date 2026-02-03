import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig({
  plugins: [
    {
      name: 'mobile-entry',
      enforce: 'pre',
      configureServer: (server) => {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          if (!url.startsWith('/m')) {
            return next();
          }
          if (req.method && req.method.toUpperCase() !== 'GET') {
            return next();
          }
          const htmlPath = path.resolve(__dirname, 'mobile.html');
          if (!fs.existsSync(htmlPath)) {
            return next();
          }
          const html = fs.readFileSync(htmlPath, 'utf-8');
          const transformed = server.transformIndexHtml(url, html);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html');
          Promise.resolve(transformed).then((result) => res.end(result));
        });
      },
    },
    react(),
  ],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        mobile: path.resolve(__dirname, 'mobile.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0', // 监听所有网络接口
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        ws: true, // 支持 WebSocket
      }
    }
  }
});
