const fs = require('fs');
const path = require('path');

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 根据 URL 映射到本地相对路径（去除查询串，保留层级）
 */
function mapUrlToLocalPath(resourceUrl) {
  const u = new URL(resourceUrl);
  const cleanPath = u.pathname.replace(/\/+/g, '/');
  const filename = path.basename(cleanPath) || 'index';
  const ext = path.extname(filename) || guessExtByPath(cleanPath);
  const noQuery = cleanPath.replace(/\/$/, '') || '/index';
  const rel = path.join('assets', u.hostname, noQuery) + (ext ? '' : ext);
  return rel;
}

/**
 * 根据路径简单猜测扩展名（用于无扩展情况）
 */
function guessExtByPath(p) {
  if (/\.(png|jpg|jpeg|gif|webp|svg)(?:$|\?)/i.test(p)) return '';
  if (/\.(css)(?:$|\?)/i.test(p)) return '';
  if (/\.(js)(?:$|\?)/i.test(p)) return '';
  return '';
}

/**
 * 写入文件（创建上级目录）
 */
function writeFileEnsure(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
}

/**
 * 将绝对或相对链接解析为绝对 URL
 */
function resolveUrl(baseUrl, link) {
  try {
    return new URL(link, baseUrl).toString();
  } catch (e) {
    return null;
  }
}

module.exports = {
  ensureDir,
  mapUrlToLocalPath,
  writeFileEnsure,
  resolveUrl,
};
