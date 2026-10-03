import { LibraryAdmin } from './admin-service.mjs';
import { encodeBase64, MAX_UPLOAD_BYTES, safeUrl } from './content.mjs';

const $ = selector => document.querySelector(selector);
let config, service, state, panel = 'files', user, editor, busy = false, dirty = false, connecting = false, pollGeneration = 0;
let noticeTimer;
const descriptions = {
  files: ['文件柜', '管理文档、备份与零散附件。', '上传文件'],
  documents: ['文档', '编辑随手记和游戏记录，或先保存为草稿。', '新建文档'],
  bookmarks: ['收藏夹', '留住以后会用到的链接。', '添加链接'],
  tools: ['小工具', '收好偶尔需要的工具入口。', '添加工具'],
  about: ['关于我', '更新你的介绍。', '编辑介绍']
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function showNotice(message) {
  const notice = $('#notice'); notice.textContent = message; notice.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('[data-mutates], #refresh, #disconnect, .item-actions button').forEach(button => { button.disabled = value; });
}

function action(label, handler, danger = false) {
  const button = element('button', `plain${danger ? ' danger' : ''}`, label);
  button.type = 'button'; button.disabled = busy; button.addEventListener('click', handler);
  return button;
}

function bytes(size) {
  return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function openLink(url, label) {
  const link = element('a', 'plain', label);
  try { link.href = safeUrl(url); } catch { link.href = '#'; }
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}

function render() {
  if (!state) return;
  const [title, description, create] = descriptions[panel];
  $('#panel-title').textContent = title; $('#panel-description').textContent = description; $('#create-item').textContent = create;
  $('#document-category').hidden = panel !== 'documents';
  $('#filter').hidden = panel === 'about';
  document.querySelectorAll('[data-panel]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.panel === panel);
    if (button.dataset.panel === panel) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  const query = $('#filter').value.trim().toLowerCase();
  const category = $('#document-category').value;
  let items = panel === 'documents' ? state.documents.filter(item => item.category !== 'about' && (category === 'all' || item.category === category)) : panel === 'about' ? state.documents.filter(item => item.category === 'about') : state[panel];
  items = items.filter(item => [item.title, item.description, item.name, item.url].filter(Boolean).join(' ').toLowerCase().includes(query));
  const container = $('#items'); container.replaceChildren();
  if (!items.length) { container.append(element('div', 'empty-state', query ? '没有匹配的内容。' : '这里还没有内容，从右上角开始添加。')); return; }
  for (const item of items) {
    const row = element('div', 'item-row');
    const icon = element('span', 'item-icon', panel === 'files' ? item.name.split('.').at(-1).slice(0, 5).toUpperCase() : ['documents', 'about'].includes(panel) ? 'MD' : 'LINK');
    icon.setAttribute('aria-hidden', 'true');
    const copy = element('div', 'item-copy'); copy.append(element('p', 'item-title', item.title));
    if (item.description) copy.append(element('p', 'item-description', item.description));
    const meta = element('div', 'item-meta');
    if (panel === 'files') meta.append(element('span', '', item.name), element('span', '', item.missing ? '原文件缺失' : bytes(item.size)));
    else if (['documents', 'about'].includes(panel)) meta.append(element('span', '', item.draft ? '草稿' : '已发布'), element('span', '', item.date || ''), element('span', '', item.category === 'games' ? '游戏记录' : item.category === 'notes' ? '随手记' : '关于我'));
    else meta.append(element('span', '', item.url));
    copy.append(meta);
    const actions = element('div', 'item-actions');
    if (panel === 'files') {
      if (!item.missing) actions.append(openLink(new URL(`files/${encodeURIComponent(item.name)}`, config.demo ? location.origin + '/' : config.PUBLIC_SITE_URL).href, '查看'), action('编辑', () => openFile(item)));
      actions.append(action('删除', () => removeItem('deleteFile', item, `删除“${item.title}”？原文件和文件柜索引会一起删除。`), true));
    } else if (['documents', 'about'].includes(panel)) {
      actions.append(action('编辑', () => openDocument(item.path)));
      if (panel !== 'about') actions.append(action('删除', () => removeItem('deleteDocument', item, `删除“${item.title}”？这会在 GitHub 中删除文档。`), true));
    } else {
      actions.append(openLink(item.url, '打开'), action('编辑', () => openLinkEditor(item)), action('删除', () => removeItem('deleteLink', item, `删除“${item.title}”这个链接？`), true));
    }
    row.append(icon, copy, actions); container.append(row);
  }
}

async function refresh() {
  if (busy || !service) return;
  setBusy(true);
  try { state = await service.state(); render(); }
  catch (error) { handleError(error); }
  finally { setBusy(false); }
}

function handleError(error, form) {
  const message = error.message || '操作失败，请稍后重试。';
  if (form) form.querySelector('.form-error').textContent = message; else showNotice(message);
  if (error.status === 401) showNotice('令牌已失效，请断开后重新连接。');
}

async function connect(token) {
  if (connecting) return;
  connecting = true;
  $('#login-error').textContent = ''; $('#connect-button').disabled = true; $('#demo-login').disabled = true;
  let candidate;
  try {
    const transport = config.demo ? (url, options = {}) => fetch(new URL(`__demo/github?path=${encodeURIComponent(new URL(url).pathname + new URL(url).search)}`, location.origin), options) : undefined;
    candidate = new LibraryAdmin(config, token, transport);
    user = await candidate.authenticate();
    const loaded = await candidate.state();
    service = candidate; state = loaded; $('#token').value = '';
    $('#login-panel').hidden = true; $('#dashboard').hidden = false;
    $('#account-name').textContent = `${user.login} · 已连接 GitHub`;
    $('#demo-banner').hidden = !config.demo; render();
  } catch (error) {
    if (candidate) candidate.github.token = '';
    $('#login-error').textContent = error.message || '暂时无法连接 GitHub。';
  } finally { connecting = false; $('#connect-button').disabled = false; $('#demo-login').disabled = false; }
}

function disconnect() {
  if (busy) return;
  pollGeneration++;
  if (service) service.github.token = '';
  service = null; state = null; user = null; editor = null; dirty = false;
  $('#token').value = ''; $('#login-error').textContent = ''; $('#items').replaceChildren();
  $('#dashboard').hidden = true; $('#login-panel').hidden = false; $('#publish-status').hidden = true;
  document.querySelectorAll('dialog').forEach(dialog => { dialog.close(); dialog.querySelector('form')?.reset(); });
}

function openDialog(selector, value) {
  const dialog = $(selector); dialog.querySelector('form').reset(); dialog.querySelector('.form-error').textContent = '';
  editor = value; dirty = false; dialog.showModal();
}

function openFile(item) {
  if (busy) return;
  openDialog('#file-dialog', { type: 'file', item, revision: state.revision });
  $('#file-dialog-title').textContent = item ? '编辑文件' : '上传文件';
  $('#file-picker-label').hidden = Boolean(item); $('#upload-file').required = !item;
  $('#file-name').value = item?.name || ''; $('#file-title').value = item?.title || ''; $('#file-description').value = item?.description || '';
}

function openLinkEditor(item) {
  if (busy) return;
  openDialog('#link-dialog', { type: 'link', item, category: panel, revision: state.revision });
  $('#link-dialog-title').textContent = `${item ? '编辑' : '添加'}${panel === 'tools' ? '工具' : '链接'}`;
  $('#link-title').value = item?.title || ''; $('#link-url').value = item?.url || ''; $('#link-description').value = item?.description || '';
}

async function openDocument(path) {
  if (busy) return;
  setBusy(true);
  try {
    const value = path ? await service.document(path) : { path: null, revision: state.revision, title: '', description: '', body: '', date: new Intl.DateTimeFormat('sv-SE').format(new Date()), category: $('#document-category').value === 'games' ? 'games' : 'notes', draft: true };
    openDialog('#document-dialog', { type: 'document', ...value });
    $('#document-dialog-title').textContent = path ? '编辑文档' : '新建文档';
    $('#document-title').value = value.title; $('#document-description').value = value.description; $('#document-body').value = value.body;
    $('#document-date').value = value.date; $('#editor-category').value = value.category; $('#editor-category').disabled = Boolean(path);
    $('#slug-label').hidden = Boolean(path); $('#save-draft').hidden = value.category === 'about';
  } catch (error) { handleError(error); }
  finally { setBusy(false); }
}

async function mutate(method, input, dialog) {
  if (busy || !service) return;
  setBusy(true);
  const form = dialog?.querySelector('form'); if (form) form.querySelector('.form-error').textContent = '';
  try {
    const result = await service[method](input);
    dirty = false; if (dialog) { dialog.close(); form.reset(); }
    showNotice('已保存到 GitHub。');
    renderPublication('已保存，网站正在发布。', result.url);
    // 提交已经完成时，列表读取失败不能被显示成保存失败。
    try { state = await service.state(); render(); } catch (error) { showNotice(`已保存，但列表刷新失败：${error.message}`); }
    pollPublication(result.commit, result.url);
  } catch (error) { handleError(error, form); }
  finally { setBusy(false); }
}

async function removeItem(method, item, question) {
  if (busy || !confirm(question)) return;
  const input = { path: item.path, id: item.id, category: panel, revision: state.revision };
  await mutate(method, input);
}

function renderPublication(message, url) {
  const status = $('#publish-status'); status.hidden = false; status.replaceChildren(element('span', '', message));
  if (url) status.append(openLink(url, '查看 GitHub ↗'));
}

async function pollPublication(sha, commitUrl) {
  const generation = ++pollGeneration;
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 4000));
    if (generation !== pollGeneration || !service) return;
    try {
      const run = await service.deployment(sha);
      if (generation !== pollGeneration || !service) return;
      if (run.status === 'completed') {
        renderPublication(run.conclusion === 'success' ? '网站已发布。' : '内容已保存，自动发布未成功。可以到 GitHub 查看原因。', run.url || commitUrl); return;
      }
      renderPublication(run.status === 'queued' ? '已保存，等待自动发布。' : '已保存，网站正在发布。', run.url || commitUrl);
    } catch { renderPublication('内容已保存。请到 GitHub 查看发布进度；自动查询需要 Actions 只读权限。', commitUrl); return; }
  }
  renderPublication('内容已保存，发布仍在进行。可以到 GitHub 查看进度。', commitUrl);
}

