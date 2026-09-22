# ShIRoMorl's Library

基于 [Hugo](https://gohugo.io/) + [Stack 主题](https://github.com/CaiJimmy/hugo-theme-stack) 的个人站点，**单语言（简体中文）**，通过 GitHub Actions 部署到 GitHub Pages。

- 线上地址：<https://shiiromorl.github.io/>
- 仓库：<https://github.com/SHiIRoMorL/SHiIRoMorL.github.io>

> 当前状态：**只保留主页**。右侧栏已移除，导航、文章、分类、标签等示例内容都已清空，
> 是一个方便按自己想法重新搭建的干净骨架。

## 环境要求

- Hugo **extended** ≥ 0.157.0（`config/_default/module.toml` 中已锁定最低版本）

## 本地预览

```bash
hugo server          # 本地预览，默认 http://localhost:1313/
hugo --minify        # 生成静态站点到 public/
```

## 目录结构

```
.
├── .github/workflows/hugo.yml   # CI：push 到 main 后自动构建并部署到 Pages
├── archetypes/                  # `hugo new` 使用的模板
├── assets/                      # 站点级资源（会覆盖主题同名文件）
│   ├── img/                     #   avatar.png（侧边栏头像）、avatar1.jpg（favicon）
│   ├── scss/                    #   样式
│   └── ts/                      #   前端脚本
├── config/_default/
│   ├── languages.toml           # 语言、侧边栏副标题、社交链接 ← 常用改动集中在这里
│   ├── markup.toml              # Markdown / 代码高亮 / 数学公式
│   ├── module.toml              # Hugo 版本约束
│   └── params.toml              # 站点参数（小工具、配色、图片处理、评论等）
├── content/
│   └── _index.md                # 唯一的页面：主页
├── data/external.toml           # 外部 CDN 资源（KaTeX / PhotoSwipe）
├── i18n/zh.toml                 # 界面文案中文翻译
├── layouts/                     # ★ 站点自己的模板覆盖层（见下节）
│   ├── baseof.html              #   页面骨架：左栏 / 右栏 / 主体
│   └── home.html                #   首页模板
├── themes/new/                  # Stack 主题（随仓库提交，非 submodule）
└── hugo.toml                    # 站点基础配置
```

## 页面骨架与「右栏已移除」

`layouts/baseof.html` 覆盖了主题的同名文件，页面结构完全由它决定：

```
<div class="container main-container flex on-phone--column compact">
    [左栏] partial "sidebar/left.html"    ← 头像 / 站名 / 副标题 / 导航 / 社交图标
    [右栏] block "right-sidebar"          ← 现在为空，不渲染任何东西
    [主体] block "main"
</div>
```

- **右栏**由 `layouts/home.html` 是否定义 `right-sidebar` 块决定。本站已不定义，且
  `params.toml` 中 `[widgets]` 全为空，因此右栏彻底不出现，容器固定为紧凑宽度 `compact`。
- **想恢复右栏**：在 `layouts/home.html` 末尾取消 `right-sidebar` 那段注释，并在
  `params.toml` 的 `[widgets]` 里配置小工具（如 `search`、`archives`、`toc`）。
- **想改成纯单栏**：把 `baseof.html` 中调用 `sidebar/left.html` 的一行删掉即可。

## 常用修改位置

| 想改什么 | 改哪里 |
|---|---|
| 站点名称 | `hugo.toml` 的 `title`（及 `languages.toml` 的 `title`） |
| 侧边栏副标题 | `config/_default/languages.toml` → `zh.params.sidebar.subtitle` |
| 侧边栏头像 / favicon | `assets/img/` 下的图片 + `params.toml` 的 `sidebar.avatar`、`favicon` |
| 社交图标 | `config/_default/languages.toml` → `[[zh.menus.social]]` |
| 导航菜单 | 各页面 front matter 的 `menu.main`；或 `languages.toml` 里加 `[[zh.menus.main]]` |
| 页脚起始年份 | `params.toml` → `[footer] since` |
| 明暗配色 | `params.toml` → `[colorScheme]` |
| 样式 | `assets/scss/custom.scss`（覆盖主题样式时优先改这里） |

## 以后要写文章时

1. 新建文章：

   ```bash
   hugo new content post/my-post/index.zh.md
   ```

   （单语言站也可以直接用 `post/my-post/index.md`，两种写法都行。）

2. 打开 `config/_default/params.toml`，把 `mainSections = []` 改成：

   ```toml
   mainSections = ["post"]
   ```

   首页就会自动列出 `content/post/` 下的文章。

3. 需要标签 / 分类时，编辑 `hugo.toml` 的 `[taxonomies]` 段（文件里有注释示例）。

## 部署

推送到 `main` 分支即触发 `.github/workflows/hugo.yml`：安装 Hugo → `hugo` 构建 → 发布到 GitHub Pages。

> `public/` 与 `resources/` 已在 `.gitignore` 中，**不纳入版本控制**，构建产物统一由 CI 生成。

## 注意事项

- 站点为**单语言**：内容文件用 `.md` 或 `.zh.md` 均可。新增 `.en.md` / `.ja.md` 不会被构建，除非重新在 `languages.toml` 里声明该语言。
- 修改 `config/_default/params.toml` 时注意：它会**整体覆盖**
  `themes/new/config/_default/params.toml`（不是逐项合并）。删掉其中的键
  （如 `dateFormat`、`colorScheme`、`imageProcessing`）会导致日期格式、明暗切换、
  图片处理等功能异常。
- 主题文件尽量**不要直接改** `themes/new/` 里的内容（升级主题会丢失）；要定制就把
  对应文件复制到根目录 `layouts/`、`assets/`、`i18n/` 的同名路径下再改。
