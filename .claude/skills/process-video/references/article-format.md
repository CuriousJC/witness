# Article format

One JSON record per reading edition in `articles/<reading-title-slug>.json`, UTF-8. All prose is plain text;
the renderer escapes it. Paragraphs are separate strings. No HTML or Markdown markup.

```json
{
  "videoId": "eA4VxgsWDoc",
  "title": "A descriptive reading title",
  "slug": "a-descriptive-reading-title",
  "basis": "captions",
  "topics": ["Game marketing", "Trailers"],
  "generatedMonth": "2026-11",
  "processedAt": "2026-11-02T10:00:00-05:00",
  "processingUsage": {
    "totalTokens": null,
    "note": "Exact per-video model token usage was not available during processing."
  },
  "dek": "One sentence explaining the subject and the value of reading it.",
  "overview": ["A short orientation paragraph."],
  "takeaways": [
    {"title": "A concrete insight", "text": "The explanation or implication."}
  ],
  "sections": [
    {
      "id": "a-stable-section-anchor",
      "title": "An informative heading",
      "start": 0,
      "end": 2424,
      "paragraphs": ["The substantive explanation.", "An example and its caveats."],
      "bullets": ["An optional practical detail."]
    }
  ],
  "limitations": ["Based on English automatic captions; visual demonstrations were not inspected."]
}
```

`start` and `end` are seconds in the source. Sections are contiguous in source order,
beginning at zero and ending at the source duration (within two seconds). Choose meaningful
boundaries rather than fixed intervals. Each section needs at least one paragraph; `bullets`
is optional. Anchors use lowercase letters, digits, and hyphens. Titles and anchors are unique
within an article. `takeaways`, `overview`, and `limitations` are nonempty arrays.

Metadata, channel, upload date, duration, and caption provenance come from
`sources/<video-title-slug>/source.json`; don't duplicate them in the article. Both source and
article slugs are their titles lowercased, with accents normalized and punctuation/spaces
replaced by hyphens (see `slugify` in `tools/core.mjs`). Filenames must match slugs. The build calculates
reading time from the prose at 230 words/minute. The raw caption text remains available
offline in an expandable section below the article, linked to its original timestamps.

New readings include exactly two distinct, concise `topics` and a `generatedMonth` in
`YYYY-MM` form. Reuse topic wording across related readings for useful library filters.
The month records first generation in the user's timezone, independently of video publication;
preserve it when revising an article or rebuilding output. Legacy records may omit these
fields until their generation month is known; do not invent a historical month.

`processedAt` records first generation as an ISO date/time with timezone, preserved on
revisions and rebuilds. It determines descending order in both index lists, including order
within a day. Display dates use America/New_York. Older records without a timestamp fall back
to their known generation month, without inventing a day. When backfilling, use recorded
processing history or original article-file creation times if trustworthy; do not use rebuild times.

`processingUsage.totalTokens` is a positive integer, or `null` when no defensible count is
available. Set `estimated: true` for a rough estimate; omit it or use `false` for reported
usage. HTML and Markdown visibly distinguish estimates. The required `note` explains the
measurement or estimation method, scope, and exclusions. A visible-work estimate can count
guidance, evidence, authored text/code, and tool text at roughly four characters per token;
round coarsely and disclose that image tokens, context replay, and hidden reasoning are
excluded. This is a workload proxy, not complete billed usage. Do not label transcript or
article size alone as total processing. Shared batch overhead needs explicit attribution.
Existing records may retain unavailable counts. Preserve counts on rebuild and distinguish
later revision work from original processing.

The build also writes `docs/videos/<reading-title-slug>.md` from the same JSON record. Prefer
that file when reading an edition for context. Markdown preserves prose, timestamp links,
figures, and limitations; raw caption and observation records are linked rather than repeated.
Edit the article JSON and rebuild to keep both formats synchronized.

## Visual editions

Use `basis: "captions-and-frames"` and a nonempty `visualEvidence` list of inspected whole-second
timestamps. An optional `visualSummary` list of strings explains what the snapshots add.
Each section may include `figures: [{"time": 1880, "caption": "The useful detail this frame shows."}]`.
Figure times must fall within that section and appear in `visualEvidence`.

`sources/<video-title-slug>/visuals.json` holds the evidence:

```json
{
  "videoId": "eA4VxgsWDoc",
  "frames": [
    {
      "time": 1880,
      "file": "frames/frame-00-31-20.jpg",
      "observations": ["A factual observation recorded after viewing the image."],
      "alt": "A concise description of the visible slide."
    }
  ]
}
```

The frame tool creates records with empty observations. Fill them only after inspection.
The build rejects unreviewed references, missing evidence files, and figures without alt text.
It copies reproduced frames into `docs/assets/<video-title-slug>/frames/` for offline reading.
Caption-only editions use `basis: "captions"` and do not claim visual evidence even if the shared
source folder has reviewed frames. Two editions can share a video ID; their article slugs differ.
