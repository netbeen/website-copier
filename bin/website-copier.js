#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { copyWebsite } = require('../src/copier');
const { startServer } = require('../src/server');

/**
 * 解析命令行参数并执行复制与本地启动
 */
function main() {
  const args = process.argv.slice(2);
  let url = null;
  let outDir = path.resolve(process.cwd(), 'output');
  let serve = false;
  let port = 8080;
  let depth = 0;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!url && /^https?:\/\//i.test(a)) {
      url = a;
      continue;
    }
    if (a === '-o' || a === '--out') {
      outDir = path.resolve(process.cwd(), args[i + 1]);
      i++;
      continue;
    }
    if (a === '--serve') {
      serve = true;
      continue;
    }
    if (a === '--port') {
      port = parseInt(args[i + 1], 10) || port;
      i++;
      continue;
    }
    if (a === '--depth') {
      depth = Math.max(0, parseInt(args[i + 1], 10) || 0);
      i++;
      continue;
    }
  }

  if (!url) {
    console.error('用法: website-copier <url> [-o <输出目录>] [--serve] [--port <端口>]');
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  copyWebsite(url, outDir, { depth })
    .then(() => {
      console.log(`已复制: ${url} -> ${outDir}`);
      if (serve) {
        startServer(outDir, port);
      }
    })
    .catch((err) => {
      console.error('复制失败:', err.message || err);
      process.exit(1);
    });
}

main();
