const path = require('path');
const fs = require('fs');
const { fetchResource } = require('./http');
const { ensureDir, writeFileEnsure, resolveUrl } = require('./utils');

/**
 * 提取 HTML 中的资源链接并返回包含原始与绝对地址的列表
 */
function extractLinks(html, baseUrl) {
  const results = [];
  const patterns = [
    { tag: 'link', attr: 'href' },
    { tag: 'script', attr: 'src' },
    { tag: 'img', attr: 'src' },
    { tag: 'source', attr: 'src' },
    { tag: 'video', attr: 'poster' },
  ];
  for (const p of patterns) {
    const re = new RegExp(`<${p.tag}[^>]*?${p.attr}=["']([^"']+)["'][^>]*>`, 'gi');
    let m;
    while ((m = re.exec(html)) !== null) {
      const link = m[1];
      const abs = resolveUrl(baseUrl, link);
      if (abs) results.push({ tag: p.tag, attr: p.attr, orig: link, abs });
    }
  }
  // CSS 内联 <style> 中的 url(...)
  const styleRe = /url\(([^)]+)\)/gi;
  let sm;
  while ((sm = styleRe.exec(html)) !== null) {
    const raw = sm[1].replace(/["']/g, '').trim();
    const abs = resolveUrl(baseUrl, raw);
    if (abs) results.push({ tag: 'style', attr: 'url', orig: raw, abs });
  }
  return results;
}

/**
 * 下载并重写 CSS 内的 url(...) 引用
 */
async function processCss(cssUrl, outDir) {
  const { data, contentType } = await fetchResource(cssUrl);
  let css = data.toString('utf8');
  const baseUrl = cssUrl;
  const re = /url\(([^)]+)\)/gi;
  const tasks = [];
  css = css.replace(re, (full, p1) => {
    const raw = p1.replace(/["']/g, '').trim();
    const abs = resolveUrl(baseUrl, raw);
    if (!abs) return full;
    const u = new URL(abs);
    const rel = path.join('assets', u.hostname, u.pathname);
    const target = path.join(outDir, rel);
    tasks.push(
      fetchResource(abs)
        .then(({ data: buf }) => writeFileEnsure(target, buf))
        .catch(() => {})
    );
    return `url(/${rel})`;
  });
  await Promise.all(tasks);
  const u = new URL(cssUrl);
  const relSelf = path.join('assets', u.hostname, u.pathname);
  const targetSelf = path.join(outDir, relSelf);
  writeFileEnsure(targetSelf, Buffer.from(css, 'utf8'));
  return relSelf;
}

/**
 * 将 HTML 内引用的资源下载到本地并重写 HTML
 */
async function downloadAndRewrite(html, baseUrl, outDir) {
  const links = extractLinks(html, baseUrl);
  const rewritten = new Map();
  const tasks = links.map(async (l) => {
    try {
      if (/\.css(?:$|\?)/i.test(l.abs)) {
        const rel = await processCss(l.abs, outDir);
        rewritten.set(l.orig, rel);
        return;
      }
      const { data } = await fetchResource(l.abs);
      const u = new URL(l.abs);
      const rel = path.join('assets', u.hostname, u.pathname.replace(/\/$/, '/index'));
      const target = path.join(outDir, rel);
      writeFileEnsure(target, data);
      rewritten.set(l.orig, rel);
    } catch (e) {
      // 忽略失败的单个资源
    }
  });
  await Promise.all(tasks);
  let newHtml = html;
  for (const [orig, rel] of rewritten.entries()) {
    const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    newHtml = newHtml.replace(new RegExp(esc, 'g'), `/${rel}`);
  }
  return newHtml;
}

/**
 * 复制指定 URL 的页面到本地目录，并重写资源路径
 */
async function copyWebsite(url, outDir, opts = {}) {
  ensureDir(outDir);
  const depth = Math.max(0, opts.depth || 0);
  const start = new URL(url);
  const host = start.hostname;
  const visited = new Set();
  const q = [{ url: start.toString(), level: 0 }];

  while (q.length) {
    const { url: cur, level } = q.shift();
    const key = normalizePageUrl(cur);
    if (visited.has(key)) continue;
    visited.add(key);

    let pageHtml;
    try {
      const { data } = await fetchResource(cur);
      pageHtml = data.toString('utf8');
    } catch (e) {
      continue;
    }

    let rewritten = await downloadAndRewrite(pageHtml, cur, outDir);
    const anchors = extractAnchors(rewritten, cur);
    const { hrefRewrites, nextLinks } = planAnchorRewrites(anchors, start);
    rewritten = applyHrefRewrites(rewritten, hrefRewrites);
    const { filePath } = savePageHtml(cur, rewritten, outDir);

    if (level < depth) {
      for (const link of nextLinks) {
        const abs = resolveUrl(cur, link);
        if (!abs) continue;
        const u = new URL(abs);
        if (u.hostname !== host) continue;
        if (isAssetUrl(u.pathname)) continue;
        q.push({ url: u.toString(), level: level + 1 });
      }
    }
  }

  patchNuxtPublicPath(outDir, host);
  patchCssRelativeUrls(outDir);
  return { indexPath: path.join(outDir, 'index.html') };
}

/**
 * 规范化页面 URL（去除 hash 与查询串）
 */
function normalizePageUrl(u) {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname.replace(/\/$/, '/')}`;
  } catch (_) {
    return u;
  }
}

/**
 * 检测是否为静态资源 URL
 */
function isAssetUrl(p) {
  return /\.(png|jpg|jpeg|gif|webp|svg|css|js|ico|woff2?|ttf|mp4|webm)$/i.test(p);
}

/**
 * 提取页面内所有 a[href] 链接
 */
function extractAnchors(html, baseUrl) {
  const res = [];
  const re = /<a[^>]*?href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const abs = resolveUrl(baseUrl, m[1]);
    if (abs) res.push({ orig: m[1], abs });
  }
  return res;
}

/**
 * 规划本地跳转的重写集合与下一层需要抓取的链接
 */
function planAnchorRewrites(anchors, startUrl) {
  const start = new URL(startUrl);
  const host = start.hostname;
  const hrefRewrites = new Map();
  const nextLinks = [];
  for (const a of anchors) {
    try {
      const u = new URL(a.abs);
      if (u.protocol.startsWith('http') && u.hostname === host && !isAssetUrl(u.pathname)) {
        const localHref = localHrefForPage(u);
        hrefRewrites.set(a.orig, localHref);
        nextLinks.push(u.toString());
      }
    } catch (_) {}
  }
  return { hrefRewrites, nextLinks };
}

/**
 * 将页面 URL 映射为本地跳转路径（目录 index.html 形式）
 */
function localHrefForPage(u) {
  const pathname = u.pathname || '/';
  if (pathname === '/') return '/';
  if (/\.[a-z0-9]+$/i.test(pathname)) return pathname; // 已有扩展名
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

/**
 * 应用 a[href] 的重写映射
 */
function applyHrefRewrites(html, map) {
  let out = html;
  for (const [orig, rewrite] of map.entries()) {
    const esc = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(<a[^>]*?href=["'])${esc}(["'])`, 'g'), `$1${rewrite}$2`);
  }
  return out;
}

