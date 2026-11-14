import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { groups, regularDirectory, scanPhotos, sha256 } from './photos.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hashes = data => Object.fromEntries(data.files.map(f => [f.path, f.sha256]));
export const directoryMigration = { '07-mini-bar': '08-mini-bar', '08-gift': '09-gift', '09-dog': '11-dog' };
const configuration = groups.map(({ id, directory, optional }) => ({ id, directory, optional: Boolean(optional) }));
function durableJson(file, value) {
  const tmp = file + '.tmp', fd = fs.openSync(tmp, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function destinationInventory(root, legacy = false) {
  regularDirectory(root);
  const result = {};
  for (const directory of [...groups.map(g => g.directory), ...(legacy ? Object.keys(directoryMigration) : [])]) {
    const dir = path.join(root, directory);
    if (!fs.existsSync(dir)) continue;
    regularDirectory(dir);
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('DESTINATION_UNKNOWN_ENTRY: ' + file);
      if (name === '.gitkeep' && stat.size === 0) continue;
      result[directory + '/' + name] = sha256(fs.readFileSync(file));
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
function managedFile(root, relative, legacy = false) {
  const directories = [...groups.map(g => g.directory), ...(legacy ? Object.keys(directoryMigration) : [])];
  if (!directories.includes(relative.split('/')[0]) || relative.split('/').length !== 2) throw Error('UNMANAGED_PATH: ' + relative);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) throw Error('PATH_ESCAPE: ' + relative);
  regularDirectory(path.dirname(file));
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) throw Error('UNSAFE_FILE: ' + relative);
  return file;
}
export function syncPhotos({ source, destination, stateDirectory, beforeApply, migrateDirectories = false }) {
  source = fs.realpathSync(source);
  regularDirectory(destination);
  destination = fs.realpathSync(destination);
  stateDirectory = path.resolve(stateDirectory);
  if (source === destination) return { changed: false, data: scanPhotos(source), mode: 'DIRECT_PROJECT' };
  if (stateDirectory === destination || stateDirectory.startsWith(destination + path.sep) || stateDirectory === source || stateDirectory.startsWith(source + path.sep)) throw Error('STATE_MUST_BE_OUTSIDE_PUBLIC_PHOTOS');
  regularDirectory(destination);
  fs.mkdirSync(stateDirectory, { recursive: true });
  const lock = path.join(stateDirectory, 'sync.lock');
  const fd = fs.openSync(lock, 'wx');
  let transaction;
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, source, destination })); fs.fsyncSync(fd);
    const statePath = path.join(stateDirectory, 'state.json');
    const pendingPath = path.join(stateDirectory, 'pending.json');
    if (fs.existsSync(pendingPath)) throw Error('INCOMPLETE_SYNC_REQUIRES_REVIEW: ' + pendingPath);
    // Validate the complete source before deciding that any destination file was removed.
    const data = scanPhotos(source), next = hashes(data), current = destinationInventory(destination, migrateDirectories);
    const previous = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
    if (previous && (previous.source !== source || previous.destination !== destination)) throw Error('SYNC_IDENTITY_MISMATCH');
    if (migrateDirectories) {
      if (previous?.version !== 1) throw Error('MIGRATION_REQUIRES_EXISTING_V1_STATE');
      const legacyDirectories = groups.filter(g => !['family', 'summer-pools'].includes(g.id))
        .map(g => Object.entries(directoryMigration).find(([, next]) => next === g.directory)?.[0] ?? g.directory);
      if (Object.keys(previous.files).some(file => !legacyDirectories.includes(file.split('/')[0]))) throw Error('UNKNOWN_LEGACY_STATE');
      // Directory migration must not silently replace a renamed photo with different content.
      for (const [file, hash] of Object.entries(previous.files)) {
        const [directory, name] = file.split('/');
        if (directoryMigration[directory] && next[directoryMigration[directory] + '/' + name] !== hash) throw Error('RENAMED_SOURCE_CONFLICT: ' + file);
      }
    } else {
      if (previous?.version === 1 || Object.keys(directoryMigration).some(d => fs.existsSync(path.join(destination, d)))) throw Error('DIRECTORY_MIGRATION_REQUIRED');
      if (previous && (previous.version !== 2 || !same(previous.configuration, configuration))) throw Error('SYNC_CONFIGURATION_MISMATCH');
    }
    const populatedOptionalDirectories = [...new Set([...(previous?.populatedOptionalDirectories ?? []), ...groups.filter(g => g.optional && data.albums[g.id].images.length).map(g => g.directory)])].sort();
    if (data.absentOptionalDirectories.some(d => populatedOptionalDirectories.includes(d))) throw Error('PREVIOUSLY_POPULATED_SOURCE_MISSING: ' + data.absentOptionalDirectories.join(', '));
    if (!previous) {
      durableJson(path.join(stateDirectory, 'initial-' + crypto.randomUUID() + '.json'), { source, destination, sourceFiles: next, destinationFiles: current });
      for (const [file, hash] of Object.entries(current)) {
        if (next[file] !== hash) throw Error('FIRST_SYNC_DESTINATION_CONFLICT: ' + file);
      }
    } else if (!same(current, previous.files)) throw Error('DESTINATION_EDIT_CONFLICT: worktree changed since last sync; no overwrite');
    const writes = Object.keys(next).filter(file => next[file] !== current[file]);
    const removes = Object.keys(current).filter(file => !(file in next));
    if (previous && !migrateDirectories && !writes.length && !removes.length) return { changed: false, data, mode: 'SYNCED' };
    const transactionDir = path.join(stateDirectory, 'transactions', crypto.randomUUID());
    fs.mkdirSync(transactionDir, { recursive: true });
    transaction = { source, destination, before: current, after: next, writes, removes, transactionDir, createdAt: new Date().toISOString(), migration: migrateDirectories ? directoryMigration : null };
    if (previous) durableJson(path.join(transactionDir, 'previous-state.json'), previous);
    // Back up only managed files; stage all copies before touching the destination.
    for (const file of new Set([...writes, ...removes])) {
      if (current[file]) { const backup = path.join(transactionDir, 'before', file); fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.copyFileSync(managedFile(destination, file, migrateDirectories), backup, fs.constants.COPYFILE_EXCL); }
      if (next[file]) { const staged = path.join(transactionDir, 'after', file); fs.mkdirSync(path.dirname(staged), { recursive: true }); fs.copyFileSync(path.join(source, file), staged, fs.constants.COPYFILE_EXCL); if (sha256(fs.readFileSync(staged)) !== next[file]) throw Error('SOURCE_CHANGED_DURING_STAGE: ' + file); }
    }
    if (!same(scanPhotos(source), data) || !same(destinationInventory(destination, migrateDirectories), current)) throw Error('FILES_CHANGED_DURING_SYNC');
    durableJson(pendingPath, transaction);
    beforeApply?.();
    for (const group of groups) {
      const dir = path.join(destination, group.directory);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      regularDirectory(dir);
      if (!fs.existsSync(path.join(dir, '.gitkeep'))) fs.writeFileSync(path.join(dir, '.gitkeep'), '', { flag: 'wx' });
    }
    for (const file of writes) {
      const target = managedFile(destination, file), temp = target + '.sync-' + crypto.randomUUID() + '.tmp';
      fs.copyFileSync(path.join(transactionDir, 'after', file), temp, fs.constants.COPYFILE_EXCL);
      const handle = fs.openSync(temp, 'r+'); try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
      fs.renameSync(temp, target);
    }
    // Verify every newly copied byte before removing any legacy location.
    for (const file of writes) if (sha256(fs.readFileSync(managedFile(destination, file))) !== next[file]) throw Error('COPIED_FILE_HASH_MISMATCH: ' + file);
    for (const file of removes) {
      const target = managedFile(destination, file, migrateDirectories);
      if (sha256(fs.readFileSync(target)) !== current[file]) throw Error('DESTINATION_CHANGED_BEFORE_REMOVE: ' + file);
      fs.unlinkSync(target);
    }
    if (migrateDirectories) for (const directory of Object.keys(directoryMigration)) {
      const dir = path.resolve(destination, directory);
      if (path.dirname(dir) !== destination) throw Error('LEGACY_DIRECTORY_ESCAPE');
      if (!fs.existsSync(dir)) continue;
      regularDirectory(dir);
      const entries = fs.readdirSync(dir);
      if (entries.some(name => name !== '.gitkeep')) throw Error('LEGACY_DIRECTORY_NOT_EMPTY: ' + directory);
      if (entries.includes('.gitkeep')) {
        const keep = managedFile(destination, directory + '/.gitkeep', true);
        if (fs.statSync(keep).size !== 0) throw Error('LEGACY_PLACEHOLDER_CHANGED');
        const backup = path.join(transactionDir, 'before', directory, '.gitkeep');
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(keep, backup, fs.constants.COPYFILE_EXCL);
        fs.unlinkSync(keep);
      }
      fs.rmdirSync(dir);
    }
    if (!same(hashes(scanPhotos(destination)), next)) throw Error('POST_SYNC_HASH_MISMATCH');
    durableJson(statePath, { version: 2, configuration, source, destination, files: next, populatedOptionalDirectories, updatedAt: new Date().toISOString() });
    durableJson(path.join(transactionDir, 'result.json'), { ...transaction, status: 'VERIFIED', ignoredSourceFiles: data.ignored });
    fs.unlinkSync(pendingPath);
    return { changed: true, data, writes, removes, transactionDir, mode: 'SYNCED' };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
