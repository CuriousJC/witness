# Article format

One JSON record per reading edition in `articles/<reading-title-slug>.json`, UTF-8. All prose is plain text;
the renderer escapes it. Paragraphs are separate strings. No HTML or Markdown markup.

```json
{
  "videoId": "eA4VxgsWDoc",
  "title": "A descriptive reading title",
  "slug": "a-descriptive-reading-title",
  "basis": "captions",
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
