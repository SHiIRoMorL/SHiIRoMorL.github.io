import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryAdmin } from '../src/admin-service.mjs';
import { encodeBase64, managedImagePath, parseLibrary, serializeLibrary, writablePath } from '../src/content.mjs';
import { imageInput } from '../src/site-settings.mjs';
import { FakeGitHub } from './fake-github.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
const config = { REPO_OWNER: 'SHiIRoMorL', REPO_NAME: 'SHiIRoMorL.github.io', REPO_BRANCH: 'main', OWNER_ID: '268295554', SITE_DEFAULTS: { owner: '原昵称', signature: '原签名', avatar: 'img/avatar.png' } };
const original = {
  home: { subtitle: '欢迎', image: '', extra: 'keep' },
  portals: ['files', 'bookmarks', 'tools', 'notes'].map(key => ({ key, page: '/' + key, title: key, description: '栏目说明', icon: 'folder', image: '' })),
  collections: { files: { items: [{ title: '附件', url: '/files/keep.txt' }] }, bookmarks: { items: [{ title: '链接', url: 'https://example.com' }] }, tools: { items: [] } }
};
async function setup(library = original, extra = {}) {
  const fake = new FakeGitHub({ 'data/library.toml': serializeLibrary(library), 'assets/img/avatar.png': bytes, 'static/files/keep.txt': '资料', ...extra });
  const admin = new LibraryAdmin(config, 'github_pat_fake_test', fake.fetch);
  await admin.authenticate(); return { fake, admin };
}
const input = fake => ({ owner: '新的昵称', signature: '个人签名', homeSubtitle: '你好，访客。', images: [], revision: fake.head });
const upload = slot => ({ slot, action: 'upload', name: '封面.png', contentBase64: png });
const libraryOf = fake => parseLibrary(new TextDecoder().decode(fake.files()['data/library.toml']));

test('settings inherit original profile and preview original asset bytes', async () => {
  const { admin } = await setup(); const state = await admin.state();
  assert.equal(state.site.owner, '原昵称'); assert.equal(state.site.signature, '原签名');
  assert.equal(state.site.images.length, 6);
  const avatar = state.site.images.find(item => item.slot === 'avatar');
  assert.deepEqual(await admin.previewImage(avatar.sha), bytes);
});

test('profile edits preserve collections, portal metadata and unrelated settings', async () => {
  const { admin, fake } = await setup();
  await admin.saveSiteSettings({ ...input(fake), signature: '' });
  const updated = libraryOf(fake);
  assert.deepEqual({ ...updated.profile }, { owner: '新的昵称', signature: '' });
  assert.equal(updated.home.subtitle, '你好，访客。'); assert.equal(updated.home.extra, 'keep');
  const expected = parseLibrary(serializeLibrary(original));
  assert.deepEqual(updated.collections, expected.collections); assert.deepEqual(updated.portals, expected.portals);
  assert.equal((await admin.state()).site.signature, '');
  assert.equal(fake.lastTreeChanges.length, 1);
});

test('all six image slots and profile publish together in one atomic commit', async () => {
  const { admin, fake } = await setup();
  await admin.saveSiteSettings({ ...input(fake), images: ['avatar', 'home', 'files', 'bookmarks', 'tools', 'notes'].map(upload) });
  const updated = libraryOf(fake);
  const refs = [updated.profile.avatar, updated.home.image, ...updated.portals.map(p => p.image)];
  assert.equal(new Set(refs).size, 6);
  for (const ref of refs) { managedImagePath('static/' + ref); assert.deepEqual(fake.files()['static/' + ref], bytes); }
  assert.equal(fake.lastTreeChanges.length, 7); assert.equal(fake.lastRef.force, false);
  const state = await admin.state();
  assert.equal(state.site.images.every(i => Boolean(i.sha)), true);
  assert.equal(state.files.length, 1, 'site images are not added to the file cabinet');
});

test('replacement uses a fresh URL and removes only unused managed images', async () => {
  const { admin, fake } = await setup();
  await admin.saveSiteSettings({ ...input(fake), images: [upload('home')] });
  const old = libraryOf(fake).home.image;
  await admin.saveSiteSettings({ ...input(fake), images: [upload('home')] });
  const fresh = libraryOf(fake).home.image;
  assert.notEqual(fresh, old); assert.equal(fake.files()['static/' + old], undefined);
  assert.deepEqual(fake.files()['static/' + fresh], bytes);
  assert.ok(fake.files()['assets/img/avatar.png']); assert.ok(fake.files()['static/files/keep.txt']);
});

