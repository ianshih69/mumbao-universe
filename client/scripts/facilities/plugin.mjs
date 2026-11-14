import path from 'node:path';
import { groups, scanPhotos } from './photos.mjs';

export function facilitiesPhotosPlugin() {
  const id = 'virtual:facilities-photos', resolved = '\0' + id;
  let root, building = false;
  return {
    name: 'facilities-folder-photos',
    configResolved(config) { root = path.resolve(config.root, 'public/images/public'); building = config.command === 'build'; },
    resolveId(source) { if (source === id) return resolved; },
    load(source) {
      if (source !== resolved) return;
      const data = scanPhotos(root);
      // Dev directories are watched below, not added as module imports by Vite.
      if (building) for (const file of data.files) this.addWatchFile(path.join(root, file.path));
      return 'export default ' + JSON.stringify(data) + ';';
    },
    configureServer(server) {
      const directories = groups.map(g => path.join(root, g.directory));
      server.watcher.add(directories);
      let timer;
      const changed = (_event, filename) => {
        filename = path.resolve(filename);
        if (!directories.some(dir => filename.startsWith(dir + path.sep) || filename === dir)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            scanPhotos(root);
            const module = server.moduleGraph.getModuleById(resolved);
            if (module) server.moduleGraph.invalidateModule(module);
            server.ws.send({ type: 'full-reload' });
          } catch (error) {
            server.config.logger.error(error.message);
            server.ws.send({ type: 'error', err: { message: error.message, stack: '', plugin: 'facilities-folder-photos' } });
          }
        }, 350);
      };
      server.watcher.on('all', changed);
      server.httpServer?.once('close', () => { clearTimeout(timer); server.watcher.off('all', changed); });
    },
  };
}
