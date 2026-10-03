# 内容管理后台

纯 GitHub Pages 方案，不需要 Cloudflare、GitHub App 或独立服务器。后台地址为站点的 `/admin/`，与公开首页独立。

## 第一次使用

1. 用 **SHiIRoMorL** 登录 GitHub，打开 https://github.com/settings/personal-access-tokens/new 。
2. 创建 **Fine-grained personal access token**，选择合适的到期时间。
3. Resource owner 选择 **SHiIRoMorL**。
4. Repository access 选择 **Only select repositories**，只选 **SHiIRoMorL.github.io**。
5. Repository permissions 设置 **Contents: Read and write**、**Actions: Read-only**；Metadata 的只读权限会自动包含。
6. 生成令牌，打开 https://shiiromorl.github.io/admin/ ，在后台连接框输入令牌。

令牌不要发到聊天中，也不要写进代码、配置或仓库。后台只把它保存在当前页面内存中；刷新、关闭或断开连接后，需要重新输入。请在自己的密码管理器中保存令牌，需要时可在 GitHub 中撤销。

后台核对 GitHub 用户数字 ID `268295554`，并检查该账号对目标仓库的写入权限。实际写入由 GitHub API 的令牌和仓库权限控制；页面中没有共享写入凭据。要维持“只有站主能修改”，也应保持仓库写入权限只对站主开放。

## 能管理什么

- **文件柜**：上传附件、编辑标题和说明、重命名、删除。原文件和索引在同一次提交中更新。
- **收藏夹 / 小工具**：添加、编辑、删除链接。
- **文档**：管理 `content/notes/` 和 `content/games/` 中的 Markdown，支持草稿、发布和删除。
- **关于我**：编辑介绍，保留原来的导航配置。
- 保存形成 Git 提交，随后由现有 Actions 工作流构建和发布。后台会查询发布状态；缺少 Actions 读取权限时，也可直接打开 GitHub 查看。

单个附件最多 **8 MB**，正文最多 **256 KB**。支持常见文档、压缩包、图片和媒体附件；不支持通过文件柜上传 HTML、JavaScript、SVG 等可执行网页资源。文件柜中的图片暂作为普通附件，不会自动替换首页封面。

Markdown 正文中的原始 HTML 不渲染，避免把粘贴的脚本当成网页代码执行。

网页上传和编辑针对附件、链接与 Markdown 文档；Word/PDF 等二进制文档通过上传、下载和删除管理，不包含在线 Office 编辑。

草稿不会发布到站点，但当前 GitHub 仓库公开，草稿源码仍可在仓库里查看。删除也会保留在 Git 历史中；公开站点和公开仓库都不适合保存秘密文件。

## 保存与冲突

保存前核对主分支版本，并使用非强制 Git 引用更新。如果在编辑期间发生其他提交，会显示冲突并保留输入；先复制未保存内容，关闭编辑窗口并刷新列表，再重新打开保存。

为了防止误操作，界面不提供模板、脚本、工作流或栏目首页的编辑入口，写入逻辑也检查允许的内容路径。这是界面的范围限制；GitHub 的 Contents 令牌权限本身覆盖所选仓库内容。

## 本地开发

在仓库根目录运行：

```powershell
npm ci --prefix management --ignore-scripts
npm --prefix management test
npm --prefix management run build
npm --prefix management run preview
```

打开 http://127.0.0.1:8787/admin/ 。预览模式直接连接真实 GitHub，保存会真的提交到仓库。

无需凭据的演示：

```powershell
npm --prefix management run demo
```

打开相同地址并点击“进入本地演示”。演示只监听 `127.0.0.1`，使用内存中的模拟仓库，重启后清空；任何操作都不会提交到 GitHub。不要在演示中输入真实令牌。

## 文件位置

| 文件 | 用途 |
|---|---|
| `src/app.mjs` | 后台界面、表单、文件读取与发布状态 |
| `src/admin-service.mjs` | 文件、链接与 Markdown 管理 |
| `src/github.mjs` | GitHub API、版本读取与原子提交 |
| `src/content.mjs` | 路径、链接、文件和文档校验，TOML/YAML 读写 |
| `public/index.html`、`public/style.css` | 页面与样式源文件 |
| `public/config.json` | 公开仓库标识，不包含凭据 |
| `scripts/build.mjs` | 打包到 `static/admin/` |
| `test/` | 固定模拟仓库测试，不改动真实内容 |

后台依赖打包在站点自己的 JavaScript 中，不加载第三方 CDN 脚本。Actions 会在每次部署前运行测试并重新生成后台。
