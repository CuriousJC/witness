import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { videoId, youtube, slugify, frameTimes, frameFile, parseJson3, parseVtt, sourceRecord, validateArticle, validateVisuals, renderArticle, renderMarkdown, renderIndex } from './core.mjs';

const id = 'eA4VxgsWDoc';
const source = () => sourceRecord(id, { id, title: 'A useful talk', channel: 'A channel', duration: 60 }, [{ start: 0, end: 60, text: 'The evidence.' }], { language: 'en', kind: 'manual', format: 'json3' });
const article = () => ({ videoId: id, slug: 'reading-edition', basis: 'captions', title: 'Reading edition', dek: 'What this teaches.', overview: ['The overview.'], takeaways: [{ title: 'An insight', text: 'Why it matters.' }], sections: [{ id: 'the-lesson', title: 'The lesson', start: 0, end: 60, paragraphs: ['The explanation.'] }], limitations: ['Based on captions.'] });

test('reading tags validate month boundaries, preserve legacy records, and escape metadata in exports', () => {
  const a = article(), s = source();
  assert.doesNotThrow(() => validateArticle(a, s));
  for (const generatedMonth of ['2026-00', '2026-13', 'November', '2026-11-01', 202611]) {
    assert.throws(() => validateArticle({ ...a, generatedMonth }, s), /month/);
  }
  for (const topics of [[], ['One'], ['One', 'Two', 'Three'], ['Steam', ' steam '], ['One', '']]) {
    assert.throws(() => validateArticle({ ...a, topics }, s), /Topics/);
  }
  a.topics = ['Game marketing', '<script>alert(1)</script>']; a.generatedMonth = '2026-11';
  const page = renderArticle(a, s), index = renderIndex([{ article: a, source: s }]);
  assert.ok(!page.includes('<script>alert(1)</script>'));
  assert.ok(index.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(index.includes('value="2026-11"'));
  assert.ok(page.includes('Generated November 2026'));
  assert.ok(renderMarkdown(a, s).includes('Generated: November 2026'));
});

test('YouTube links normalize without accepting lookalike hosts or arbitrary IDs', () => {
  for (const url of [id, `https://youtu.be/${id}?t=9`, youtube(id), `https://m.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`, `https://www.youtube.com/live/${id}`]) assert.equal(videoId(url), id);
  for (const url of [`https://youtube.com.evil.test/watch?v=${id}`, `https://example.com/?v=${id}`, `https://youtu.be/short`, 'file:///watch?v=eA4VxgsWDoc', '../outside']) assert.throws(() => videoId(url));
});

test('title filenames normalize accents and punctuation and reject unsafe or empty titles', () => {
  assert.equal(slugify('  Café: A Better Trailer — Part 2! '), 'cafe-a-better-trailer-part-2');
  assert.equal(slugify('../../A Useful Talk'), 'a-useful-talk');
  assert.throws(() => slugify('...'));
  assert.throws(() => slugify('CON'));
  const a = article(); a.slug = '../outside';
  assert.throws(() => validateArticle(a, source()), /slug/);
});

test('snapshot selections are bounded, sorted, deduplicated, and inside the runtime', () => {
  assert.deepEqual(frameTimes('30,0,10,30', 60), [0, 10, 30]);
  assert.equal(frameFile(1880), 'frames/frame-00-31-20.jpg');
  for (const selection of ['', '-1', '1.5', '60', '2;echo unsafe', Array.from({ length: 21 }, (_, i) => i).join(',')]) assert.throws(() => frameTimes(selection, 60));
});

test('a visual edition cannot claim an uninspected frame or a frame from another source', () => {
  const s = source(), a = article();
  a.basis = 'captions-and-frames'; a.visualEvidence = [10];
  const frames = [{ time: 10, file: frameFile(10), observations: [] }];
  assert.throws(() => validateArticle(a, s, frames), /inspected/);
  frames[0].observations = ['An actual slide observation.'];
  assert.doesNotThrow(() => validateArticle(a, s, frames));
  assert.throws(() => validateVisuals({ videoId: 'abcdefghijk', frames }, s), /belong/);
  assert.throws(() => validateVisuals({ videoId: id, frames: [{ ...frames[0], file: '../outside.jpg' }] }, s), /filename/);
  a.sections[0].figures = [{ time: 10, caption: 'A useful slide.' }];
  assert.throws(() => validateArticle(a, s, frames), /alt text/);
});

test('visual editions render offline images and comparison links without changing caption prose', () => {
  const s = source(), original = article(), visual = article();
  visual.title = 'Reading edition with slides'; visual.slug = slugify(visual.title);
  visual.basis = 'captions-and-frames'; visual.visualEvidence = [10];
  visual.visualSummary = ['One detail the chart adds.'];
  visual.sections[0].figures = [{ time: 10, caption: 'An inspected chart.' }];
  const frames = [{ time: 10, file: frameFile(10), observations: ['A visible axis.'], alt: 'Chart with an axis.' }];
  const context = { frames, editions: [original, visual] };
  const result = renderArticle(visual, s, context);
  assert.ok(result.includes('href="reading-edition.html"'));
  assert.ok(result.includes('src="../assets/a-useful-talk/frames/frame-00-00-10.jpg"'));
  assert.ok(result.includes('What the snapshots add'));
  assert.ok(result.includes('A visible axis.'));
  const markdown = renderMarkdown(visual, s, context);
  assert.ok(markdown.includes(visual.sections[0].paragraphs[0]));
  assert.ok(markdown.includes('[0:00](https://www.youtube.com/watch?v=eA4VxgsWDoc&t=0s)'));
  assert.ok(markdown.includes('![Chart with an axis.](../assets/a-useful-talk/frames/frame-00-00-10.jpg)'));
  assert.ok(markdown.includes('(reading-edition.md)'));
  assert.ok(markdown.includes('[Snapshot observations](../../sources/a-useful-talk/visuals.json)'));
  assert.ok(!markdown.includes('A visible axis.')); // Evidence remains linked, not duplicated.
  const baseline = renderArticle(original, s, context);
  assert.ok(baseline.includes(original.sections[0].paragraphs[0]));
  assert.ok(!baseline.includes('<img'));
  assert.ok(!baseline.includes('A visible axis.'));
  assert.ok(baseline.includes('href="reading-edition-with-slides.html"'));
});

test('JSON3 retains cue timing, skips window/newline events, and preserves later repeated speech', () => {
  const segments = parseJson3({ events: [
    { tStartMs: 0, dDurationMs: 9000 },
    { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Keep' }, { utf8: ' this point' }] },
    { tStartMs: 2000, segs: [{ utf8: '\n' }] },
    { tStartMs: 8000, dDurationMs: 1000, segs: [{ utf8: 'Keep this point' }] },
  ] });
  assert.deepEqual(segments, [{ start: 1, end: 3, text: 'Keep this point' }, { start: 8, end: 9, text: 'Keep this point' }]);
});

test('VTT rolling context is removed locally without erasing a later repeated line', () => {
  const segments = parseVtt('WEBVTT\nKind: captions\n\nNOTE ignore me\n\n1\n00:00:01.000 --> 00:00:04.000 align:start\n<c>one two three</c>\n\n2\n00:00:03.000 --> 00:00:06.000\none two three four &amp; five\n\n3\n00:00:10.000 --> 00:00:12.000\none two three\n');
  assert.deepEqual(segments.map(s => s.text), ['one two three', 'four & five', 'one two three']);
  assert.deepEqual(segments.map(s => s.start), [1, 3, 10]);
});

test('invalid and empty caption exports cannot produce a completed source', () => {
  assert.throws(() => parseJson3({}), /events/);
  assert.throws(() => sourceRecord(id, { id, title: 'Title', channel: 'Channel', duration: 10 }, [], { language: 'en', kind: 'manual' }), /No usable captions/);
  assert.throws(() => sourceRecord(id, { id: 'different', title: 'Title', channel: 'Channel', duration: 10 }, [], {}), /does not match/);
  assert.throws(() => parseVtt('WEBVTT\n\n00:bad --> 00:02.000\nBroken'), /timestamp/);
});

test('sources reject out-of-order cues and bound the final display window to duration', () => {
  const info = { id, title: 'Title', channel: 'Channel', duration: 10 };
  const provenance = { language: 'en', kind: 'automatic' };
  assert.throws(() => sourceRecord(id, info, [{ start: 8, end: 9, text: 'later' }, { start: 2, end: 3, text: 'earlier' }], provenance), /out-of-order/);
  assert.equal(sourceRecord(id, info, [{ start: 9, end: 14, text: 'tail' }], provenance).segments[0].end, 10);
});

test('articles cannot silently omit the tail, overlap time ranges, or use unsafe anchors', () => {
  const s = source();
  const short = article(); short.sections[0].end = 40;
  assert.throws(() => validateArticle(short, s), /full source runtime/);
  const gap = article(); gap.sections.push({ ...gap.sections[0], id: 'second', title: 'Second', start: 50, end: 60 });
  assert.throws(() => validateArticle(gap, s), /contiguous/);
  const unsafe = article(); unsafe.sections[0].id = '" onclick="alert(1)';
  assert.throws(() => validateArticle(unsafe, s), /anchors/);
  const mismatch = article(); mismatch.videoId = 'abcdefghijk';
  assert.throws(() => validateArticle(mismatch, s), /IDs differ/);
});

test('all source and article text is escaped and timestamp links preserve the video ID', () => {
  const a = article(), s = source();
  const attack = '<script>alert("x")</script>&';
  a.title = attack; a.sections[0].paragraphs = [attack]; s.title = attack; s.segments[0].text = attack;
  a.slug = slugify(a.title); s.slug = slugify(s.title);
  const result = renderArticle(a, s);
  assert.ok(!result.includes('<script>'));
  assert.ok(result.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;'));
  assert.ok(result.includes(`watch?v=${id}&amp;t=0s`));
  assert.ok(!renderIndex([{ article: a, source: s }]).includes('<script>'));
});

test('rendered pages contain every authored paragraph and source cue without runtime fetching', () => {
  const a = article(), s = source();
  a.sections[0].paragraphs.push('A second useful explanation.');
  const result = renderArticle(a, s);
  for (const text of [...a.overview, ...a.sections[0].paragraphs, ...s.segments.map(c => c.text)]) assert.ok(result.includes(text));
  assert.ok(result.includes('<details class="transcript">'));
  assert.ok(!result.includes('<script'));
  assert.ok(result.includes('href="../assets/reading.css"'));
});

test('CLI rejects invalid input before invoking acquisition and reports failure', () => {
  const cli = fileURLToPath(new URL('./witness.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'fetch', 'https://example.com/watch?v=eA4VxgsWDoc'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /YouTube host/);
});

test('CLI imports a local caption export and builds/checks an offline library in an isolated checkout', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-test-'));
  try {
    fs.mkdirSync(path.join(temporary, 'tools'));
    fs.mkdirSync(path.join(temporary, 'web'));
    fs.mkdirSync(path.join(temporary, 'articles'));
    for (const file of ['core.mjs', 'witness.mjs']) fs.copyFileSync(fileURLToPath(new URL(file, import.meta.url)), path.join(temporary, 'tools', file));
    fs.writeFileSync(path.join(temporary, 'web', 'reading.css'), 'body { color: black; }');
    fs.copyFileSync(fileURLToPath(new URL('../web/library.js', import.meta.url)), path.join(temporary, 'web', 'library.js'));
    fs.writeFileSync(path.join(temporary, 'input.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nThe evidence.\n');
    fs.writeFileSync(path.join(temporary, 'info.json'), JSON.stringify({ id, title: 'Title', channel: 'Channel', duration: 60 }));
    fs.writeFileSync(path.join(temporary, 'articles', 'reading-edition.json'), JSON.stringify(article()));
    const cli = path.join(temporary, 'tools', 'witness.mjs');
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', windowsHide: true });
    assert.equal(run('import', youtube(id), path.join(temporary, 'input.vtt'), path.join(temporary, 'info.json')).status, 0);
    assert.equal(run('build').status, 0);
    assert.equal(run('check').status, 0);
    assert.ok(fs.readFileSync(path.join(temporary, 'docs', 'videos', 'reading-edition.html'), 'utf8').includes('The evidence.'));
    const markdownFile = path.join(temporary, 'docs', 'videos', 'reading-edition.md');
    const markdown = fs.readFileSync(markdownFile, 'utf8');
    for (const paragraph of article().sections[0].paragraphs) assert.ok(markdown.includes(paragraph));
    assert.ok(markdown.includes('(../../sources/title/source.json)'));
    assert.ok(!markdown.includes('The evidence.')); // Do not repeat the raw transcript.
    fs.appendFileSync(markdownFile, 'stale Markdown');
    assert.equal(run('check').status, 1);
    assert.equal(run('build').status, 0);
    assert.equal(run('check').status, 0);
    assert.match(run('transcript', 'title').stdout, /The evidence/);
    assert.match(run('fetch', youtube(id)).stdout, /Using saved source/);
    fs.appendFileSync(path.join(temporary, 'docs', 'index.html'), 'drift');
    assert.equal(run('check').status, 1);
    assert.equal(run('build').status, 0);
    assert.equal(run('check').status, 0);
    // Failed acquisition never replaces the source or the rendered edition.
    const before = fs.readFileSync(path.join(temporary, 'sources', 'title', 'source.json'), 'utf8');
    fs.writeFileSync(path.join(temporary, 'input.vtt'), 'WEBVTT\n\n');
    assert.equal(run('import', youtube(id), path.join(temporary, 'input.vtt'), path.join(temporary, 'info.json')).status, 1);
    assert.equal(fs.readFileSync(path.join(temporary, 'sources', 'title', 'source.json'), 'utf8'), before);
    // Two different videos with the same title cannot overwrite each other's evidence.
    fs.writeFileSync(path.join(temporary, 'input.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nOther evidence.\n');
    fs.writeFileSync(path.join(temporary, 'info.json'), JSON.stringify({ id: 'abcdefghijk', title: 'Title', channel: 'Other channel', duration: 60 }));
    const collision = run('import', youtube('abcdefghijk'), path.join(temporary, 'input.vtt'), path.join(temporary, 'info.json'));
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /collision/);
    assert.equal(fs.readFileSync(path.join(temporary, 'sources', 'title', 'source.json'), 'utf8'), before);
    assert.equal(run('check').status, 0);
  } finally {
    assert.ok(path.dirname(path.resolve(temporary)) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('witness-test-'), 'Cleanup target must be the test directory under the system temporary directory.');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
