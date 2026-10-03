import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, '../static/admin');
await mkdir(output, { recursive: true });
const result = await build({ absWorkingDir: root, entryPoints: ['src/app.mjs'], tsconfigRaw: {}, bundle: true, minify: true, platform: 'browser', target: ['es2022'], write: false, legalComments: 'eof' });
const js = result.outputFiles[0].contents;
const css = await readFile(path.join(root, 'public/style.css'));
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
const scriptName = `app.${hash(js)}.js`;
const styleName = `style.${hash(css)}.css`;
const html = (await readFile(path.join(root, 'public/index.html'), 'utf8')).replace('__SCRIPT__', scriptName).replace('__STYLE__', styleName);
await writeFile(path.join(output, scriptName), js);
await writeFile(path.join(output, styleName), css);
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, 'config.json'), await readFile(path.join(root, 'public/config.json')));
// 只清理本脚本生成的旧版本文件，不递归删除目录。
for (const name of await readdir(output)) {
  if (/^(app\.[a-f0-9]{12}\.js|style\.[a-f0-9]{12}\.css)$/.test(name) && ![scriptName, styleName].includes(name)) await unlink(path.join(output, name));
}
console.log('Built static/admin/:', scriptName, styleName);
