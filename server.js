// Multimedia Hub – tiny local-only static server (no dependencies).
// Serves ./public and, read-only under /files/, the project folder one level up (vendor portfolios, videos).
const http = require('http'), fs = require('fs'), path = require('path');
const PUB = path.join(__dirname, 'public'), FILES = path.resolve(__dirname, '..'), PORT = +process.env.PORT || 4310;
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

http.createServer((req, res) => {
  let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  let base = PUB;
  if (p.startsWith('/files/')) { base = FILES; p = p.slice(6); }
  if (p === '/') p = '/index.html';
  const f = path.join(base, p);
  if (!f.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const h = { 'Content-Type': MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) {
      const start = r[1] ? +r[1] : Math.max(0, st.size - +r[2]), end = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...h, 'Content-Length': st.size });
    req.method === 'HEAD' ? res.end() : fs.createReadStream(f).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Multimedia Hub → http://localhost:${PORT}  (local only)`));
