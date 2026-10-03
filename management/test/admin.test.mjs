import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryAdmin } from '../src/admin-service.mjs';
import { GitHub } from '../src/github.mjs';
import { decodeBase64, documentInput, documentPath, filePath, filename, newDocumentPath, parseDocument, parseLibrary, safeUrl, MAX_UPLOAD_BYTES } from '../src/content.mjs';
import { FakeGitHub } from './fake-github.mjs';

const config = { REPO_OWNER: 'SHiIRoMorL', REPO_NAME: 'SHiIRoMorL.github.io', REPO_BRANCH: 'main', OWNER_ID: '268295554' };
// 固定测试数据，日后修改真实文件和收藏不会影响部署测试。
const library = `[home]\nsubtitle = "测试文案"\nimage = ""\n[[portals]]\nkey = "files"\npage = "/files"\ntitle = "文件柜"\nimage = ""\n[collections.files]\nitems = []\n[[collections.bookmarks.items]]\ntitle = "GitHub"\nurl = "https://github.com/SHiIRoMorL"\n[collections.tools]\nitems = []\n[collections.notes]\nitems = []\n[collections.games]\nitems = []\n`;
const about = '---\ntitle: 关于我\nmenu:\n  main:\n    weight: 60\n    params:\n      icon: user\n---\n\n你好。\n';
const decoder = new TextDecoder();
async function setup(options, extra = {}) {
  const fake = new FakeGitHub({ 'data/library.toml': library, 'content/about/index.md': about, ...extra }, options);
  const admin = new LibraryAdmin(config, 'github_pat_fake_test', fake.fetch);
  await admin.authenticate(); return { admin, fake };
}

