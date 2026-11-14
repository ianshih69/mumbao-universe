import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Only classification and presentation rules live here. Photo lists come from disk.
export const groups = [
  { directory: '00-cover', id: 'cover', title: '館內設施', displayCount: 1, layout: 'landscape' },
  { directory: '01-brand', id: 'brand-original', title: '台灣原創 IP 主題空間', displayCount: 2, layout: 'pairLead' },
  { directory: '02-zodiac', id: 'zodiac-space', title: '✨ 沉浸式十二星座空間', displayCount: 3, layout: 'triple' },
  { directory: '03-afternoon-tea', id: 'afternoon-tea', title: '☕ 慢靈魂迎賓下午茶', displayCount: 2, layout: 'pair' },
  { directory: '04-ktv', id: 'living-ktv', title: '🎤 極致歡唱 KTV', displayCount: 1, layout: 'landscape' },
  { directory: '05-mahjong', id: 'mahjong', title: '🀄 沉浸式麻將房', displayCount: 2, layout: 'pairLead' },
  { directory: '06-dining', id: 'dining', title: '🍳 美拉德中古奶油餐廚', displayCount: 3, layout: 'triple' },
  { directory: '07-child', id: 'family', title: '👶 親子與長輩的溫柔降落', displayCount: 2, layout: 'pairLead' },
  { directory: '08-mini-bar', id: 'mini-bar', title: '🛸 登陸限定！星際旅客火箭筒 Mini 吧', displayCount: 1, layout: 'portrait' },
  { directory: '09-gift', id: 'collectors-gift', title: '🎁 宇宙的雙向奔赴｜專屬藏家禮', displayCount: 1, layout: 'portrait' },
  { directory: '10-swim', id: 'summer-pools', title: '💦 慢寶夏日水上藝術雙池', displayCount: 3, layout: 'triple', optional: true },
  { directory: '11-dog', id: 'pets', title: '🐾 頂級寵物友善', displayCount: 2, layout: 'pairLead' },
];
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function regularDirectory(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('UNSAFE_DIRECTORY: ' + directory);
}
export function numericSequence(filename) {
  if (path.extname(filename) !== '.webp') throw Error('UNSUPPORTED_FORMAT: ' + filename + ' (use lowercase .webp)');
  const numbers = path.basename(filename, '.webp').match(/\d+/g) ?? [];
  if (numbers.length !== 1) throw Error('AMBIGUOUS_OR_MISSING_SEQUENCE: ' + filename);
  return BigInt(numbers[0]);
}
export function webpDimensions(bytes, filename) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) throw Error('INVALID_WEBP: ' + filename);
  let dimensions;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > bytes.length) throw Error('TRUNCATED_WEBP: ' + filename);
    if (type === 'VP8X' && size >= 10) dimensions = [1 + bytes.readUIntLE(start + 4, 3), 1 + bytes.readUIntLE(start + 7, 3)];
    else if (!dimensions && type === 'VP8 ' && size >= 10 && bytes.toString('hex', start + 3, start + 6) === '9d012a') dimensions = [bytes.readUInt16LE(start + 6) & 16383, bytes.readUInt16LE(start + 8) & 16383];
    else if (!dimensions && type === 'VP8L' && size >= 5 && bytes[start] === 0x2f) { const value = bytes.readUInt32LE(start + 1); dimensions = [(value & 16383) + 1, ((value >>> 14) & 16383) + 1]; }
    offset = start + size + size % 2;
  }
  if (!dimensions || dimensions.some(value => value < 1)) throw Error('INVALID_WEBP_DIMENSIONS: ' + filename);
  return { width: dimensions[0], height: dimensions[1] };
}
function windowsHidden(root, presentGroups) {
  if (process.platform !== 'win32') return new Set();
  const literals = presentGroups.map(g => "'" + path.join(root, g.directory).replaceAll("'", "''") + "'").join(',');
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $items=@(Get-ChildItem -LiteralPath @(${literals}) -Force -Attributes Hidden | ForEach-Object { $_.FullName }); ConvertTo-Json -InputObject $items -Compress`;
  return new Set(JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true })).map(p => path.resolve(p).toLowerCase()));
}
export function scanPhotos(root) {
  root = path.resolve(root);
  regularDirectory(root);
  const names = fs.readdirSync(root);
  const absentOptionalDirectories = [];
  for (const group of groups) {
    if (!names.includes(group.directory)) {
      if (!group.optional || names.some(name => name.toLowerCase() === group.directory.toLowerCase())) throw Error('MISSING_EXACT_DIRECTORY: ' + group.directory);
      absentOptionalDirectories.push(group.directory);
      continue;
    }
    regularDirectory(path.join(root, group.directory));
  }
  const hidden = windowsHidden(root, groups.filter(g => !absentOptionalDirectories.includes(g.directory))), ignored = [], files = [], albums = {};
  let cover;
  for (const group of groups) {
    const seen = new Map(), images = [];
    for (const name of absentOptionalDirectories.includes(group.directory) ? [] : fs.readdirSync(path.join(root, group.directory))) {
      const file = path.join(root, group.directory, name), relative = group.directory + '/' + name;
      if (name.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(name) || /(?:\.tmp|\.part|\.bak|~)$/i.test(name) || hidden.has(path.resolve(file).toLowerCase())) { ignored.push(relative); continue; }
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('UNSUPPORTED_ENTRY: ' + relative);
      const sequence = numericSequence(name);
      if (seen.has(sequence.toString())) throw Error('DUPLICATE_SEQUENCE: ' + group.directory + ': ' + seen.get(sequence.toString()) + ', ' + name);
      seen.set(sequence.toString(), name);
      const bytes = fs.readFileSync(file), hash = sha256(bytes), dimensions = webpDimensions(bytes, relative);
      images.push({ id: relative, filename: name, sequence: sequence.toString(), sha256: hash, src: '/images/public/' + group.directory + '/' + encodeURIComponent(name) + '?v=' + hash, alt: group.title + '照片 ' + sequence, ...dimensions });
      files.push({ path: relative, sha256: hash, bytes: bytes.length });
    }
    images.sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
    if (group.id === 'cover') {
      if (images.length !== 1) throw Error('COVER_COUNT: expected 1, found ' + images.length);
      cover = images[0];
    } else albums[group.id] = { ...group, images };
  }
  const byHash = new Map();
  for (const file of files) byHash.set(file.sha256, [...(byHash.get(file.sha256) ?? []), file]);
  const duplicates = [...byHash.values()].filter(list => list.length > 1).map(list => list.map(f => f.path));
  return { version: 'facilities-folder-photos-2', cover, albums, ignored, duplicates, absentOptionalDirectories, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}
