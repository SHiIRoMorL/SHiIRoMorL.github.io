import { HttpError } from './auth.mjs';
import { decodeBase64, filename, text } from './content.mjs';

export const IMAGE_SLOTS = ['avatar', 'home', 'files', 'bookmarks', 'tools', 'notes'];
const labels = { avatar: '头像', home: '首页主图', files: '文件柜封面', bookmarks: '收藏夹封面', tools: '小工具封面', notes: '随手记封面' };

// 检查文件类型与文件头，以真实格式保存（部分下载图片的扩展名不准确）。
export function imageInput(input) {
  const namedExtension = filename(input.name).split('.').at(-1).toLowerCase();
  const bytes = decodeBase64(input.contentBase64);
  const ascii = (offset, value) => [...value].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  const png = bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((c, i) => bytes[i] === c) && ascii(12, 'IHDR');
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const gif = bytes.length >= 13 && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'));
  const webp = bytes.length >= 20 && ascii(0, 'RIFF') && ascii(8, 'WEBP') && ['VP8 ', 'VP8L', 'VP8X'].some(value => ascii(12, value));
  if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(namedExtension) || !(png || jpeg || gif || webp)) throw new HttpError(400, '请选择有效的 PNG、JPG、WebP 或 GIF 图片。', 'invalid_image');
  const extension = png ? 'png' : jpeg ? 'jpg' : gif ? 'gif' : 'webp';
  return { extension, bytes, mime: extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}` };
}

export function imageReference(library, slot, defaults = {}) {
  if (slot === 'avatar') return library.profile?.avatar || defaults.avatar || '';
  if (slot === 'home') return library.home.image || '';
  return library.portals.find(item => item.key === slot)?.image || '';
}

export function setImageReference(library, slot, value) {
  if (slot === 'avatar') library.profile.avatar = value;
  else if (slot === 'home') library.home.image = value;
  else {
    const portal = library.portals.find(item => item.key === slot);
    if (!portal) throw new HttpError(400, '这个首页栏目已经不存在，请刷新资料。');
    portal.image = value;
  }
}

export function imageReferences(library) {
  return [library.profile?.avatar, library.home.image, ...library.portals.map(item => item.image)].filter(Boolean).map(value => 'static/' + value.replace(/^\//, ''));
}

export function siteSettings(snapshot, defaults = {}) {
  const library = snapshot.library;
  return {
    owner: library.profile?.owner ?? defaults.owner ?? '',
    signature: library.profile?.signature ?? defaults.signature ?? '',
    homeSubtitle: library.home.subtitle || '',
    images: IMAGE_SLOTS.filter(slot => ['avatar', 'home'].includes(slot) || library.portals.some(item => item.key === slot)).map(slot => {
      const image = imageReference(library, slot, defaults);
      const path = image.replace(/^\//, '');
      const blob = snapshot.blobs.get(`static/${path}`) || snapshot.blobs.get(`assets/${path}`);
      return { slot, label: labels[slot], image, sha: blob?.sha || null, avatar: slot === 'avatar' };
    })
  };
}

export function settingsInput(input) {
  const owner = text(input.owner, '昵称', 80, true);
  const signature = text(input.signature, '个人签名', 300);
  const homeSubtitle = text(input.homeSubtitle, '首页短句', 300);
  if (!Array.isArray(input.images) || input.images.length > IMAGE_SLOTS.length) throw new HttpError(400, '图片设置格式不正确。');
  const seen = new Set();
  const images = input.images.map(item => {
    if (!item || !IMAGE_SLOTS.includes(item.slot) || seen.has(item.slot) || !['upload', 'reset'].includes(item.action)) throw new HttpError(400, '图片位置或操作不正确。');
    seen.add(item.slot);
    return item.action === 'reset' ? { slot: item.slot, action: 'reset' } : { slot: item.slot, action: 'upload', contentBase64: item.contentBase64, ...imageInput(item) };
  });
  return { owner, signature, homeSubtitle, images };
}
