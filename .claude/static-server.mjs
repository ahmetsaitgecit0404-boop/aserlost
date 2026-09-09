import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const port = 5173;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(root, p);
  fs.readFile(full, (err, data) => {
    if (err) {
      // SPA fallback: production'daki app.get('*') davranışını taklit et
      if (!path.extname(full)) {
        fs.readFile(path.join(root,'index.html'),(e2,d2)=>{
          if(e2){res.writeHead(404);res.end('not found');return;}
          res.writeHead(200,{'Content-Type':'text/html'});res.end(d2);
        });
        return;
      }
      res.writeHead(404); res.end('not found'); return;
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('static preview listening on ' + port));
