import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = join(root, 'public');
try {
  const envText = readFileSync(join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const { handleApiRequest } = await import('./app.mjs');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApiRequest(req, res, url.pathname);
  try {
    const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const safePath = resolve(publicRoot, requested);
    if (safePath !== publicRoot && !safePath.startsWith(`${publicRoot}${sep}`)) {
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Forbidden.' }));
    }
    const file = await readFile(safePath);
    res.writeHead(200, { 'content-type': mimeTypes[extname(safePath)] || 'application/octet-stream' });
    res.end(file);
  } catch (error) {
    if (res.headersSent) return res.destroy(error);
    res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.code === 'ENOENT' ? 'File nahi mila.' : error.message }));
  }
});

server.listen(port, host, () => {
  console.log(`GOKESU Voice Studio is ready at http://${host}:${port}`);
  if (!process.env.GEMINI_API_KEY?.trim()) console.log('Connect a Gemini API key in the app to enable cloud voice generation.');
});
