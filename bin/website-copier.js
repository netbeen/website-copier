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
  let verbose = true;

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
    if (a === '--quiet') {
      verbose = false;
      continue;
    }
  }

  if (!url) {
    console.error('用法: website-copier <url> [-o <输出目录>] [--serve] [--port <端口>]');
    process.exit(1);
  }

  if (fs.existsSync(outDir)) {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
      if (verbose) console.log(`已清理输出目录: ${outDir}`);
    } catch (e) {
      console.error('清理输出目录失败:', e.message || e);
      process.exit(1);
    }
  }
  fs.mkdirSync(outDir, { recursive: true });

  if (verbose) console.log(`开始复制: ${url} (depth=${depth}) -> ${outDir}`);
  const onProgress = (info) => {
    if (!verbose) return;
    if (info.type === 'start') {
      console.log(`[开始] URL=${info.url} depth=${info.depth}`);
    } else if (info.type === 'discover') {
      console.log(`[发现链接] 新增=${info.count} 总计=${info.total}`);
    } else if (info.type === 'pageSaved') {
      console.log(`[保存页面] ${info.url} -> ${info.filePath} (已抓取=${info.visited} 待抓取=${info.queue})`);
    } else if (info.type === 'resources') {
      console.log(`[资源] 引用=${info.links} 已下载=${info.downloaded}`);
    } else if (info.type === 'done') {
      console.log(`[完成] 总页面=${info.pages}`);
    }
  };

  copyWebsite(url, outDir, { depth, onProgress })
    .then(() => {
      console.log(`已复制: ${url} -> ${outDir}`);
      if (serve) {
        startServer(outDir, port);
      } else {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error('复制失败:', err.message || err);
      process.exit(1);
    });
}

main();
