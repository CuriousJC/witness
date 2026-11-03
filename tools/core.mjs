export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function slugify(title) {
  const slug = String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 140).replace(/-$/, '');
  if (!slug || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(slug)) throw new Error('Title needs a descriptive filename using Latin letters or digits.');
  return slug;
}
export function frameTimes(input, duration) {
  const times = String(input).split(',').map(t => t.trim());
  assert(times.length <= 20 && times.every(t => /^\d+$/.test(t)), 'Choose 1–20 whole-second frame timestamps, separated by commas.');
  const values = [...new Set(times.map(Number))].sort((a, b) => a - b);
  assert(values.every(t => Number.isSafeInteger(t) && t >= 0 && t < duration), 'Frame timestamps must be inside the video runtime.');
  return values;
}
export const frameFile = time => `frames/frame-${String(Math.floor(time / 3600)).padStart(2, '0')}-${String(Math.floor(time / 60) % 60).padStart(2, '0')}-${String(time % 60).padStart(2, '0')}.jpg`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.length > 0 && value.every(nonempty);

export function videoId(input) {
  if (VIDEO_ID.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { throw new Error('Expected a YouTube URL or 11-character video ID.'); }
  assert(['https:', 'http:'].includes(url.protocol), 'Expected an HTTP(S) YouTube URL.');
  const host = url.hostname.toLowerCase();
  let id;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : null;
  }
  assert(VIDEO_ID.test(id ?? ''), 'Expected a valid video ID on a YouTube host.');
  return id;
}

export const youtube = (id, start) => `https://www.youtube.com/watch?v=${id}${start === undefined ? '' : `&t=${Math.floor(start)}s`}`;
export const stamp = seconds => {
  const s = Math.floor(seconds);
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const html = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = text => text.replace(/\s+/g, ' ').trim();
function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity.toLowerCase()];
  });
}

// Rolling captions repeat context. Only remove adjacent overlapping context; a phrase
// repeated later in the talk is meaningful source material and must survive.
export function compact(cues) {
  const result = [];
  let previous;
  for (const cue of cues) {
    const original = clean(cue.text);
    if (!original) continue;
    let text = original;
    if (previous && cue.start < previous.end) {
      if (original === previous.text) { previous = { ...cue, text: original }; continue; }
      const before = previous.text.split(' '), after = original.split(' ');
      for (let n = Math.min(before.length, after.length); n >= 3; n--) {
        if (before.slice(-n).join(' ') === after.slice(0, n).join(' ')) {
          text = after.slice(n).join(' '); break;
        }
      }
    }
    if (text) result.push({ start: cue.start, end: cue.end, text });
    previous = { ...cue, text: original };
  }
  return result;
}

export function parseJson3(data) {
  assert(Array.isArray(data.events), 'Caption JSON must contain an events array (YouTube json3).');
  return compact(data.events.filter(e => e.segs?.length).map(e => ({
    start: e.tStartMs / 1000,
    end: (e.tStartMs + (e.dDurationMs ?? 0)) / 1000,
    text: e.segs.map(s => s.utf8 ?? '').join(''),
  })));
}

export function parseVtt(data) {
  const time = text => text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  const cues = [];
  for (const block of data.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const i = lines.findIndex(line => line.includes('-->'));
    if (i < 0) continue;
    const match = lines[i].match(/^((?:\d+:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}\.\d{3})(?:\s.*)?$/);
    assert(match, `Invalid VTT timestamp: ${lines[i]}`);
    cues.push({ start: time(match[1]), end: time(match[2]), text: decode(lines.slice(i + 1).join(' ').replace(/<[^>]*>/g, '')) });
  }
  return compact(cues);
}