test('unconnected admin cannot read or write', async () => {
  const fake = new FakeGitHub({}); const admin = new LibraryAdmin(config, 'github_pat_test', fake.fetch);
  await assert.rejects(admin.state(), error => error.status === 401);
  await assert.rejects(admin.uploadFile({}), error => error.status === 401);
  assert.equal(fake.calls.length, 0);
});
test('a different GitHub account is rejected', async () => {
  await assert.rejects(setup({ ownerId: 42 }), error => error.code === 'owner_only');
});
test('invalid token and an account without push access are rejected', async () => {
  await assert.rejects(setup({ rejectToken: true }), error => error.status === 401);
  await assert.rejects(setup({ push: false }), error => error.status === 403);
});
test('only fine-grained token format is accepted', () => {
  assert.throws(() => new LibraryAdmin(config, 'ghp_classic'), error => error.status === 400);
});
test('repository owner can connect when GitHub omits the optional permissions field', async () => {
  const { admin } = await setup({ omitPermissions: true });
  assert.equal((await admin.state()).bookmarks.length, 1);
});
test('uploads and file index are committed atomically', async () => {
  const { admin, fake } = await setup(); const initial = parseLibrary(library);
  await admin.uploadFile({ revision: fake.head, name: '我的资料.txt', title: '资料', description: '说明', contentBase64: btoa('hello') });
  const files = fake.files(); assert.equal(decoder.decode(files['static/files/我的资料.txt']), 'hello');
  const updated = parseLibrary(decoder.decode(files['data/library.toml']));
  assert.equal(updated.collections.files.items[0].url, '/files/%E6%88%91%E7%9A%84%E8%B5%84%E6%96%99.txt');
  assert.deepEqual(updated.home, initial.home); assert.deepEqual(updated.portals, initial.portals);
  assert.equal(fake.lastTreeChanges.length, 2); assert.equal(fake.lastRef.force, false);
});
test('rename keeps bytes and updates the reference in the same commit', async () => {
  const { admin, fake } = await setup();
  await admin.uploadFile({ revision: fake.head, name: 'old.txt', title: '旧资料', contentBase64: btoa('same bytes') });
  await admin.updateFile({ revision: fake.head, path: 'static/files/old.txt', name: 'new.txt', title: '新资料' });
  const files = fake.files(); assert.equal(files['static/files/old.txt'], undefined); assert.equal(decoder.decode(files['static/files/new.txt']), 'same bytes');
  assert.equal(parseLibrary(decoder.decode(files['data/library.toml'])).collections.files.items[0].url, '/files/new.txt');
  assert.equal(fake.lastTreeChanges.length, 3);
});
test('deleting a file also removes its index', async () => {
  const { admin, fake } = await setup();
  await admin.uploadFile({ revision: fake.head, name: 'delete.txt', title: '待删', contentBase64: btoa('x') });
  await admin.deleteFile({ revision: fake.head, path: 'static/files/delete.txt' });
  const files = fake.files(); assert.equal(files['static/files/delete.txt'], undefined);
  assert.equal(parseLibrary(decoder.decode(files['data/library.toml'])).collections.files.items.length, 0);
});
test('duplicate filenames are never silently overwritten', async () => {
  const { admin, fake } = await setup(undefined, { 'static/files/existing.txt': 'original' });
  await assert.rejects(admin.uploadFile({ revision: fake.head, name: 'existing.txt', contentBase64: btoa('new') }), error => error.status === 409);
  assert.equal(decoder.decode(fake.files()['static/files/existing.txt']), 'original');
});
test('stale revisions do not write any blobs', async () => {
  const { admin, fake } = await setup();
  await assert.rejects(admin.saveLink({ revision: '2'.repeat(40), category: 'bookmarks', title: '新链接', url: 'https://example.com' }), error => error.code === 'conflict');
  assert.equal(fake.calls.filter(call => call.method !== 'GET').length, 0);
});
test('a race at branch update never forces over newer changes', async () => {
  const { admin, fake } = await setup({ race: true }); const initial = fake.head;
  await assert.rejects(admin.saveLink({ revision: fake.head, category: 'tools', title: '工具', url: 'https://example.com' }), error => error.code === 'conflict');
  assert.equal(fake.head, initial); assert.equal(fake.lastRef.force, false);
});
test('missing revision is rejected', async () => {
  const { admin } = await setup();
  await assert.rejects(admin.saveLink({ category: 'tools', title: '工具', url: 'https://example.com' }), error => error.code === 'revision_required');
});
test('links can be created, edited and deleted without changing other collections', async () => {
  const { admin, fake } = await setup();
  await admin.saveLink({ revision: fake.head, category: 'tools', title: '工具', description: '用途', url: 'https://example.com' });
  let state = await admin.state(); const id = state.tools[0].id;
  await admin.saveLink({ revision: fake.head, category: 'tools', id, title: '更新工具', url: '/tools/' });
  state = await admin.state(); assert.equal(state.tools[0].title, '更新工具'); assert.equal(state.bookmarks.length, 1);
  await admin.deleteLink({ revision: fake.head, category: 'tools', id });
  state = await admin.state(); assert.equal(state.tools.length, 0); assert.equal(state.bookmarks[0].title, 'GitHub');
});
test('Markdown documents support draft, publish and delete', async () => {
  const { admin, fake } = await setup();
  const input = { category: 'notes', slug: 'first-note', title: '第一条', description: '介绍', date: '2026-10-03', body: '## 你好\n\n正文', draft: true };
  await admin.saveDocument({ ...input, revision: fake.head });
  let doc = await admin.document('content/notes/first-note.md'); assert.equal(doc.draft, true); assert.match(doc.body, /正文/);
  await admin.saveDocument({ ...input, path: doc.path, revision: fake.head, draft: false });
  doc = await admin.document(doc.path); assert.equal(doc.draft, false);
  await admin.deleteDocument({ revision: fake.head, path: doc.path });
  assert.equal(fake.files()[doc.path], undefined);
});
test('editing About keeps menu and other front matter', async () => {
  const { admin, fake } = await setup();
  await admin.saveDocument({ path: 'content/about/index.md', title: '关于我', description: '新介绍', date: '', body: '新的介绍。', draft: false, revision: fake.head });
  const metadata = parseDocument(decoder.decode(fake.files()['content/about/index.md'])).metadata;
  assert.equal(metadata.menu.main.weight, 60); assert.equal(metadata.menu.main.params.icon, 'user');
});
test('About cannot be deleted or hidden as a draft', async () => {
  const { admin, fake } = await setup();
  await assert.rejects(admin.deleteDocument({ path: 'content/about/index.md', revision: fake.head }), error => error.status === 400);
  await assert.rejects(admin.saveDocument({ path: 'content/about/index.md', title: '我', body: '', draft: true, revision: fake.head }), error => error.status === 400);
});
test('layout, script, workflow and traversal paths cannot be written', async () => {
  const fake = new FakeGitHub({}); const git = new GitHub(config, 'fake', fake.fetch);
  for (const path of ['layouts/home.html', '.github/workflows/hugo.yml', 'assets/ts/library.ts', 'content/notes/../../hugo.toml', 'static/files/../admin/index.html', 'content/notes/_index.md']) {
    await assert.rejects(git.commit({ revision: '1'.repeat(40) }, [{ path, text: 'bad' }], 'bad'), error => error.status === 400);
  }
  assert.equal(fake.calls.length, 0);
});
test('dangerous filenames and active web files are rejected', () => {
  for (const name of ['../a.txt', 'a/b.txt', 'a\\b.txt', '%2e%2e.txt', '.env.txt', 'CON.txt', 'page.html', 'script.js', 'icon.svg']) assert.throws(() => filename(name));
  assert.equal(filename('资料说明.pdf'), '资料说明.pdf');
});
test('unsafe URL schemes and credentials are rejected', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'https://user:secret@example.com', '/\\evil', 'https://example.com/a b']) assert.throws(() => safeUrl(url));
  assert.equal(safeUrl('/notes/'), '/notes/');
});
test('unsupported collections cannot change homepage data', async () => {
  const { admin, fake } = await setup();
  await assert.rejects(admin.saveLink({ category: 'home', revision: fake.head, title: 'bad', url: '/'}), error => error.status === 400);
});
test('document path and reserved slug checks', () => {
  assert.equal(documentPath('content/games/game/index.md'), 'content/games/game/index.md');
  assert.throws(() => documentPath('content/notes/a/../../about/index.md'));
  assert.throws(() => newDocumentPath('notes', 'index'));
  assert.throws(() => newDocumentPath('notes', '../name'));
  assert.throws(() => filePath('static/files/%2e%2e.txt'));
});
test('validates calendar dates and preserves TOML front matter', () => {
  assert.throws(() => documentInput({ title: 'x', date: '2026-02-30', body: '', draft: false }));
  const source = '+++\ntitle = "old"\ncustom = "keep"\n+++\n\nhello';
  const parsed = parseDocument(documentInput({ title: '新标题', body: '新正文', draft: false, date: '' }, source));
  assert.equal(parsed.format, 'toml'); assert.equal(parsed.metadata.custom, 'keep'); assert.equal(parsed.metadata.title, '新标题');
});
test('large and malformed uploads are rejected', () => {
  assert.throws(() => decodeBase64('not valid%'));
  assert.throws(() => decodeBase64('='.repeat(4)));
  assert.throws(() => decodeBase64('A'.repeat(Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 + 12)));
  assert.equal(decodeBase64(btoa('hello')).length, 5);
});
test('draft content is retained in the admin listing', async () => {
  const { admin } = await setup(undefined, { 'content/games/a.md': '---\ntitle: 草稿\ndraft: true\n---\n\n正文' });
  const state = await admin.state(); assert.equal(state.documents.find(doc => doc.title === '草稿').draft, true);
});
test('publication status corresponds to the saved commit', async () => {
  const { admin, fake } = await setup();
  const result = await admin.deployment(fake.head); assert.equal(result.conclusion, 'success');
});
