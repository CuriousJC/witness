import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanVideoCache } from './cache.mjs';

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-cache-test-'));
  try { run(root); } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('witness-cache-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('cleanup removes only downloader media in selected caches and is repeatable', () => fixture(root => {
  for (const folder of ['.cache/done', '.cache/unfinished', 'sources/done/frames']) fs.mkdirSync(path.join(root, folder), { recursive: true });
  const write = file => fs.writeFileSync(path.join(root, file), 'data');
  for (const file of ['video.mp4', 'video.mp4.part', 'video.mp4.ytdl', 'video.mp4.part-Frag1', 'video.webm']) write(`.cache/done/${file}`);
  const kept = ['.cache/done/transcript.txt', '.cache/done/capture-10.jpg', '.cache/done/custom.mp4', '.cache/unfinished/video.mp4', 'sources/done/frames/frame-00-00-10.jpg'];
  kept.forEach(write);
  assert.deepEqual(cleanVideoCache(root, ['done', 'done']), { files: 5, bytes: 20 });
  kept.forEach(file => assert.ok(fs.existsSync(path.join(root, file)), file));
  assert.deepEqual(cleanVideoCache(root, ['done']), { files: 0, bytes: 0 });
}));

test('cleanup rejects traversal before deleting any selected media', () => fixture(root => {
  fs.mkdirSync(path.join(root, '.cache/done'), { recursive: true });
  const file = path.join(root, '.cache/done/video.mp4'); fs.writeFileSync(file, 'keep');
  assert.throws(() => cleanVideoCache(root, ['done', '../outside']), /slug/);
  assert.ok(fs.existsSync(file));
}));

test('cleanup refuses a source-cache junction rather than following it', () => fixture(root => {
  const outside = path.join(root, 'preserved'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'video.mp4'), 'keep');
  fs.mkdirSync(path.join(root, '.cache'));
  fs.symlinkSync(outside, path.join(root, '.cache/redirected'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => cleanVideoCache(root, ['redirected']), /redirected/);
  assert.ok(fs.existsSync(path.join(outside, 'video.mp4')));
}));
