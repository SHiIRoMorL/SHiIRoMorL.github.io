import { HttpError } from './auth.mjs';
import { GitHub } from './github.mjs';
import { imageReferences, setImageReference, settingsInput, siteSettings } from './site-settings.mjs';
import { LIBRARY_PATH, MAX_UPLOAD_BYTES, decodeBase64, documentPath, documentInput, entries, filePath, filename, fileUrl, matchingFile, managedImagePath, newDocumentPath, parseDocument, safeUrl, serializeLibrary, setEntries, text } from './content.mjs';

function revision(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new HttpError(400, '请先刷新列表，再执行保存。', 'revision_required');
  return value;
}

function isDocument(path) {
  try { return Boolean(documentPath(path)); } catch { return false; }
}

function dateString(value) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export class LibraryAdmin {
  constructor(config, token, fetchImpl) {
    if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new HttpError(400, '请输入 GitHub 细粒度访问令牌。');
    this.github = new GitHub(config, token, fetchImpl);
    this.ownerId = config.OWNER_ID;
    this.siteDefaults = config.SITE_DEFAULTS || {};
    this.verified = false;
  }

  async authenticate() {
    const user = await this.github.verifyOwner(this.ownerId);
    this.verified = true;
    return user;
  }

  async guard() {
    if (!this.verified) throw new HttpError(401, '请先连接 GitHub。');
  }

  async state() {
    await this.guard();
    const snapshot = await this.github.snapshot();
    const fileItems = entries(snapshot.library, 'files');
    const files = [];
    for (const [path, item] of snapshot.blobs) {
      try { filePath(path); } catch { continue; }
      const index = fileItems.find(entry => matchingFile(entry, path));
      files.push({ path, name: path.slice('static/files/'.length), size: item.size || 0, title: index?.title || path.split('/').at(-1), description: index?.description || '', missing: false });
    }
    for (const item of fileItems) {
      if (item.url?.startsWith('/files/')) {
        try {
          const path = filePath('static' + decodeURIComponent(item.url));
          if (!snapshot.blobs.has(path)) files.push({ path, name: path.split('/').at(-1), size: 0, title: item.title, description: item.description || '', missing: true });
        } catch {}
      }
    }
    const paths = [...snapshot.blobs.keys()].filter(isDocument);
    if (paths.length > 200) throw new HttpError(400, '文档数量超过当前后台的读取上限。');
    const documents = [];
    // 限制并发，避免一次发出大量 GitHub 请求。
    for (let i = 0; i < paths.length; i += 5) {
      const group = await Promise.all(paths.slice(i, i + 5).map(async path => {
        const parsed = parseDocument(await this.github.readBlob(snapshot.blobs.get(path).sha));
        return { path, title: String(parsed.metadata.title || path.split('/').at(-1)), description: String(parsed.metadata.description || ''), date: dateString(parsed.metadata.date), draft: Boolean(parsed.metadata.draft), category: path === 'content/about/index.md' ? 'about' : path.split('/')[1] };
      }));
      documents.push(...group);
    }
    return { revision: snapshot.revision, site: siteSettings(snapshot, this.siteDefaults), files: files.sort((a, b) => a.name.localeCompare(b.name, 'zh')), documents: documents.sort((a, b) => b.date.localeCompare(a.date)), bookmarks: entries(snapshot.library, 'bookmarks'), tools: entries(snapshot.library, 'tools'), maxUploadBytes: MAX_UPLOAD_BYTES };
  }

  async previewImage(sha) {
    await this.guard();
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new HttpError(400, '图片引用不正确。');
    const blob = await this.github.api(`${this.github.base}/git/blobs/${sha}`);
    return decodeBase64(blob.content.replace(/\s/g, ''));
  }

  async saveSiteSettings(input) {
    await this.guard();
    const settings = settingsInput(input);
    const snapshot = await this.github.snapshot(revision(input.revision));
    const previous = imageReferences(snapshot.library);
    snapshot.library.profile = { ...snapshot.library.profile, owner: settings.owner, signature: settings.signature };
    snapshot.library.home.subtitle = settings.homeSubtitle;
    const changes = [];
    for (const image of settings.images) {
      const path = image.action === 'upload' ? `static/images/site/${crypto.randomUUID()}.${image.extension}` : '';
      setImageReference(snapshot.library, image.slot, path ? path.slice('static/'.length) : '');
      if (path) changes.push({ path, base64: image.contentBase64 });
    }
    const remaining = new Set(imageReferences(snapshot.library));
    for (const path of new Set(previous)) {
      // 只删除已经无人引用的后台图片；原始素材与文件柜附件均保留。
      try { managedImagePath(path); } catch { continue; }
      if (!remaining.has(path) && snapshot.blobs.has(path)) changes.push({ path, sha: null });
    }
    changes.push({ path: LIBRARY_PATH, text: serializeLibrary(snapshot.library) });
    return this.github.commit(snapshot, changes, 'Update site profile and cover images');
  }

  async document(path) {
    await this.guard(); documentPath(path);
    const snapshot = await this.github.snapshot();
    const blob = snapshot.blobs.get(path);
    if (!blob) throw new HttpError(404, '文档已经不存在，请刷新列表。');
    const parsed = parseDocument(await this.github.readBlob(blob.sha));
    return { path, revision: snapshot.revision, title: String(parsed.metadata.title || ''), description: String(parsed.metadata.description || ''), body: parsed.body, date: dateString(parsed.metadata.date), draft: Boolean(parsed.metadata.draft), category: path === 'content/about/index.md' ? 'about' : path.split('/')[1] };
  }

  async saveDocument(input) {
    await this.guard();
    const path = input.path ? documentPath(input.path) : newDocumentPath(input.category, input.slug);
    if (path === 'content/about/index.md' && input.draft) throw new HttpError(400, '关于我页面需要保持发布状态。');
    // 先验证输入，再读取或写入仓库。
    documentInput(input);
    const snapshot = await this.github.snapshot(revision(input.revision));
    const existing = snapshot.blobs.get(path);
    if (!input.path && existing) throw new HttpError(409, '同名文档已经存在，请换一个文件名。');
    if (input.path && !existing) throw new HttpError(404, '原文档已被删除，请刷新列表。');
    const original = existing ? await this.github.readBlob(existing.sha) : '';
    const source = documentInput(input, original);
    return this.github.commit(snapshot, [{ path, text: source }], `${input.draft ? 'Save draft' : 'Publish'}: ${input.title}`);
  }

  async deleteDocument(input) {
    await this.guard();
    const path = documentPath(input.path, false);
    const snapshot = await this.github.snapshot(revision(input.revision));
    if (!snapshot.blobs.has(path)) throw new HttpError(404, '文档已经不存在。');
    return this.github.commit(snapshot, [{ path, sha: null }], `Delete document: ${path.split('/').at(-1)}`);
  }

  async uploadFile(input) {
    await this.guard();
    const name = filename(input.name);
    const path = `static/files/${name}`;
    decodeBase64(input.contentBase64);
    const title = text(input.title || name, '文件标题', 200, true);
    const description = text(input.description || '', '文件说明', 1000);
    const snapshot = await this.github.snapshot(revision(input.revision));
    if (snapshot.blobs.has(path)) throw new HttpError(409, '同名文件已经存在，请改名后上传。');
    const items = entries(snapshot.library, 'files').filter(item => !matchingFile(item, path));
    items.push({ id: crypto.randomUUID(), title, description, url: fileUrl(path), icon: 'file', download: true });
    setEntries(snapshot.library, 'files', items);
    return this.github.commit(snapshot, [{ path, base64: input.contentBase64 }, { path: LIBRARY_PATH, text: serializeLibrary(snapshot.library) }], `Upload file: ${name}`);
  }

  async updateFile(input) {
    await this.guard();
    const path = filePath(input.path);
    const newPath = `static/files/${filename(input.name)}`;
    const title = text(input.title, '文件标题', 200, true);
    const description = text(input.description || '', '文件说明', 1000);
    const snapshot = await this.github.snapshot(revision(input.revision));
    const blob = snapshot.blobs.get(path);
    if (!blob) throw new HttpError(404, '原文件已经不存在。');
    if (newPath !== path && snapshot.blobs.has(newPath)) throw new HttpError(409, '新文件名已经被占用。');
    const items = entries(snapshot.library, 'files').filter(item => !matchingFile(item, path));
    items.push({ id: crypto.randomUUID(), title, description, url: fileUrl(newPath), icon: 'file', download: true });
    setEntries(snapshot.library, 'files', items);
    const changes = [{ path: LIBRARY_PATH, text: serializeLibrary(snapshot.library) }];
    if (newPath !== path) changes.push({ path, sha: null }, { path: newPath, sha: blob.sha });
    return this.github.commit(snapshot, changes, `Update file: ${title}`);
  }

  async deleteFile(input) {
    await this.guard();
    const path = filePath(input.path);
    const snapshot = await this.github.snapshot(revision(input.revision));
    const items = entries(snapshot.library, 'files');
    const remaining = items.filter(item => !matchingFile(item, path));
    if (!snapshot.blobs.has(path) && remaining.length === items.length) throw new HttpError(404, '文件已经不存在。');
    setEntries(snapshot.library, 'files', remaining);
    const changes = [{ path: LIBRARY_PATH, text: serializeLibrary(snapshot.library) }];
    if (snapshot.blobs.has(path)) changes.push({ path, sha: null });
    return this.github.commit(snapshot, changes, `Delete file: ${path.split('/').at(-1)}`);
  }

  async saveLink(input) {
    await this.guard();
    if (!['bookmarks', 'tools'].includes(input.category)) throw new HttpError(400, '不支持这个栏目。');
    const title = text(input.title, '标题', 200, true);
    const description = text(input.description || '', '说明', 1000);
    const url = safeUrl(input.url);
    const snapshot = await this.github.snapshot(revision(input.revision));
    const items = entries(snapshot.library, input.category);
    const index = input.id ? items.findIndex(item => item.id === input.id) : -1;
    if (input.id && index === -1) throw new HttpError(404, '原条目已经不存在。');
    const item = { ...(index === -1 ? {} : items[index]), id: input.id || crypto.randomUUID(), title, description, url, icon: input.category === 'tools' ? 'tool' : 'link' };
    if (index === -1) items.push(item); else items[index] = item;
    setEntries(snapshot.library, input.category, items);
    return this.github.commit(snapshot, [{ path: LIBRARY_PATH, text: serializeLibrary(snapshot.library) }], `Update ${input.category}: ${title}`);
  }

  async deleteLink(input) {
    await this.guard();
    if (!['bookmarks', 'tools'].includes(input.category)) throw new HttpError(400, '不支持这个栏目。');
    const snapshot = await this.github.snapshot(revision(input.revision));
    const items = entries(snapshot.library, input.category);
    const remaining = items.filter(item => item.id !== input.id);
    if (remaining.length === items.length) throw new HttpError(404, '原条目已经不存在。');
    setEntries(snapshot.library, input.category, remaining);
    return this.github.commit(snapshot, [{ path: LIBRARY_PATH, text: serializeLibrary(snapshot.library) }], `Delete ${input.category} item`);
  }

  async deployment(sha) { await this.guard(); return this.github.deployment(sha); }
}
