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
| 侧栏昵称 | `config/_default/params.toml` 的 `mysite.owner` |
| 侧栏副标题、社交链接 | `config/_default/languages.toml` |
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

这仍是静态网站：文件通过本地添加、构建和部署来更新，不包含在线上传或私人网盘功能。发布到 GitHub Pages 的文件可被公开访问。

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
