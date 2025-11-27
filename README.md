# website-copier

一个用 Node.js 实现的 CLI 工具：输入一个 HTTP/HTTPS URL，将对应网页完整复制到本地，并可一键本地启动浏览与跳转。

## 快速开始
- 复制页面到本地目录：
  - `node bin/website-copier.js https://cn.haizol.com/ -o out`
- 复制并本地启动预览：
  - `node bin/website-copier.js https://cn.haizol.com/ -o out --serve --port 5173`

## 参数说明
- `-o, --out <目录>`：输出目录，默认 `./output`
- `--serve`：复制完成后启动本地静态服务器
- `--port <端口>`：本地服务器端口，默认 `8080`
- `--depth <层级>`：多页面抓取深度，默认 `0`
  - `0`：仅抓取首页
  - `1`：抓取首页以及首页上的站内链接的页面
  - `n`：以 BFS 方式递归抓取同域链接的第 `n` 层

## 多页面抓取与本地跳转
- 工具会提取页面中的站内链接（`<a href="...">`），当链接与起始 URL 同域且不是静态资源时：
  - 将链接加入队列进行抓取（受 `--depth` 控制）
  - 将该链接在页面中重写为本地路径，保证在本地运行时可以正常跳转
- 本地路径规则：
  - 首页 `/` 保存为 `out/index.html`
  - 其他页面路径 `/foo/bar` 保存为 `out/foo/bar/index.html`
  - 有扩展名的页面（如 `/detail.html`）保存为 `out/detail.html`
- 本地服务器对无扩展名路径自动返回所在目录的 `index.html`，例如访问 `http://localhost:5173/parts/overview/product/` 会读取 `out/parts/overview/product/index.html`

## 资源与兼容性
- 会重写并下载以下类型资源到 `out/assets/<host>/...`：
  - `link[href]`、`script[src]`、`img[src]`、`source[src]`、`video[poster]`
  - CSS 内的 `url(...)` 引用（图片、字体等），统一改写为绝对路径 `url(/assets/...)`
- 针对 Nuxt/webpack 懒加载资源：
  - 自动修补运行时 `publicPath` 为 `/assets/<host>/_nuxt/`
  - 本地服务器对 `/_nuxt/*` 请求做回退映射到本地 `out/assets/<host>/_nuxt/*`

## 示例
- 复制并预览 `https://cn.haizol.com/`，抓取首页及一层站内链接：
  - `node bin/website-copier.js https://cn.haizol.com/ -o out --serve --port 5174 --depth 1`
  - 打开浏览器访问 `http://localhost:5174/`

## 限制与后续规划
- 目前抓取的是静态资源与 HTML 快照；运行时接口数据未做离线缓存，复杂交互可能依赖在线接口。
- 可扩展方向：
  - 增加包含/排除规则，并发与重试策略
  - 简易接口代理与数据缓存，提高动态站离线体验
  - 更精细的资源类型识别与重写规则
