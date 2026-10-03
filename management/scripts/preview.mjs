import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FakeGitHub } from '../test/fake-github.mjs';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const adminRoot = path.join(root, 'static/admin');
const demo = process.argv.includes('--demo');
const port = 8787;
const config = JSON.parse(await readFile(path.join(adminRoot, 'config.json'), 'utf8'));
const fake = demo ? new FakeGitHub({
  'data/library.toml': await readFile(path.join(root, 'data/library.toml'), 'utf8'),
  [`assets/${config.SITE_DEFAULTS.avatar}`]: await readFile(path.join(root, 'assets', config.SITE_DEFAULTS.avatar)),
  'content/about/index.md': await readFile(path.join(root, 'content/about/index.md'), 'utf8'),
  'content/notes/welcome.md': '---\ntitle: 第一条随手记\ndescription: 用来试试编辑和草稿。\ndate: 2026-10-03\ndraft: true\n---\n\n## 从这里开始\n\n这是一条本地演示记录，不会上传到 GitHub。\n',
  'static/files/示例说明.txt': '这只是一个本地演示附件。'
}) : null;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (url.pathname === '/') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
    if (demo && req.method === 'GET' && url.pathname.startsWith('/files/')) {
      const data = fake.files()['static' + decodeURIComponent(url.pathname)];
      if (!data) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(url.pathname.split('/').at(-1))}` });
      return res.end(data);
    }
    if (demo && url.pathname === '/__demo/github') {
      if (req.headers.authorization !== 'Bearer github_pat_local_demo') { res.writeHead(401); return res.end('{}'); }
      const pathname = url.searchParams.get('path');
      if (!pathname?.startsWith('/') || pathname.startsWith('//')) { res.writeHead(400); return res.end('{}'); }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 12 * 1024 * 1024) { res.writeHead(413); return res.end('{}'); } }
      const result = await fake.fetch(`https://api.github.com${pathname}`, { method: req.method, body: body || undefined });
      res.writeHead(result.status, { 'Content-Type': 'application/json' }); return res.end(await result.text());
    }
    if (url.pathname === '/admin/config.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ...config, demo })); }
    if (!['GET', 'HEAD'].includes(req.method) || !url.pathname.startsWith('/admin/')) { res.writeHead(404); return res.end('Not found'); }
    const relative = decodeURIComponent(url.pathname.slice('/admin/'.length)) || 'index.html';
    const file = path.resolve(adminRoot, relative);
    if (!file.startsWith(adminRoot + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`${demo ? 'Local demo (memory only)' : 'Admin preview'}: http://127.0.0.1:${port}/admin/`));
