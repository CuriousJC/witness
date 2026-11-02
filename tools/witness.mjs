#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { videoId, youtube, stamp, SLUG, frameTimes, frameFile, parseJson3, parseVtt, sourceRecord, validateSource, validateVisuals, validateArticle, renderArticle, renderMarkdown, renderIndex } from './core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = (...parts) => path.join(root, ...parts);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file).equals(Buffer.from(content))) return;
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}
function saveSource(source) {
  const existing = sources().find(s => s.videoId === source.videoId);
  if (existing && existing.slug !== source.slug) throw new Error('The source title changed. Review its folder and article links before migrating to the new title.');
  const file = at('sources', source.slug, 'source.json');
  if (fs.existsSync(file) && read(file).videoId !== source.videoId) throw new Error(`Source title collision at ${source.slug}; existing evidence was preserved.`);
  write(file, `${JSON.stringify(source, null, 2)}\n`);
  console.log(`Source ready: sources/${source.slug}/source.json (${source.segments.length} caption segments)`);
}
function sources() {
  return (fs.existsSync(at('sources')) ? fs.readdirSync(at('sources')) : []).filter(name => SLUG.test(name) && fs.existsSync(at('sources', name, 'source.json'))).map(name => {
    const source = read(at('sources', name, 'source.json'));
    validateSource(source);
    if (source.slug !== name) throw new Error(`Source folder ${name} must match its title slug.`);
    return source;
  });
}
function loadSource(input) {
  const all = sources();
  const named = all.find(s => s.slug === input);
  if (named) return named;
  const id = videoId(input);
  const matches = all.filter(s => s.videoId === id);
  if (matches.length !== 1) throw new Error(`Expected one saved source for ${input}; found ${matches.length}. Run fetch first.`);
  return matches[0];
}
function captions(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (file.endsWith('.json3')) return parseJson3(JSON.parse(text));
  if (file.endsWith('.vtt')) return parseVtt(text);
  throw new Error('Expected a .json3 or .vtt caption export.');
}
function fetchVideo(input, refresh) {
  const id = videoId(input);
  const saved = sources().find(s => s.videoId === id);
  if (!refresh && saved) {
    console.log(`Using saved source: sources/${saved.slug}/source.json (${saved.title}). Use --refresh to retrieve again.`);
    return;
  }
  const executable = binary('yt-dlp');
  fs.mkdirSync(at('.cache'), { recursive: true });
  const directory = fs.mkdtempSync(at('.cache', `${id}-`));
  const args = ['--ignore-config', '--no-playlist', '--skip-download', '--write-info-json', '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en', '--sub-format', 'json3', '--js-runtimes', 'node', '--paths', directory, '-o', '%(id)s.%(ext)s', youtube(id)];
  const result = spawnSync(executable, args, { stdio: 'inherit', timeout: 180000, windowsHide: true });
  if (result.error?.code === 'ENOENT') throw new Error('yt-dlp is missing. On Windows run tools/setup.ps1, or put yt-dlp on PATH.');
  if (result.error || result.status !== 0) throw new Error(`Caption retrieval failed (${result.error?.message || `exit ${result.status}`}); existing sources and pages were preserved. Downloads: ${directory}`);
  const info = read(path.join(directory, `${id}.info.json`));
  const files = fs.readdirSync(directory).filter(name => name.startsWith(`${id}.`) && name.endsWith('.json3'));
  const language = file => file.slice(id.length + 1, -'.json3'.length);
  const rank = file => (info.subtitles?.[language(file)]?.length ? 0 : 10) + (language(file) === 'en-orig' ? 0 : language(file) === 'en' ? 1 : 2);
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (!files.length) throw new Error('No English captions were returned. No completed source or article was created.');
  const file = files[0], lang = language(file);
  saveSource(sourceRecord(id, info, captions(path.join(directory, file)), { language: lang, kind: info.subtitles?.[lang]?.length ? 'manual' : 'automatic', format: 'json3' }));
}
function binary(name) {
  const local = at('.tools', `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  return fs.existsSync(local) ? local : name;
}
function run(executable, args, timeout = 180000) {
  const result = spawnSync(executable, args, { stdio: 'inherit', timeout, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.error?.message || `exit ${result.status}`}. Existing reviewed evidence was preserved.`);
}
function extractFrames(input, selection) {
  const source = loadSource(input);
  const times = frameTimes(selection, source.duration);
  const cache = at('.cache', source.slug);
  const video = path.join(cache, 'video.mp4');
  fs.mkdirSync(cache, { recursive: true });
  // Fail before a potentially large download if the extraction tool is unavailable.
  const ffmpeg = binary('ffmpeg');
  const probe = spawnSync(ffmpeg, ['-version'], { windowsHide: true, encoding: 'utf8' });
  if (probe.error || probe.status !== 0) throw new Error('FFmpeg is required for snapshot extraction; put ffmpeg on PATH or in .tools/.');
  if (!fs.existsSync(video)) run(binary('yt-dlp'), ['--ignore-config', '--no-playlist', '--js-runtimes', 'node', '--no-progress', '-f', 'bestvideo[height<=720][ext=mp4]/best[height<=720][ext=mp4]', '--paths', cache, '-o', 'video.%(ext)s', source.url], 600000);
  const manifestFile = at('sources', source.slug, 'visuals.json');
  const manifest = fs.existsSync(manifestFile) ? read(manifestFile) : { videoId: source.videoId, frames: [] };
  validateVisuals(manifest, source);
  for (const time of times) {
    const file = frameFile(time);
    const destination = at('sources', source.slug, file);
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const temporary = path.join(cache, `capture-${time}.jpg`);
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', video, '-frames:v', '1', '-vf', 'scale=min(1280\\,iw):-2', '-q:v', '3', '-y', temporary]);
      if (!fs.existsSync(temporary) || fs.statSync(temporary).size === 0) throw new Error(`No frame was produced at ${time}s.`);
      fs.copyFileSync(temporary, destination);
    }
    if (!manifest.frames.some(f => f.time === time)) manifest.frames.push({ time, file, observations: [] });
  }
  manifest.frames.sort((a, b) => a.time - b.time);
  write(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Snapshots ready: sources/${source.slug}/visuals.json. Inspect selected images before adding observations; extraction alone is not visual review.`);
}
function outputs() {
  const files = fs.existsSync(at('articles')) ? fs.readdirSync(at('articles')).filter(file => file.endsWith('.json')).sort() : [];
  const entries = files.map(file => {
    const article = read(at('articles', file));
    if (article.slug !== file.slice(0, -5)) throw new Error(`${file}: filename must match the article title slug.`);
    const source = loadSource(article.videoId);
    const manifestFile = at('sources', source.slug, 'visuals.json');
    const visuals = fs.existsSync(manifestFile) ? read(manifestFile) : { videoId: source.videoId, frames: [] };
    validateVisuals(visuals, source);
    validateArticle(article, source, visuals.frames);
    for (const time of article.visualEvidence || []) {
      const frame = visuals.frames.find(f => f.time === time);
      const file = at('sources', source.slug, frame.file);
      if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`Missing visual evidence: ${file}`);
    }
    return { article, source, frames: visuals.frames };
  }).sort((a, b) => a.source.title.localeCompare(b.source.title) || Number(a.article.basis !== 'captions') - Number(b.article.basis !== 'captions') || a.article.title.localeCompare(b.article.title));
  // Validate everything before writing any generated output.
  return new Map([
    ['docs/index.html', renderIndex(entries)],
    ['docs/assets/reading.css', fs.readFileSync(at('web', 'reading.css'), 'utf8')],
    ['docs/assets/library.js', fs.readFileSync(at('web', 'library.js'), 'utf8')],
    ['docs/assets/images.js', fs.readFileSync(at('web', 'images.js'), 'utf8')],
    ...entries.map(({ article, source, frames }) => [`docs/videos/${article.slug}.html`, renderArticle(article, source, { frames, editions: entries.filter(e => e.article.videoId === source.videoId).map(e => e.article) })]),
    ...entries.map(({ article, source, frames }) => [`docs/videos/${article.slug}.md`, renderMarkdown(article, source, { frames, editions: entries.filter(e => e.article.videoId === source.videoId).map(e => e.article) })]),
    ...entries.flatMap(({ article, source, frames }) => (article.sections.flatMap(s => s.figures || [])).map(f => {
      const frame = frames.find(frame => frame.time === f.time);
      return [`docs/assets/${source.slug}/${frame.file}`, fs.readFileSync(at('sources', source.slug, frame.file))];
    })),
  ]);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'fetch' && args.length >= 1 && args.length <= 2 && (!args[1] || args[1] === '--refresh')) fetchVideo(args[0], args[1] === '--refresh');
  else if (command === 'frames' && args.length === 2) extractFrames(args[0], args[1]);
  else if (command === 'import' && args.length === 3) {
    const id = videoId(args[0]);
    saveSource(sourceRecord(id, read(path.resolve(args[2])), captions(path.resolve(args[1])), { language: 'und', kind: 'imported', format: path.extname(args[1]).slice(1) }));
  } else if (command === 'transcript' && args.length === 1) {
    const s = loadSource(args[0]);
    console.log(`${s.title}\n${s.channel} | ${stamp(s.duration)} | ${s.captions.kind} ${s.captions.language} captions\n`);
    for (const segment of s.segments) console.log(`[${stamp(segment.start)}] ${segment.text}`);
  } else if (['build', 'check'].includes(command) && args.length === 0) {
    const files = outputs();
    for (const [relative, content] of files) {
      if (command === 'build') write(at(relative), content);
      else if (!fs.existsSync(at(relative)) || !fs.readFileSync(at(relative)).equals(Buffer.from(content))) throw new Error(`${relative} is missing or stale. Run node tools/witness.mjs build.`);
    }
    const expected = new Set(files.keys());
    for (const name of fs.existsSync(at('docs', 'videos')) ? fs.readdirSync(at('docs', 'videos')) : []) {
      if (/\.(html|md)$/.test(name) && !expected.has(`docs/videos/${name}`)) throw new Error(`Orphan reading edition: docs/videos/${name}; review it before removing it.`);
    }
    console.log(`${command === 'build' ? 'Built' : 'Verified'} ${[...files.keys()].filter(k => k.startsWith('docs/videos/') && k.endsWith('.html')).length} reading edition(s) in HTML and Markdown, plus the library. Open docs/index.html.`);
  } else throw new Error('Usage: node tools/witness.mjs fetch <url> [--refresh] | transcript <title-slug-or-url> | frames <title-slug-or-url> <seconds,...> | import <url> <captions.json3|vtt> <info.json> | build | check');
} catch (error) {
  console.error(`Witness: ${error.message}`);
  process.exitCode = 1;
}
