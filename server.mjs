import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.ROSTERFAIR_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('ROSTERFAIR_PORT must be an integer from 1024 to 65535.');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg' };
const server = createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method ?? '')) {res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    const target = resolve(join(root, pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '')));
    const inside = relative(root,target);
    if (inside.startsWith('..') || isAbsolute(inside)) {res.writeHead(403);res.end('Forbidden');return;}
    if (!(await stat(target)).isFile()) {res.writeHead(404);res.end('Not found');return;}
    const data = await readFile(target);
    res.writeHead(200,{'Content-Type':mime[extname(target)] ?? 'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(`Local preview could not start: ${error.message}`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`RosterFair local preview: http://127.0.0.1:${port}\nPress Ctrl+C to stop. Synthetic data; edits stay in memory.`));
