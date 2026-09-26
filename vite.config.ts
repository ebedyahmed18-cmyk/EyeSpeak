import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'save-frame-middleware',
      configureServer(server) {
        server.middlewares.use('/api/save-frame', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const outPath = path.resolve('actual-frames.json');
                let existing = {};
                if (fs.existsSync(outPath)) {
                  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
                }
                existing[data.label] = data;
                fs.writeFileSync(outPath, JSON.stringify(existing, null, 2), 'utf8');
                console.log(`[VITE SERVER] Successfully saved frame: ${data.label}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', label: data.label }));
              } catch (e: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          }
        });
      }
    }
  ],
  server: {
    port: 5173,
    host: true
  }
});
