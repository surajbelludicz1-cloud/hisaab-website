const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8767);
const root = __dirname;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
};

http.createServer((req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];
  const filePath = path.join(root, cleanUrl === '/' ? 'index.html' : cleanUrl);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Hisaab.Guru promotional website running at http://127.0.0.1:${port}`);
});
