# ShIRoMorl's Library

基于 [Hugo](https://gohugo.io/) + [Stack 主题](https://github.com/CaiJimmy/hugo-theme-stack) 的个人站点，**单语言（简体中文）**，通过 GitHub Actions 部署到 GitHub Pages。

- 线上地址：<https://shiiromorl.github.io/>
- 仓库：<https://github.com/SHiIRoMorL/SHiIRoMorL.github.io>

## 环境要求

- Hugo **extended** ≥ 0.157.0（`config/_default/module.toml` 中已锁定最低版本）

## 本地预览

```bash
hugo server -D          # 启动本地预览（含草稿），默认 http://localhost:1313/
hugo --minify           # 生成静态站点到 public/
```

## 目录结构

```
.
├── .github/workflows/hugo.yml   # CI：push 到 main 后自动构建并部署到 Pages
├── archetypes/                  # `hugo new` 使用的模板
├── assets/                      # 站点级资源
│   ├── img/                     #   avatar.png（侧边栏头像）、avatar1.jpg（favicon）
│   ├── scss/                    #   样式（与主题同名的文件会覆盖主题版本）
│   └── ts/                      #   前端脚本
├── config/_default/             # 站点配置
│   ├── languages.toml           #   语言与侧边栏副标题
│   ├── menu.toml                #   社交链接
│   ├── markup.toml              #   Markdown / 代码高亮 / 数学公式
│   ├── module.toml              #   Hugo 版本约束
│   ├── params.toml              #   站点参数（会整体覆盖主题同名文件）
│   └── related.toml             #   相关文章权重
├── content/                     # 内容（简体中文）
│   ├── _index.zh.md             #   首页（含导航菜单项）
│   ├── page/                    #   独立页面：about / archives / links / search
│   ├── post/                    #   文章
│   ├── categories/              #   分类
│   └── tags/                    #   标签
├── data/external.toml           # 外部 CDN 资源（KaTeX / PhotoSwipe / Cactus）
├── i18n/                        # 界面文案（仅保留 zh.toml）
├── themes/new/                  # Stack 主题（随仓库一同提交，非 submodule）
└── hugo.toml                    # 站点基础配置
```

## 日常维护

### 写一篇新文章

```bash
hugo new content post/my-post/index.zh.md
```

文章目录形式（`post/<slug>/index.zh.md`）是推荐做法，方便把配图放在同一目录里。

### 修改侧边栏副标题

编辑 `config/_default/languages.toml` 中的 `zh.params.sidebar.subtitle`。

### 修改头像 / favicon

- 头像：替换 `assets/img/avatar.png`，并在 `config/_default/params.toml` 的 `sidebar.avatar` 中对应修改。
- favicon：替换 `assets/img/avatar1.jpg`，并在同一文件顶部的 `favicon` 中对应修改（建议使用 `.png` 或 `.ico`，浏览器兼容性更好）。

### 修改社交链接

编辑 `config/_default/menu.toml`，把 `url` 换成自己的账号地址。

### 开启评论

`config/_default/params.toml` 中 `[comments]` 默认使用 `disqus`，需要填入自己站点的 `shortname`；也可改用 `utterances` / `giscus` / `waline` / `twikoo`，填写对应小节即可。

## 部署

推送到 `main` 分支即触发 `.github/workflows/hugo.yml`：

1. checkout 仓库
2. 安装 Hugo extended
3. `hugo` 构建到 `public/`
4. 上传并部署到 GitHub Pages

> `public/` 与 `resources/_gen/` 已加入 `.gitignore`，**不再纳入版本控制**，构建产物统一由 CI 生成。本地构建后请不要把它们提交上去。

## 注意事项

- 站点为**单语言**：内容文件统一使用 `.zh.md` 后缀（如 `index.zh.md`）。新增带其它语言后缀（`.en.md` / `.ja.md`）的文件不会被构建，除非重新在 `config/_default/languages.toml` 中声明该语言。
- 根目录**没有** `layouts/` 覆盖层，模板全部来自 `themes/new/layouts/`。如需定制某个模板，把对应文件从主题复制到根目录 `layouts/` 的同名路径下再修改即可。
- 修改 `config/_default/params.toml` 时注意：它会**整体覆盖** `themes/new/config/_default/params.toml`，删掉其中的键（如 `dateFormat`、`colorScheme`、`imageProcessing`）会导致日期格式、配色切换、图片处理等功能异常。