export function sourceRecord(id, info, segments, captions) {
  assert(info.id === id, 'Metadata video ID does not match the requested video.');
  const source = {
    videoId: id, slug: slugify(info.title), url: youtube(id), title: info.title, channel: info.channel || info.uploader,
    published: info.upload_date ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}` : null,
    duration: info.duration, description: info.description || '',
    chapters: (info.chapters || []).map(c => ({ start: c.start_time, end: c.end_time, title: c.title })),
    captions,
    // Cap caption tails to runtime: auto-caption display windows can overrun the last word.
    segments: segments.map(s => ({ ...s, end: Math.min(Math.max(s.start, s.end), info.duration) })),
  };
  validateSource(source);
  return source;
}

export function validateSource(s) {
  assert(VIDEO_ID.test(s.videoId), 'Invalid source video ID.');
  assert(SLUG.test(s.slug) && s.slug === slugify(s.title), 'Source slug must be the kebab-case title.');
  assert(s.url === youtube(s.videoId), 'Source URL must be the canonical YouTube URL.');
  assert(nonempty(s.title) && nonempty(s.channel), 'Source needs title and channel.');
  assert(Number.isFinite(s.duration) && s.duration > 0, 'Source needs a positive duration.');
  assert(nonempty(s.captions?.language) && ['automatic', 'manual', 'imported'].includes(s.captions?.kind), 'Source needs caption language and kind.');
  assert(Array.isArray(s.segments) && s.segments.length > 0, 'No usable captions; no source was produced.');
  let last = -1;
  for (const segment of s.segments) {
    assert(Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.start >= last && segment.end >= segment.start && segment.end <= s.duration + 2 && nonempty(segment.text), 'Invalid or out-of-order caption segment.');
    last = segment.start;
  }
}

export function validateVisuals(visuals, source) {
  assert(visuals.videoId === source.videoId && Array.isArray(visuals.frames), 'Visual evidence must belong to the source video.');
  const seen = new Set();
  for (const f of visuals.frames) {
    assert(Number.isSafeInteger(f.time) && f.time >= 0 && f.time < source.duration && !seen.has(f.time), 'Invalid or duplicate frame time.');
    assert(f.file === frameFile(f.time), 'Frame filename must match its timestamp.');
    assert(Array.isArray(f.observations) && f.observations.every(nonempty), 'Frame observations must be a list of text; an empty list means not inspected.');
    assert(f.alt === undefined || nonempty(f.alt), 'Frame alt text must be nonempty when present.');
    seen.add(f.time);
  }
}

export function validateArticle(a, s, frames = []) {
  validateSource(s);
  assert(a.videoId === s.videoId, 'Article and source IDs differ.');
  assert(SLUG.test(a.slug) && a.slug === slugify(a.title), 'Article slug must be the kebab-case title.');
  assert(['captions', 'captions-and-frames'].includes(a.basis), 'Article needs an evidence basis.');
  if (a.basis === 'captions-and-frames') {
    assert(Array.isArray(a.visualEvidence) && a.visualEvidence.length > 0 && new Set(a.visualEvidence).size === a.visualEvidence.length, 'Visual editions need a unique list of inspected frame times.');
    for (const time of a.visualEvidence) assert(frames.some(f => f.time === time && f.observations.length > 0), 'Visual evidence must reference inspected frames.');
  } else assert(!a.visualEvidence?.length, 'Caption-only editions cannot claim inspected frames.');
  assert(a.visualSummary === undefined || (a.basis === 'captions-and-frames' && strings(a.visualSummary)), 'Visual summary needs text and a visual evidence basis.');
  assert(nonempty(a.title) && nonempty(a.dek), 'Article needs a title and dek.');
  assert(a.topics === undefined || (strings(a.topics) && a.topics.length === 2 && new Set(a.topics.map(t => t.trim().toLowerCase())).size === 2), 'Topics must be two distinct nonempty labels.');
  assert(a.generatedMonth === undefined || (typeof a.generatedMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(a.generatedMonth)), 'Generation month must be YYYY-MM.');
  assert(a.processedAt === undefined || (typeof a.processedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(a.processedAt) && Number.isFinite(Date.parse(a.processedAt))), 'Processing timestamp must be an ISO date and time with timezone.');
  if (a.processingUsage !== undefined) {
    assert(a.processingUsage !== null && typeof a.processingUsage === 'object' && !Array.isArray(a.processingUsage), 'Processing usage must be a record.');
    assert(a.processingUsage.totalTokens === null || (Number.isSafeInteger(a.processingUsage.totalTokens) && a.processingUsage.totalTokens > 0), 'Processing tokens must be a positive integer or null when unavailable.');
    assert(nonempty(a.processingUsage.note), 'Processing usage needs a note explaining measurement scope or missing counts.');
    assert(a.processingUsage.estimated === undefined || typeof a.processingUsage.estimated === 'boolean', 'Processing usage estimated flag must be boolean.');
    assert(!a.processingUsage.estimated || a.processingUsage.totalTokens !== null, 'Estimated usage needs a token count.');
  }
  assert(strings(a.overview), 'Article needs overview paragraphs.');
  assert(Array.isArray(a.takeaways) && a.takeaways.length && a.takeaways.every(t => nonempty(t.title) && nonempty(t.text)), 'Article needs takeaways with titles and explanations.');
  assert(strings(a.limitations), 'Article must disclose source limitations.');
  assert(Array.isArray(a.sections) && a.sections.length > 0, 'Article needs substantive sections.');
  const ids = new Set(), titles = new Set();
  let end = 0;
  for (const section of a.sections) {
    assert(typeof section.id === 'string' && /^[a-z][a-z0-9-]*$/.test(section.id) && !['overview', 'takeaways', 'source', 'main', 'top'].includes(section.id) && !ids.has(section.id), 'Section anchors must be unique and safe.');
    assert(nonempty(section.title) && !titles.has(section.title), 'Section titles must be nonempty and unique.');
    assert(Number.isFinite(section.start) && Number.isFinite(section.end) && section.start === end && section.end > section.start && section.end <= s.duration + 2, 'Section ranges must be contiguous, ordered, and inside the source runtime.');
    assert(strings(section.paragraphs), `Section ${section.id} needs paragraphs.`);
    assert(section.bullets === undefined || strings(section.bullets), `Invalid bullets in ${section.id}.`);
    if (section.figures !== undefined) {
      assert(Array.isArray(section.figures), 'Figures must be a list.');
      for (const f of section.figures) assert(a.visualEvidence?.includes(f.time) && f.time >= section.start && f.time < section.end && frames.some(frame => frame.time === f.time && nonempty(frame.alt)) && nonempty(f.caption), 'Figures need an inspected frame in their section range, alt text, and a caption.');
    }
    ids.add(section.id); titles.add(section.title); end = section.end;
  }
  assert(Math.abs(end - s.duration) <= 2, 'Section ranges must cover the full source runtime.');
}

export function readingMinutes(a) {
  const text = [a.dek, ...a.overview, ...(a.visualSummary || []), ...a.takeaways.flatMap(t => [t.title, t.text]), ...a.sections.flatMap(s => [s.title, ...s.paragraphs, ...(s.bullets || []), ...(s.figures || []).map(f => f.caption)])].join(' ');
  return Math.max(1, Math.ceil((text.match(/\S+/g)?.length || 0) / 230));
}

const paragraphs = list => list.map(p => `<p>${html(p)}</p>`).join('\n');
const list = values => `<ul>${values.map(v => `<li>${html(v)}</li>`).join('')}</ul>`;
// Article fields are plain text. Escape Markdown syntax so source wording cannot
// become unintended links, emphasis, headings, or embedded HTML in an export.
const markdownText = value => String(value).replace(/\s+/g, ' ').trim().replace(/[\\`*_\[\]<>#]/g, '\\$&');
const monthLabel = month => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const processedLabel = a => a.processedAt ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(a.processedAt)) : (a.generatedMonth ? monthLabel(a.generatedMonth) : 'Date not recorded');
const tags = a => `<div class="tags" aria-label="Reading tags">${(a.topics || []).map(t => `<span class="tag">${html(t)}</span>`).join('')}${a.generatedMonth ? `<span class="tag tag-month">Generated ${monthLabel(a.generatedMonth)}</span>` : ''}</div>`;
const tokenLabel = a => a.processingUsage?.totalTokens == null ? 'Not recorded' : `${a.processingUsage.estimated ? '~' : ''}${new Intl.NumberFormat('en-US').format(a.processingUsage.totalTokens)}${a.processingUsage.estimated ? ' (estimated)' : ''}`;

