import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { syncPhotos } from './sync.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const source = value('--source');
if (!source) throw Error('Use --source with the owner-managed images/public directory');
const port = Number(value('--port') ?? 5185);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid port');
const stateDirectory = path.join(project, '.local/facilities-photos');
const destination = path.join(project, 'client/public/images/public');
fs.mkdirSync(stateDirectory, { recursive: true });
const sync = () => syncPhotos({ source, destination, stateDirectory });
const first = sync();
fs.writeFileSync(path.join(stateDirectory, 'inventory.json'), JSON.stringify(first.data, null, 2));
console.log('Photos verified: ' + first.data.files.length + '; overview: ' + (first.data.files.length - 1));
const identity = { type: 'facilities-folder-preview-1', project, source: fs.realpathSync(source), port };
try {
  const response = await fetch(`http://127.0.0.1:${port}/__facilities-preview`, { signal: AbortSignal.timeout(1000) });
  const existing = await response.json();
  if (existing.project !== identity.project || existing.source !== identity.source || existing.type !== identity.type) throw Error('PORT_BELONGS_TO_ANOTHER_SERVER');
  console.log(`Existing preview refreshed: http://127.0.0.1:${port}/facilities`);
  process.exit(0);
} catch (error) {
  if (error.message === 'PORT_BELONGS_TO_ANOTHER_SERVER') throw error;
}
let syncStatus = 'ACTIVE', syncError = null;
const server = await createServer({ root: path.join(project, 'client'), configFile: path.join(project, 'vite.config.ts'), server: { host: '127.0.0.1', port, strictPort: true }, plugins: [{
  name: 'facilities-preview-identity',
  configureServer(vite) { vite.middlewares.use((req, res, next) => {
    if (req.url !== '/__facilities-preview') return next();
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ...identity, syncStatus, syncError }));
  }); },
}] });
await server.listen();
console.log(`Preview: http://127.0.0.1:${port}/facilities (owner photos checked every 3 seconds)`);
const timer = setInterval(() => {
  try {
    const result = sync();
    const recovered = syncStatus !== 'ACTIVE';
    syncStatus = 'ACTIVE'; syncError = null;
    if (result.changed) {
      fs.writeFileSync(path.join(stateDirectory, 'inventory.json'), JSON.stringify(result.data, null, 2));
      console.log('Updated photos: ' + result.data.files.length + '; ' + new Date().toISOString());
    }
    if (recovered) server.ws.send({ type: 'full-reload' });
  } catch (error) {
    const changedError = syncError !== error.message;
    syncStatus = 'PAUSED'; syncError = error.message;
    if (!changedError) return;
    fs.writeFileSync(path.join(stateDirectory, 'sync-error.json'), JSON.stringify({ at: new Date().toISOString(), message: syncError }));
    console.error('PHOTO SYNC PAUSED; existing verified photos retained: ' + syncError);
    server.ws.send({ type: 'error', err: { message: 'Photo sync stopped: ' + syncError, stack: '', plugin: 'facilities-photo-sync' } });
  }
}, 3000);
async function stop() { clearInterval(timer); await server.close(); process.exit(0); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
