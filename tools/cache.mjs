import fs from 'node:fs';
import path from 'node:path';
import { SLUG } from './core.mjs';

// Only disposable media names written by the frame downloader. No recursive deletion.
const media = /^video\.(?:mp4|webm|mkv)(?:\.part(?:-Frag\d+)?|\.ytdl)?$/;
export function cleanVideoCache(root, slugs) {
  const workspace = fs.realpathSync(root);
  const cache = path.join(workspace, '.cache');
  if (!fs.existsSync(cache)) return { files: 0, bytes: 0 };
  if (fs.lstatSync(cache).isSymbolicLink() || fs.realpathSync(cache) !== cache) throw new Error('Refusing cleanup through a redirected .cache directory.');
  const candidates = [];
  for (const slug of new Set(slugs)) {
    if (typeof slug !== 'string' || !SLUG.test(slug)) throw new Error('Invalid source slug for cache cleanup.');
    const directory = path.join(cache, slug);
    if (!fs.existsSync(directory)) continue;
    if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory || path.dirname(directory) !== cache) throw new Error('Refusing cleanup through a redirected source cache.');
    for (const name of fs.readdirSync(directory)) {
      if (!media.test(name)) continue;
      const file = path.join(directory, name);
      const info = fs.lstatSync(file);
      if (info.isFile() && !info.isSymbolicLink()) candidates.push({ file, bytes: info.size });
    }
  }
  // Finish validating paths before removing any files.
  for (const { file } of candidates) fs.unlinkSync(file);
  return { files: candidates.length, bytes: candidates.reduce((sum, file) => sum + file.bytes, 0) };
}
