import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { groups, numericSequence, scanPhotos, sha256 } from './photos.mjs';
import { syncPhotos, directoryMigration } from './sync.mjs';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const assetRoot=path.join(repo,'client/public/images/public');
const sample=dir=>fs.readFileSync(path.join(assetRoot,dir,fs.readdirSync(path.join(assetRoot,dir)).find(n=>n.endsWith('.webp'))));
const bytes=sample('00-cover'), different=sample('01-brand');
const roots=[];
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'facilities-photos-test-'));roots.push(root);
 const source=path.join(root,'source'),destination=path.join(root,'destination'),stateDirectory=path.join(root,'state');
 fs.mkdirSync(source);fs.mkdirSync(destination);
 for(const g of groups)fs.mkdirSync(path.join(source,g.directory));
 fs.writeFileSync(path.join(source,'00-cover/010.webp'),bytes);
 return {root,source,destination,stateDirectory};
}
function put(f,relative,content=bytes){fs.writeFileSync(path.join(f.source,relative),content);}
afterEach(()=>{for(const root of roots.splice(0)){const absolute=fs.realpathSync(root);assert.equal(path.dirname(absolute),fs.realpathSync(os.tmpdir()));assert(path.basename(absolute).startsWith('facilities-photos-test-'));fs.rmSync(absolute,{recursive:true});}});
test('numeric and owner-approved prefixed names sort by numeric value, including inserted gaps',()=>{
 const f=fixture();for(const name of ['20.webp','1.webp','015.webp','02.webp','brand-100.webp'])put(f,'01-brand/'+name);
 assert.deepEqual(scanPhotos(f.source).albums['brand-original'].images.map(p=>p.filename),['1.webp','02.webp','015.webp','20.webp','brand-100.webp']);
 assert.equal(numericSequence('afternoon-tea-3.webp'),3n);
 assert.throws(()=>numericSequence('no-number.webp'),/MISSING_SEQUENCE/);
 assert.throws(()=>numericSequence('2026-photo-1.webp'),/AMBIGUOUS/);
});
test('duplicate numeric sequences fail rather than arbitrary ties',()=>{
 const f=fixture();put(f,'01-brand/010.webp');put(f,'01-brand/brand-10.webp');assert.throws(()=>scanPhotos(f.source),/DUPLICATE_SEQUENCE/);
});
test('cover must be present, unique and decodable; ignored files never become photos',()=>{
 const f=fixture();put(f,'01-brand/.hidden.webp');put(f,'01-brand/Thumbs.db');put(f,'01-brand/desktop.ini');put(f,'01-brand/020.webp.tmp');
 assert.equal(scanPhotos(f.source).albums['brand-original'].images.length,0);
 fs.unlinkSync(path.join(f.source,'00-cover/010.webp'));assert.throws(()=>scanPhotos(f.source),/COVER_COUNT/);
 put(f,'00-cover/010.webp');put(f,'00-cover/020.webp');assert.throws(()=>scanPhotos(f.source),/COVER_COUNT/);
 fs.unlinkSync(path.join(f.source,'00-cover/020.webp'));put(f,'01-brand/1.webp',Buffer.from('broken'));assert.throws(()=>scanPhotos(f.source),/INVALID_WEBP/);
});
test('unsupported format and nonnumeric visible files are reported, not silently skipped',()=>{
 const f=fixture();put(f,'01-brand/010.jpg');assert.throws(()=>scanPhotos(f.source),/UNSUPPORTED_FORMAT/);
 fs.unlinkSync(path.join(f.source,'01-brand/010.jpg'));put(f,'01-brand/art.webp');assert.throws(()=>scanPhotos(f.source),/MISSING_SEQUENCE/);
});
test('Windows hidden attributes are ignored even on otherwise valid filenames',{skip:process.platform!=='win32'},()=>{
 const f=fixture();put(f,'01-brand/010.webp');execFileSync('attrib',['+H',path.join(f.source,'01-brand/010.webp')]);
 const data=scanPhotos(f.source);assert.equal(data.albums['brand-original'].images.length,0);assert(data.ignored.includes('01-brand/010.webp'));
});
test('running in the owner checkout reads directly without synchronizing into itself',()=>{
 const f=fixture();const result=syncPhotos({...f,destination:f.source});assert.equal(result.mode,'DIRECT_PROJECT');assert.equal(result.changed,false);assert(!fs.existsSync(f.stateDirectory));
});
test('sync creates auditable inventory, preserves bytes, then follows add/rename/overwrite/remove',()=>{
 const f=fixture();put(f,'11-dog/dog-1.webp');put(f,'08-mini-bar/010.webp');
 const initial=syncPhotos(f);assert(initial.changed);assert.equal(initial.data.files.length,3);
 assert(fs.readdirSync(f.stateDirectory).some(n=>n.startsWith('initial-')));
 assert.equal(sha256(fs.readFileSync(path.join(f.destination,'11-dog/dog-1.webp'))),sha256(bytes));
 const oldUrl=initial.data.albums.pets.images[0].src;
 put(f,'11-dog/dog-1.webp',different);put(f,'11-dog/dog-2.webp');put(f,'08-mini-bar/020.webp');
 const changed=syncPhotos(f);assert.equal(changed.data.albums.pets.images.length,2);assert.equal(changed.data.albums['mini-bar'].images.length,2);assert.notEqual(changed.data.albums.pets.images[0].src,oldUrl);
 assert.equal(sha256(fs.readFileSync(path.join(f.destination,'11-dog/dog-1.webp'))),sha256(different));
 fs.renameSync(path.join(f.source,'11-dog/dog-2.webp'),path.join(f.source,'11-dog/dog-0.webp'));
 assert.equal(syncPhotos(f).data.albums.pets.images[0].filename,'dog-0.webp');assert(!fs.existsSync(path.join(f.destination,'11-dog/dog-2.webp')));
 for(const name of ['dog-0.webp','dog-1.webp'])fs.unlinkSync(path.join(f.source,'11-dog',name));
 assert.equal(syncPhotos(f).data.albums.pets.images.length,0);assert.equal(syncPhotos(f).changed,false);
 assert(fs.readdirSync(path.join(f.destination,'11-dog')).every(n=>n==='.gitkeep'));
});
test('missing or invalid source never becomes a deletion signal',()=>{
 const f=fixture();put(f,'01-brand/010.webp');syncPhotos(f);
 fs.renameSync(path.join(f.source,'01-brand'),path.join(f.source,'missing'));
 assert.throws(()=>syncPhotos(f),/MISSING_EXACT_DIRECTORY/);assert(fs.existsSync(path.join(f.destination,'01-brand/010.webp')));
 assert.throws(()=>syncPhotos({...f,source:path.join(f.root,'absent')}));
});
test('first-sync unknown destination and subsequent worktree changes block without overwrite',()=>{
 const f=fixture();fs.mkdirSync(path.join(f.destination,'01-brand'));fs.writeFileSync(path.join(f.destination,'01-brand/999.webp'),different);
 assert.throws(()=>syncPhotos(f),/FIRST_SYNC_DESTINATION_CONFLICT/);assert.equal(sha256(fs.readFileSync(path.join(f.destination,'01-brand/999.webp'))),sha256(different));
 fs.unlinkSync(path.join(f.destination,'01-brand/999.webp'));put(f,'01-brand/010.webp');syncPhotos(f);
 fs.writeFileSync(path.join(f.destination,'01-brand/010.webp'),different);
 assert.throws(()=>syncPhotos(f),/DESTINATION_EDIT_CONFLICT/);assert.equal(sha256(fs.readFileSync(path.join(f.destination,'01-brand/010.webp'))),sha256(different));
});
test('partial transactions and concurrent locks fail closed',()=>{
 const f=fixture();put(f,'01-brand/010.webp');syncPhotos(f);put(f,'01-brand/020.webp');
 assert.throws(()=>syncPhotos({...f,beforeApply(){throw Error('SYNTHETIC_IO_FAILURE');}}),/SYNTHETIC_IO_FAILURE/);
 assert(!fs.existsSync(path.join(f.destination,'01-brand/020.webp')));assert(fs.existsSync(path.join(f.stateDirectory,'pending.json')));
 assert.throws(()=>syncPhotos(f),/INCOMPLETE_SYNC_REQUIRES_REVIEW/);
 const other=fixture();fs.mkdirSync(other.stateDirectory);fs.writeFileSync(path.join(other.stateDirectory,'sync.lock'),'synthetic');assert.throws(()=>syncPhotos(other),/EEXIST/);
});
test('root old photos are ignored and cover is not silently deduplicated from an album',()=>{
 const f=fixture();fs.writeFileSync(path.join(f.source,'pub-00.webp'),different);put(f,'02-zodiac/010.webp');
 const result=scanPhotos(f.source);assert.equal(result.files.length,2);assert.equal(result.duplicates.length,1);
 syncPhotos(f);assert(!fs.existsSync(path.join(f.destination,'pub-00.webp')));
});
test('twelve semantic categories include optional swim, with placeholders excluded',()=>{
 const f=fixture(); assert.equal(groups.length,12);
 fs.rmdirSync(path.join(f.source,'10-swim'));
 const data=scanPhotos(f.source);
 assert.equal(data.albums['summer-pools'].images.length,0);
 assert.deepEqual(data.absentOptionalDirectories,['10-swim']);
 syncPhotos(f); assert(fs.existsSync(path.join(f.destination,'10-swim/.gitkeep')));
 fs.mkdirSync(path.join(f.source,'10-swim'));put(f,'10-swim/.gitkeep',Buffer.alloc(0));
 assert.equal(scanPhotos(f.source).albums['summer-pools'].images.length,0);
});
test('child and swim follow zero, one, many, numeric reorder, overwrite and explicit deletion',()=>{
 const f=fixture();syncPhotos(f);
 for(const [directory,id] of [['07-child','family'],['10-swim','summer-pools']]){
  put(f,directory+'/photo-2.webp');assert.equal(syncPhotos(f).data.albums[id].images.length,1);
  put(f,directory+'/photo-10.webp');put(f,directory+'/photo-1.webp');
  let album=syncPhotos(f).data.albums[id];assert.deepEqual(album.images.map(p=>p.sequence),['1','2','10']);
  const url=album.images[0].src;put(f,directory+'/photo-1.webp',different);
  assert.notEqual(syncPhotos(f).data.albums[id].images[0].src,url);
  fs.renameSync(path.join(f.source,directory,'photo-10.webp'),path.join(f.source,directory,'photo-0.webp'));
  assert.equal(syncPhotos(f).data.albums[id].images[0].sequence,'0');
  for(const name of ['photo-0.webp','photo-1.webp','photo-2.webp'])fs.unlinkSync(path.join(f.source,directory,name));
  assert.equal(syncPhotos(f).data.albums[id].images.length,0);
 }
});
test('a previously populated optional directory disappearing cannot clear the destination',()=>{
 const f=fixture();put(f,'10-swim/swim-1.webp');syncPhotos(f);
 fs.renameSync(path.join(f.source,'10-swim'),path.join(f.source,'offline-swim'));
 const before=fs.readFileSync(path.join(f.stateDirectory,'state.json'),'utf8');
 assert.throws(()=>syncPhotos(f),/PREVIOUSLY_POPULATED_SOURCE_MISSING/);
 assert(fs.existsSync(path.join(f.destination,'10-swim/swim-1.webp')));
 assert.equal(fs.readFileSync(path.join(f.stateDirectory,'state.json'),'utf8'),before);
 fs.renameSync(path.join(f.source,'offline-swim'),path.join(f.source,'10-swim'));
 fs.unlinkSync(path.join(f.source,'10-swim/swim-1.webp'));syncPhotos(f);
 fs.rmdirSync(path.join(f.source,'10-swim'));
 assert.throws(()=>syncPhotos(f),/PREVIOUSLY_POPULATED_SOURCE_MISSING/);
});
function legacyFixture(){
 const f=fixture();
 for(const dir of Object.values(directoryMigration))put(f,dir+'/photo-1.webp');
 const files={};
 for(const item of scanPhotos(f.source).files){
  const [dir,name]=item.path.split('/');
  const old=Object.entries(directoryMigration).find(([,next])=>next===dir)?.[0]??dir;
  fs.mkdirSync(path.join(f.destination,old),{recursive:true});
  fs.copyFileSync(path.join(f.source,item.path),path.join(f.destination,old,name));
  fs.writeFileSync(path.join(f.destination,old,'.gitkeep'),'');files[old+'/'+name]=item.sha256;
 }
 fs.mkdirSync(f.stateDirectory);
 const state={version:1,source:fs.realpathSync(f.source),destination:fs.realpathSync(f.destination),files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))};
 fs.writeFileSync(path.join(f.stateDirectory,'state.json'),JSON.stringify(state));
 return {...f,state};
}
test('explicit migration preserves prior state, copies verified new paths before removing only known old files',()=>{
 const f=legacyFixture();put(f,'07-child/child-1.webp');
 assert.throws(()=>syncPhotos(f),/DIRECTORY_MIGRATION_REQUIRED/);
 const migrated=syncPhotos({...f,migrateDirectories:true});
 assert.equal(migrated.data.albums.family.images.length,1);
 for(const [old,dir] of Object.entries(directoryMigration)){
  assert(!fs.existsSync(path.join(f.destination,old)));
  assert.equal(sha256(fs.readFileSync(path.join(f.destination,dir,'photo-1.webp'))),sha256(bytes));
  assert(fs.existsSync(path.join(migrated.transactionDir,'before',old,'photo-1.webp')));
 }
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(migrated.transactionDir,'previous-state.json'))),f.state);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.stateDirectory,'state.json'))).version,2);
 assert.equal(syncPhotos(f).changed,false);
 assert.throws(()=>syncPhotos({...f,migrateDirectories:true}),/MIGRATION_REQUIRES_EXISTING/);
});
test('migration refuses destination edits, renamed-source changes, and interrupted transactions',()=>{
 const changed=legacyFixture();fs.writeFileSync(path.join(changed.destination,'07-mini-bar/photo-1.webp'),different);
 assert.throws(()=>syncPhotos({...changed,migrateDirectories:true}),/DESTINATION_EDIT_CONFLICT/);
 assert(fs.existsSync(path.join(changed.destination,'07-mini-bar/photo-1.webp')));
 const sourceChanged=legacyFixture();put(sourceChanged,'08-mini-bar/photo-1.webp',different);
 assert.throws(()=>syncPhotos({...sourceChanged,migrateDirectories:true}),/RENAMED_SOURCE_CONFLICT/);
 const interrupted=legacyFixture();
 assert.throws(()=>syncPhotos({...interrupted,migrateDirectories:true,beforeApply(){throw Error('SYNTHETIC_IO_FAILURE');}}),/SYNTHETIC_IO_FAILURE/);
 assert(fs.existsSync(path.join(interrupted.destination,'07-mini-bar/photo-1.webp')));
 assert.throws(()=>syncPhotos({...interrupted,migrateDirectories:true}),/INCOMPLETE_SYNC_REQUIRES_REVIEW/);
});
