# Witness

Witness turns YouTube videos into illustrated reading pages. It is for people who would
rather quickly read the information than watch a video.

Each reading starts with an overview and key takeaways, then develops the material into
a thorough article. Explanations, examples, qualifications, and practical details stay;
spoken filler and repetition go. Selected snapshots illustrate points that depend on
slides or footage, and timestamp links let you jump back to the original video.

## Read

Open [the reading library](docs/index.html) in your browser. The pages work directly from
a checkout, including their images, without a server or JavaScript.

The first reading is Ksenia Koster's Digital Dragons talk about costly mistakes in game
trailers: [webpage](docs/videos/the-seven-costly-mistakes-in-game-trailers-with-slide-analysis.html)
or [Markdown](docs/videos/the-seven-costly-mistakes-in-game-trailers-with-slide-analysis.md).

## Process a video

Open this repository in Claude Code and give it a YouTube link, or invoke the skill:

```text
/process-video https://www.youtube.com/watch?v=eA4VxgsWDoc
```

The [process-video skill](.claude/skills/process-video/SKILL.md) guides the agent through
retrieving captions, reading the full transcript, inspecting selected frames, writing the
article, and building the outputs. Codex can follow the same workflow through [AGENTS.md](AGENTS.md).
The agent does the editorial work; the command-line tools handle acquisition and rendering.
No separate AI API key is required by Witness.

Every article has matching HTML and Markdown editions. Markdown is the preferred format
for an agent reading an existing article. Both formats are generated from the same JSON
record, and the checks detect stale output. Filenames use kebab-case titles.

## Local tools

Reading existing pages requires only a browser. Processing new videos requires:

- Node.js 22 or newer. No npm install is needed.
- yt-dlp for captions and the local video copy used to extract snapshots.
- FFmpeg for snapshot extraction.
- Claude Code or another agent that can read the transcript and inspect local images.

On Windows, with GitHub CLI installed, this installs a checksum-verified yt-dlp executable
under the ignored `.tools/` directory:

```powershell
powershell -ExecutionPolicy Bypass -File tools/setup.ps1
```

FFmpeg and yt-dlp can also be provided on PATH. Downloaded video and temporary files stay
in the ignored `.cache/` directory; source captions, selected frames, and their observations
remain available alongside the article.
Successful builds delete downloaded videos for completed readings. To clear full or partial
video downloads for all saved sources manually, run `node tools/witness.mjs clean-cache`;
add a source slug or YouTube URL to clean just that source. This preserves captions,
selected frames, observations, and readings. New frame selections can download the video again.

## Working on the repository

See [CLAUDE.md](CLAUDE.md) for the file map and working conventions. Edit article content
in `articles/`, rendering in `tools/`, and styles in `web/`; regenerate the output in `docs/`.

```powershell
node tools/witness.mjs build
node tools/witness.mjs check
node --test
```

The readings are editorial syntheses, not verbatim transcripts. Automatic captions can
contain errors, and selected snapshots do not amount to continuous visual review. Each
article records its source limitations and links back to its evidence.

Code is licensed under [Apache 2.0](LICENSE). Source videos and reproduced video frames
belong to their respective rights holders.
