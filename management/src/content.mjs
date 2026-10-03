import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import YAML from 'yaml';
import { HttpError } from './auth.mjs';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_MARKDOWN_BYTES = 256 * 1024;
export const LIBRARY_PATH = 'data/library.toml';
const utf8 = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const allowedExtensions = new Set(['pdf', 'zip', '7z', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp3', 'mp4', 'json', 'csv', 'epub', 'odt']);

export function text(value, label, limit = 200, required = false) {
  if (typeof value !== 'string' || value.length > limit || value.includes('\0') || (required && !value.trim())) throw new HttpError(400, `${label}不正确。`, 'invalid_content');
  return value.trim();
}

export function filename(value) {
  const name = text(value, '文件名', 120, true).normalize('NFC');
  if (/[/\\%?#<>:"|\x00-\x1f]/.test(name) || name.startsWith('.') || name.endsWith('.') || name.endsWith(' ') || /^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(name)) throw new HttpError(400, '文件名不能包含路径或特殊符号。', 'invalid_filename');
  const extension = name.split('.').pop().toLowerCase();
  if (!name.includes('.') || !allowedExtensions.has(extension)) throw new HttpError(400, '这个文件类型暂不支持上传。', 'file_type_forbidden');
  return name;
}

export function filePath(value) {
  if (typeof value !== 'string' || !value.startsWith('static/files/')) throw new HttpError(400, '只能管理文件柜中的文件。', 'path_forbidden');
  const name = filename(value.slice('static/files/'.length));
  if (value !== `static/files/${name}`) throw new HttpError(400, '文件路径不正确。', 'path_forbidden');
  return value;
}

export function documentPath(value, allowAbout = true) {
  if (allowAbout && value === 'content/about/index.md') return value;
  if (typeof value !== 'string' || value.length > 220 || !/^content\/(notes|games)\/(?:[a-zA-Z0-9][a-zA-Z0-9_-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(value) || value.includes('..') || value.split('/').at(-1) === '_index.md') throw new HttpError(400, '只能编辑随手记、游戏记录和关于我。', 'path_forbidden');
  return value;
}

export function writablePath(value) {
  if (value === LIBRARY_PATH) return value;
  if (typeof value === 'string' && value.startsWith('static/images/site/')) return managedImagePath(value);
  if (value.startsWith('static/')) return filePath(value);
  return documentPath(value);
}

export function managedImagePath(value) {
  if (typeof value !== 'string' || !/^static\/images\/site\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(png|jpg|jpeg|webp|gif)$/.test(value)) throw new HttpError(400, '只能管理后台上传的站点图片。', 'path_forbidden');
  return value;
}

export function safeUrl(value) {
  const url = text(value, '链接', 2048, true);
  if (/[\s\\\x00-\x1f]/.test(url)) throw new HttpError(400, '链接格式不正确。', 'invalid_url');
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href;
  } catch {}
  throw new HttpError(400, '请填写 http、https 或站内链接。', 'invalid_url');
}

export function decodeBase64(value, maxBytes = MAX_UPLOAD_BYTES) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes / 3) * 4 + 8 || value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value) || !/^[^=]*(?:={1,2})?$/.test(value)) throw new HttpError(400, '文件编码或大小不正确。', 'invalid_upload');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (bytes.length > maxBytes) throw new HttpError(413, '单个文件最多上传 8 MB。', 'file_too_large');
  return bytes;
}

export function encodeBase64(value) {
  const bytes = typeof value === 'string' ? utf8.encode(value) : value;
  const parts = [];
  for (let i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(parts.join(''));
}

export function blobText(value) {
  try { return decoder.decode(decodeBase64(value.replace(/\s/g, ''), 2 * 1024 * 1024)); }
  catch { throw new HttpError(400, '内容不是可编辑的 UTF-8 文本。', 'invalid_text'); }
}

export function parseLibrary(value) {
  try {
    const data = parseToml(value.replace(/^\uFEFF/, ''));
    if (!data.home || !Array.isArray(data.portals) || !data.collections) throw new Error('Invalid library');
    return data;
  } catch { throw new HttpError(400, '资料库配置无法读取，请先修复 data/library.toml。', 'invalid_library'); }
}

export function serializeLibrary(data) { return stringifyToml(data); }

export function entries(data, category) {
  if (!['files', 'bookmarks', 'tools'].includes(category)) throw new HttpError(400, '不支持这个栏目。', 'invalid_category');
  const items = data.collections[category]?.items || [];
  if (!Array.isArray(items)) throw new HttpError(400, '栏目数据格式不正确。');
  return items.map((item, i) => ({ ...item, id: item.id || `legacy-${i}` }));
}

export function setEntries(data, category, values) {
  data.collections[category] = { ...data.collections[category], items: values.map(item => ({ ...item, id: item.id.startsWith('legacy-') ? crypto.randomUUID() : item.id })) };
}

export function fileUrl(path) { return '/files/' + encodeURIComponent(path.slice('static/files/'.length)); }
export function matchingFile(item, path) {
  try { return decodeURIComponent(item.url) === decodeURIComponent(fileUrl(path)); } catch { return false; }
}

export function parseDocument(source) {
  const value = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = value.match(/^(---|\+\+\+)\n([\s\S]*?)\n\1(?:\n|$)/);
  if (!match) return { metadata: {}, body: value, format: 'yaml' };
  try {
    const metadata = match[1] === '+++' ? parseToml(match[2]) : YAML.parse(match[2], { maxAliasCount: 20 });
    if (metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) throw new Error('Invalid front matter');
    return { metadata: metadata || {}, body: value.slice(match[0].length), format: match[1] === '+++' ? 'toml' : 'yaml' };
  } catch { throw new HttpError(400, '文档的 front matter 无法读取，请先修复原文。', 'invalid_document'); }
}

export function documentInput(input, original = '') {
  const parsed = parseDocument(original);
  const title = text(input.title, '标题', 200, true);
  const description = text(input.description || '', '简介', 1000);
  const date = text(input.date || '', '日期', 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new HttpError(400, '日期格式应为有效的 YYYY-MM-DD。');
  if (typeof input.body !== 'string' || utf8.encode(input.body).length > MAX_MARKDOWN_BYTES || input.body.includes('\0')) throw new HttpError(400, '正文太长或格式不正确。');
  if (typeof input.draft !== 'boolean') throw new HttpError(400, '草稿状态不正确。');
  const metadata = { ...parsed.metadata, title, description, draft: input.draft };
  if (date) metadata.date = date;
  else delete metadata.date;
  const front = parsed.format === 'toml' ? stringifyToml(metadata) : YAML.stringify(metadata);
  const delimiter = parsed.format === 'toml' ? '+++' : '---';
  return `${delimiter}\n${front.trimEnd()}\n${delimiter}\n\n${input.body.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\n*$/, '')}\n`;
}

export function newDocumentPath(category, slug) {
  if (!['notes', 'games'].includes(category)) throw new HttpError(400, '请选择随手记或游戏记录。');
  if (slug && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new HttpError(400, '文件名请使用小写英文字母、数字和连字符。');
  if (slug === 'index') throw new HttpError(400, 'index 是保留文件名，请换一个名称。');
  return `content/${category}/${slug || crypto.randomUUID()}.md`;
}