export function renderMarkdown(a, s, { frames = [], editions = [] } = {}) {
  validateArticle(a, s, frames);
  const text = markdownText;
  const jump = time => `[${stamp(time)}](${youtube(s.videoId, time)})`;
  const lines = [
    `# ${text(a.title)}`, '', text(a.dek), '',
    `Source: [${text(s.title)}](${s.url}) · ${text(s.channel)}${s.published ? ` · Published ${text(s.published)}` : ''}`,
    `Video: ${stamp(s.duration)} · Reading: ~${readingMinutes(a)} minutes · Basis: ${a.basis === 'captions' ? 'captions only' : `captions + ${a.visualEvidence.length} inspected snapshots`}`,
    '', `[Web edition](${a.slug}.html)`,
  ];
  const others = editions.filter(e => e.slug !== a.slug);
  if (a.topics) lines.push('', `Topics: ${a.topics.map(text).join(' · ')}`);
  if (a.generatedMonth) lines.push(`Generated: ${monthLabel(a.generatedMonth)}`);
  if (a.processingUsage) lines.push(`Processing tokens: ${tokenLabel(a)} — ${text(a.processingUsage.note)}`);
  if (others.length) lines.push('', `Compare: ${others.map(e => `[${text(e.title)}](${e.slug}.md)`).join(' · ')}`);
  lines.push('', '## Overview', '', ...a.overview.flatMap(p => [text(p), '']));
  if (a.visualSummary) lines.push('### What the snapshots add', '', ...a.visualSummary.map(p => `- ${text(p)}`), '');
  lines.push('## Key takeaways', '');
  for (const t of a.takeaways) lines.push(`- **${text(t.title)}** ${text(t.text)}`);
  for (const c of a.sections) {
    lines.push('', `## ${text(c.title)}`, '', `Source timestamp: ${jump(c.start)}`, '', ...c.paragraphs.flatMap(p => [text(p), '']));
    if (c.bullets) lines.push(...c.bullets.map(p => `- ${text(p)}`), '');
    for (const f of c.figures || []) {
      const frame = frames.find(frame => frame.time === f.time);
      lines.push(`![${text(frame.alt)}](../assets/${s.slug}/${frame.file})`, '', `${jump(f.time)} — ${text(f.caption)}`, '');
    }
  }
  lines.push('## Source and limitations', '', ...a.limitations.map(p => `- ${text(p)}`), '',
    `[Timestamped source captions](../../sources/${s.slug}/source.json)`);
  if (a.basis === 'captions-and-frames') lines.push(`[Snapshot observations](../../sources/${s.slug}/visuals.json)`);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

const shell = (title, prefix, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${html(title)} · Witness</title>
<link rel="stylesheet" href="${prefix}assets/reading.css"></head><body id="top">
<a class="skip" href="#main">Skip to reading</a>${body}
<footer class="site-footer"><span>Witness / Video, in words.</span><a href="#top">Back to top ↑</a></footer></body></html>\n`;

export function renderArticle(a, s, { frames = [], editions = [] } = {}) {
  validateArticle(a, s, frames);
  const jump = (start, label = stamp(start)) => `<a class="timestamp" href="${html(youtube(s.videoId, start))}" aria-label="Watch at ${stamp(start)}">${html(label)} ↗</a>`;
  const toc = `<li><a href="#overview">Overview</a></li><li><a href="#takeaways">Key takeaways</a></li>${a.sections.map((c, i) => `<li><a href="#${c.id}"><span class="toc-number">${String(i + 1).padStart(2, '0')}</span>${html(c.title)}</a></li>`).join('')}<li><a href="#source">Source &amp; limitations</a></li>`;
  return shell(a.title, '../', `
<header class="site-header"><a class="wordmark" href="../index.html">witness<span class="mark">.</span></a><a href="../index.html">← Reading library</a></header>
<main id="main">
<div class="article-heading"><p class="eyebrow">${a.basis === 'captions-and-frames' ? 'Captions + selected frames' : 'Captions only'}${s.captions.kind === 'automatic' ? ' · Auto-caption source' : ''}</p>
<h1>${html(a.title)}</h1><p class="dek">${html(a.dek)}</p>
<div class="metadata"><span>${html(s.channel)}</span>${s.published ? `<span>Published ${html(s.published)}</span>` : ''}<span>${stamp(s.duration)} video</span><span>~${readingMinutes(a)} min read</span></div>
${a.processingUsage ? `<p class="processing-usage">Processing tokens: ${tokenLabel(a)}. ${html(a.processingUsage.note)}</p>` : ''}
<a class="source-link" href="${html(s.url)}">Original video ↗</a> · <a class="source-link" href="${a.slug}.md">Markdown edition</a>
${editions.length > 1 ? `<nav class="edition-switch" aria-label="Compare reading editions"><span>Compare editions</span>${editions.map(e => e.slug === a.slug ? `<strong aria-current="page">${e.basis === 'captions' ? 'Captions only' : 'With slide analysis'}</strong>` : `<a href="${e.slug}.html">${e.basis === 'captions' ? 'Captions only' : 'With slide analysis'}</a>`).join('')}</nav>` : ''}</div>
<div class="reading-layout"><aside class="contents">${tags(a)}<details open><summary>On this page</summary><nav aria-label="Contents"><ol>${toc}</ol></nav></details></aside>
<article class="prose"><section id="overview" class="overview"><p class="eyebrow">Start here</p><h2>The overview</h2>${paragraphs(a.overview)}${a.visualSummary ? `<div class="visual-summary"><h3>What the snapshots add</h3>${list(a.visualSummary)}</div>` : ''}</section>
<section id="takeaways" class="takeaways"><h2>What to take away</h2><ol>${a.takeaways.map(t => `<li><strong>${html(t.title)}</strong><p>${html(t.text)}</p></li>`).join('')}</ol></section>
<div class="body-label"><span>The full reading</span><span>${a.sections.length} sections</span></div>
${a.sections.map((c, i) => `<section id="${c.id}" class="chapter"><div class="chapter-meta"><span>${String(i + 1).padStart(2, '0')}</span>${jump(c.start)}</div><h2>${html(c.title)}</h2>${paragraphs(c.paragraphs)}${c.bullets ? list(c.bullets) : ''}${(c.figures || []).map(f => { const frame = frames.find(frame => frame.time === f.time); return `<figure><a href="../assets/${s.slug}/${frame.file}"><img src="../assets/${s.slug}/${frame.file}" alt="${html(frame.alt)}" loading="lazy" width="1280" height="720"></a><figcaption>${jump(f.time)} ${html(f.caption)}</figcaption></figure>`; }).join('')}</section>`).join('\n')}
<section id="source" class="source-notes"><h2>Source &amp; limitations</h2><p>This is an editorial synthesis of <a href="${html(s.url)}">${html(s.title)}</a>, published by ${html(s.channel)}. Timestamp links open YouTube at the corresponding section.</p>${list(a.limitations)}
${a.basis === 'captions-and-frames' ? `<details class="visual-evidence"><summary>Inspected snapshots (${a.visualEvidence.length})</summary><p>Selected stills, not continuous video review. Observations below describe the inspected frames.</p>${a.visualEvidence.map(time => { const f = frames.find(f => f.time === time); return `<div><h3>${jump(time)}</h3>${list(f.observations)}</div>`; }).join('')}</details>` : ''}
<details class="transcript"><summary>Read the timestamped source captions</summary><p class="caption-note">${html(s.captions.language)} · ${html(s.captions.kind)} captions. Caption errors and non-speech labels are retained in this source view.</p>${s.segments.map(c => `<p>${jump(c.start)} <span>${html(c.text)}</span></p>`).join('\n')}</details></section>
</article></div></main>${a.sections.some(section => section.figures?.length) ? '\n<script src="../assets/images.js" defer></script>' : ''}`);
}

export function renderIndex(entries) {
  entries = [...entries].sort((a, b) =>
    (Date.parse(b.article.processedAt || `${b.article.generatedMonth}-01T00:00:00Z`) || 0) -
    (Date.parse(a.article.processedAt || `${a.article.generatedMonth}-01T00:00:00Z`) || 0) || a.source.title.localeCompare(b.source.title) || a.article.title.localeCompare(b.article.title));
  const topics = [...new Set(entries.flatMap(e => e.article.topics || []))].sort((a, b) => a.localeCompare(b));
  const months = [...new Set(entries.map(e => e.article.generatedMonth).filter(Boolean))].sort().reverse();
  const choices = (values, name, label) => values.map(value => `<label class="filter-choice"><input type="checkbox" name="${name}" value="${html(value)}"> ${html(label(value))}</label>`).join('');
  return shell('Reading library', '', `
<header class="site-header"><a class="wordmark" href="index.html">witness<span class="mark">.</span></a><span class="header-note">A personal reading library</span></header>
<main id="main" class="library"><details class="quick-readings" open><summary>All readings · newest first</summary><ul>${entries.map(({ article: a, source: s }) => `<li><a href="videos/${a.slug}.html">${html(s.title)}</a><span>${html(processedLabel(a))}</span></li>`).join('')}</ul>${entries.length ? '' : '<p>No readings yet.</p>'}</details>
<p class="eyebrow">Video, in words</p><h1>Less watching.<br>More understanding.</h1>
<p class="dek">The substance of a video, shaped for reading. Start with the essentials, stay for the explanation, jump back when you need to.</p>
<div class="library-label"><h2>Your reading</h2><span id="edition-count" role="status" aria-live="polite">${entries.length} ${entries.length === 1 ? 'edition' : 'editions'}</span></div>
<div class="library-layout"><aside class="library-filters" hidden><form id="library-filters"><h3>Filter your reading</h3><fieldset><legend>Topic</legend>${choices(topics, 'topic', value => value)}</fieldset><fieldset><legend>Generated</legend>${choices(months, 'month', monthLabel)}</fieldset><button type="reset">Clear filters</button></form></aside>
<div class="editions">${entries.map(({ article: a, source: s }, i) => `<article class="edition" data-topics="${html(JSON.stringify(a.topics || []))}" data-month="${html(a.generatedMonth || '')}"><span class="edition-number">${String(i + 1).padStart(2, '0')}</span><div><p class="eyebrow">Processed ${html(processedLabel(a))} · ${html(s.channel)} · ${a.basis === 'captions-and-frames' ? 'With slide analysis' : 'Captions only'} · ${stamp(s.duration)} video · ~${readingMinutes(a)} min read</p><h3><a href="videos/${a.slug}.html">${html(s.title)}</a></h3>${tags(a)}<p>${html(a.dek)}</p><a class="read-link" href="videos/${a.slug}.html">Read the edition →</a></div></article>`).join('\n') || '<p>Process a YouTube link with the process-video skill to add your first reading.</p>'}<p id="no-results" hidden>No readings match these filters. Try another topic or clear the filters.</p></div></div>
<script src="assets/library.js" defer></script>
<p class="library-note">Each edition includes an overview, a detailed article, and links to the source. Everything on these pages can be read without playing a video.</p></main>`);
}
