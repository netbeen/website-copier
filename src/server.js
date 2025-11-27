const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * 启动一个静态服务器，根目录为指定输出目录
 */
function startServer(root, port = 8080) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(root, urlPath);
    if (urlPath === '/' || urlPath === '') {
      filePath = path.join(root, 'index.html');
    }
    const tryNuxtFallback = () => {
      if (!urlPath.startsWith('/_nuxt/')) return null;
      const assetsRoot = path.join(root, 'assets');
      if (!fs.existsSync(assetsRoot)) return null;
      const hosts = fs.readdirSync(assetsRoot).filter((d) => {
        try { return fs.statSync(path.join(assetsRoot, d)).isDirectory(); } catch (_) { return false; }
      });
      for (const h of hosts) {
        const candidate = path.join(root, 'assets', h, urlPath);
        if (fs.existsSync(candidate)) return candidate;
      }
      return null;
    };
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        const fallback = tryNuxtFallback();
        if (fallback && fs.existsSync(fallback)) {
          filePath = fallback;
        } else if (!err && stat && stat.isDirectory()) {
          const indexCandidate = path.join(filePath, 'index.html');
          if (fs.existsSync(indexCandidate)) {
            filePath = indexCandidate;
          } else {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }
        } else {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
      }
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        res.statusCode = 500;
        res.end('Server Error');
      });
      stream.pipe(res);
    });
  });
  server.listen(port, () => {
    console.log(`本地服务器已启动: http://localhost:${port}/`);
  });
}

module.exports = { startServer };