/**
 * 保存页面 HTML 到本地目录（根目录映射主页，其他路径映射到目录 index.html）
 */
function savePageHtml(pageUrl, html, outDir) {
  const u = new URL(pageUrl);
  const pathname = u.pathname || '/';
  let targetPath;
  if (pathname === '/') {
    targetPath = path.join(outDir, 'index.html');
  } else if (/\.[a-z0-9]+$/i.test(pathname)) {
    targetPath = path.join(outDir, pathname);
  } else {
    targetPath = path.join(outDir, pathname, 'index.html');
  }
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, html);
  return { filePath: targetPath };
}

 

/**
 * 修正 Nuxt/Webpack 运行时 publicPath，使懒加载资源走本地路径
 */
function patchNuxtPublicPath(outDir, host) {
  const nuxtDir = path.join(outDir, 'assets', host, '_nuxt');
  if (!fs.existsSync(nuxtDir)) return;
  const files = fs.readdirSync(nuxtDir).filter((f) => f.endsWith('.js'));
  const targetPath = `/assets/${host}/_nuxt/`;
  for (const f of files) {
    const p = path.join(nuxtDir, f);
    try {
      const content = fs.readFileSync(p, 'utf8');
      const patched = content
        .replace(/\"\/_nuxt\/_?\"/g, `"${targetPath}"`)
        .replace(/'\/_nuxt\/'/g, `'${targetPath}'`)
        .replace(/\/\/_nuxt\//g, targetPath);
      if (patched !== content) {
        fs.writeFileSync(p, patched, 'utf8');
      }
    } catch (_) {}
  }
}

/**
 * 将 CSS 内可能残留的相对 assets 路径统一为绝对路径
 */
function patchCssRelativeUrls(outDir) {
  const assetsDir = path.join(outDir, 'assets');
  if (!fs.existsSync(assetsDir)) return;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      const s = fs.statSync(p);
      if (s.isDirectory()) walk(p);
      else if (entry.endsWith('.css')) {
        try {
          const content = fs.readFileSync(p, 'utf8');
          const patched = content.replace(/url\((?!https?:|\/)([^)]+)\)/g, (full, g1) => {
            const raw = g1.replace(/["']/g, '').trim();
            return `url(/${raw})`;
          });
          if (patched !== content) fs.writeFileSync(p, patched, 'utf8');
        } catch (_) {}
      }
    }
  };
  walk(assetsDir);
}

// 导出主复制函数（保持单一导出定义）
module.exports = {
  copyWebsite,
};
