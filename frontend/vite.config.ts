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
        const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        const STATIC_FILE_REGEX = /\.[a-zA-Z0-9]+$/;

        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url || '';
          const url = new URL(rawUrl, 'http://localhost');
          const pathname = url.pathname;
          const isHtmlRequest = (req.headers.accept || '').includes('text/html');
          const isMobileRequest = MOBILE_UA_REGEX.test(req.headers['user-agent'] || '');

          if (req.method && req.method.toUpperCase() !== 'GET') {
            return next();
          }

          if (!isHtmlRequest) {
            return next();
          }

          if (pathname.startsWith('/api')) {
            return next();
          }

          if (STATIC_FILE_REGEX.test(pathname)) {
            return next();
          }

          const htmlPath = path.resolve(__dirname, 'mobile.html');

          if (pathname.startsWith('/m')) {
            if (!isMobileRequest) {
              const desktopPath = pathname.replace(/^\/m/, '') || '/';
              const redirectTo = `${desktopPath}${url.search || ''}`;
              res.statusCode = 302;
              res.setHeader('X-Entry-Route', 'desktop-redirect');
              res.setHeader('Location', redirectTo);
              return res.end();
            }

            if (!fs.existsSync(htmlPath)) {
              return next();
            }

            const html = fs.readFileSync(htmlPath, 'utf-8');
            const transformed = server.transformIndexHtml(rawUrl, html);
            res.statusCode = 200;
            res.setHeader('X-Entry-Route', 'mobile-html');
            res.setHeader('Content-Type', 'text/html');
            Promise.resolve(transformed).then((result) => res.end(result));
            return;
          }

          if (isMobileRequest) {
            const mobilePath = `/m${pathname === '/' ? '' : pathname}`;
            const redirectTo = `${mobilePath}${url.search || ''}`;
            res.statusCode = 302;
            res.setHeader('X-Entry-Route', 'mobile-redirect');
            res.setHeader('Location', redirectTo);
            return res.end();
          }

          return next();
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