function closeDialog(dialog) {
  if (busy) return;
  if (dirty && !confirm('放弃尚未保存的编辑？')) return;
  dirty = false; editor = null; dialog.close(); dialog.querySelector('form').reset();
}

async function bootstrap() {
  if (window.top !== window.self) { document.body.replaceChildren(element('p', '', '请在独立窗口打开管理后台。')); return; }
  config = await (await fetch(new URL('config.json', location.href), { cache: 'no-store' })).json();
  if (config.demo && !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('演示模式仅可在本地运行。');
  $('#back-site').href = safeUrl(config.PUBLIC_SITE_URL);
  $('#demo-login').hidden = !config.demo;
  $('#login-form').addEventListener('submit', event => { event.preventDefault(); connect($('#token').value.trim()); });
  $('#demo-login').addEventListener('click', () => connect('github_pat_local_demo'));
  $('#disconnect').addEventListener('click', disconnect); $('#refresh').addEventListener('click', refresh);
  $('#filter').addEventListener('input', render); $('#document-category').addEventListener('change', render);
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => { panel = button.dataset.panel; $('#filter').value = ''; render(); }));
  $('#create-item').addEventListener('click', () => {
    if (panel === 'files') openFile(); else if (panel === 'documents') openDocument();
    else if (panel === 'about') openDocument('content/about/index.md'); else openLinkEditor();
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
    dialog.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => closeDialog(dialog)));
    dialog.querySelector('form').addEventListener('input', () => { dirty = true; });
  });
  $('#upload-file').addEventListener('change', () => {
    const file = $('#upload-file').files[0]; if (!file) return;
    $('#file-name').value = file.name; if (!$('#file-title').value) $('#file-title').value = file.name;
  });
  $('#file-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const input = { path: editor.item?.path, name: $('#file-name').value, title: $('#file-title').value, description: $('#file-description').value, revision: editor.revision };
    if (editor.item) return mutate('updateFile', input, $('#file-dialog'));
    const file = $('#upload-file').files[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { handleError(new Error('单个文件最多上传 8 MB。'), event.target); return; }
    setBusy(true);
    try { input.contentBase64 = encodeBase64(new Uint8Array(await file.arrayBuffer())); }
    catch { handleError(new Error('无法读取这个文件。'), event.target); return; }
    finally { setBusy(false); }
    await mutate('uploadFile', input, $('#file-dialog'));
  });
  $('#link-form').addEventListener('submit', event => {
    event.preventDefault();
    mutate('saveLink', { category: editor.category, id: editor.item?.id, title: $('#link-title').value, description: $('#link-description').value, url: $('#link-url').value, revision: editor.revision }, $('#link-dialog'));
  });
  $('#document-form').addEventListener('submit', event => {
    event.preventDefault();
    mutate('saveDocument', { path: editor.path, category: $('#editor-category').value, slug: $('#document-slug').value, title: $('#document-title').value, description: $('#document-description').value, date: $('#document-date').value, body: $('#document-body').value, draft: event.submitter?.dataset.draft === 'true', revision: editor.revision }, $('#document-dialog'));
  });
  document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => {
    const field = $('#document-body'); const start = field.selectionStart, end = field.selectionEnd;
    const selected = field.value.slice(start, end);
    const templates = { heading: `## ${selected || '标题'}`, bold: `**${selected || '文字'}**`, link: `[${selected || '链接文字'}](https://)`, list: `- ${selected || '列表项目'}`, code: `\n\x60\x60\x60\n${selected || '代码'}\n\x60\x60\x60\n` };
    field.setRangeText(templates[button.dataset.format], start, end, 'end'); field.focus(); dirty = true;
  }));
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
}

bootstrap().catch(error => { $('#login-error').textContent = error.message || '后台配置无法读取。'; });