test('an image still used by another card is preserved', async () => {
  const shared = 'images/site/12345678-1234-4123-8123-123456789abc.png';
  const library = structuredClone(original); library.home.image = shared; library.portals[0].image = '/' + shared;
  const { admin, fake } = await setup(library, { ['static/' + shared]: bytes });
  await admin.saveSiteSettings({ ...input(fake), images: [upload('home')] });
  assert.deepEqual(fake.files()['static/' + shared], bytes);
});

test('reset restores the original avatar and cover placeholders', async () => {
  const { admin, fake } = await setup();
  await admin.saveSiteSettings({ ...input(fake), images: [upload('avatar'), upload('home'), upload('files')] });
  await admin.saveSiteSettings({ ...input(fake), images: ['avatar', 'home', 'files'].map(slot => ({ slot, action: 'reset' })) });
  const state = await admin.state();
  assert.equal(state.site.images[0].image, 'img/avatar.png');
  assert.equal(libraryOf(fake).home.image, ''); assert.equal(libraryOf(fake).portals[0].image, '');
  assert.equal(Object.keys(fake.files()).filter(path => path.startsWith('static/images/site/')).length, 0);
});

test('legacy cover files outside the managed directory are never deleted', async () => {
  const library = structuredClone(original); library.home.image = '/files/legacy.png';
  const { admin, fake } = await setup(library, { 'static/files/legacy.png': bytes });
  await admin.saveSiteSettings({ ...input(fake), images: [upload('home')] });
  assert.deepEqual(fake.files()['static/files/legacy.png'], bytes);
});

test('stale settings revision never uploads bytes or overwrites newer content', async () => {
  const { admin, fake } = await setup();
  await assert.rejects(admin.saveSiteSettings({ ...input(fake), revision: '2'.repeat(40), images: [upload('home')] }), e => e.code === 'conflict');
  assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
});

test('invalid slots, duplicate slots and malicious images fail before writing', async () => {
  const { admin, fake } = await setup();
  for (const images of [[upload('workflow')], [upload('home'), upload('home')], [{ ...upload('home'), contentBase64: btoa('<html>bad</html>') }], [{ ...upload('home'), contentBase64: btoa('<svg></svg>') }], [{ ...upload('home'), name: '../image.png' }], [{ ...upload('home'), name: 'active.svg' }]]) {
    await assert.rejects(admin.saveSiteSettings({ ...input(fake), images }), e => e.status === 400);
  }
  assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
});

test('oversized images, blank nickname and oversized signature are rejected', async () => {
  const { admin, fake } = await setup();
  const large = encodeBase64(new Uint8Array(8 * 1024 * 1024 + 1));
  await assert.rejects(admin.saveSiteSettings({ ...input(fake), images: [{ ...upload('avatar'), contentBase64: large }] }), e => [400, 413].includes(e.status));
  await assert.rejects(admin.saveSiteSettings({ ...input(fake), owner: ' ' }), e => e.status === 400);
  await assert.rejects(admin.saveSiteSettings({ ...input(fake), signature: 'a'.repeat(301) }), e => e.status === 400);
  assert.equal(fake.calls.some(call => call.method !== 'GET'), false);
});

test('managed image allowlist cannot reach other static files or executable paths', () => {
  const valid = 'static/images/site/12345678-1234-4123-8123-123456789abc.png';
  assert.equal(writablePath(valid), valid);
  for (const path of ['static/admin/index.html', valid.replace('.png', '.js'), 'static/images/site/../../admin/config.json', 'static/images/site/user.png', 'static/images/site/12345678-1234-4123-8123-123456789abc.svg']) assert.throws(() => writablePath(path), e => e.status === 400);
});

test('image validation accepts supported headers and saves the real image format', () => {
  assert.equal(imageInput({ name: 'image.png', contentBase64: png }).mime, 'image/png');
  const samples = [['image.jpg', [255, 216, 255, 224]], ['image.gif', [...new TextEncoder().encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0]], ['image.webp', [...new TextEncoder().encode('RIFF0000WEBPVP8 '), 0, 0, 0, 0]]];
  for (const [name, data] of samples) assert.ok(imageInput({ name, contentBase64: encodeBase64(Uint8Array.from(data)) }));
  assert.equal(imageInput({ name: 'download.jpg', contentBase64: png }).extension, 'png');
  assert.throws(() => imageInput({ name: 'file.pdf', contentBase64: png }), e => e.code === 'invalid_image');
});

test('unconnected admin cannot edit profile or read image blobs', async () => {
  const fake = new FakeGitHub({}); const admin = new LibraryAdmin(config, 'github_pat_test', fake.fetch);
  await assert.rejects(admin.saveSiteSettings({}), e => e.status === 401);
  await assert.rejects(admin.previewImage('1'.repeat(40)), e => e.status === 401);
  assert.equal(fake.calls.length, 0);
});
