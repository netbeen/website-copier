const http = require('http');
const https = require('https');

/**
 * 通过 HTTP/HTTPS 获取资源 Buffer 与内容类型
 */
function fetchResource(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchResource(new URL(res.headers.location, url).toString())
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({ data: buf, contentType: res.headers['content-type'] || '' });
      });
    });
    req.on('error', reject);
  });
}

module.exports = { fetchResource };
