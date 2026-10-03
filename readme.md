# ShIRoMorl's Library

基于 Hugo extended 的个人资料库。首页采用窄侧栏、一张主视觉和四个栏目入口；图片暂时使用 CSS 渐变占位。

## 本地预览与构建

需要 Hugo extended ≥ 0.157.0。

```powershell
hugo server --bind 127.0.0.1 --port 8000 --baseURL http://127.0.0.1:8000/ --disableFastRender
hugo --minify
```

浏览器打开 http://127.0.0.1:8000/，不要直接双击 public/index.html。

## 目录与维护位置

| 内容 | 位置 |
|---|---|
| 站点名称、域名 | `hugo.toml` |
| 侧栏昵称、签名、头像 | `data/library.toml` 的 `profile`，未设置时沿用 `config/_default/` |
| 侧栏社交链接 | `config/_default/languages.toml` |
| 首页文案、入口、封面路径 | `data/library.toml` |
| 文件、收藏、工具等栏目条目 | `data/library.toml` 的 `collections` |
| 栏目说明和导航顺序 | `content/*/_index.md` 的 front matter |
| 关于我 | `content/about/index.md` |
| 整体骨架与首页 | `layouts/baseof.html`、`layouts/home.html` |
| 栏目与文章模板 | `layouts/list.html`、`layouts/single.html` |
| 页面组件 | `layouts/_partials/library/` |
| 样式 | `assets/scss/library.scss` |
| 明暗切换、手机导航 | `assets/ts/library.ts` |
| 下载文件 | `static/files/` |

主题源码保留在 `themes/new/`，新布局通过站点级模板覆盖实现。它不再加载 Stack 的主样式和脚本，也不依赖外部字体或 npm 安装。现有主题资源仍保留，便于后续复用。

## 换上图片

在网页后台 `/admin/` 的“站点资料”里点击“编辑资料与图片”，可以上传头像、首页主图和四个栏目封面，同时修改昵称、个人签名和首页短句。选择后点击“保存并发布”，等待自动发布完成即可。每张图片最多 8 MB，支持 PNG、JPG、WebP、GIF。

也可以手动配置图片：

将图片放在 `assets/img/`，然后编辑 `data/library.toml`：

```toml
[home]
subtitle = "把喜欢的、用得上的，都留在这里。"
image = "img/home-cover.jpg"
```

四个 `[[portals]]` 各自的 `image` 也可以填写图片路径。留空就继续使用渐变占位。也支持 `static/` 中的图片，例如 `static/images/cover.jpg` 对应 `images/cover.jpg`。

## 添加文件、收藏和小工具

文件本体放在 `static/files/`。把 `[collections.files]` 下的 `items = []` 换成以下条目：

```toml
[collections.files]
[[collections.files.items]]
title = "资料包"
description = "需要时再来取。"
url = "/files/materials.zip"
download = true
icon = "file"
```

`collections.bookmarks`、`collections.tools` 和 `collections.games` 使用同样的条目结构。外部网址使用完整 URL，自动在新标签页打开；本地路径按站点 baseURL 处理。

也可以通过站点的 `/admin/` 在浏览器中上传、删除文件和维护链接。后台使用 GitHub 细粒度令牌，详见 [后台使用说明](management/README.md)。网站文件仍保存在 GitHub 仓库中，发布到 GitHub Pages 的文件可被公开访问。

## 添加随手记和游戏记录

在 `content/notes/` 或 `content/games/` 下创建 Markdown，例如 `content/notes/first-note.md`：

```markdown
---
title: 第一条随手记
description: 一段想留下的记录。
date: 2026-10-02
---

这里开始写正文。
```

文章会自动出现在对应栏目中；RSS 收录这两个栏目。主页保持简洁，不额外显示文章列表。

## 部署

推送到 `main` 后，由 `.github/workflows/hugo.yml` 构建并部署到 GitHub Pages。`public/` 和 `resources/` 是生成目录，已由 `.gitignore` 忽略。本地编辑和预览不会自动发布，推送提交后才会触发部署。

## 网页内容管理

后台：https://shiiromorl.github.io/admin/

无需 Cloudflare 或额外账号。创建只授权此仓库的 GitHub 细粒度令牌，设置 Contents 读写和 Actions 只读权限，然后在后台连接。令牌仅保存在当前页面内存中。

支持文件上传、重命名、删除，收藏和工具链接维护，以及 Markdown 文档的草稿、发布和编辑。详细步骤和本地演示见 [management/README.md](management/README.md)。
