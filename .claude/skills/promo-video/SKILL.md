---
name: promo-video
description: Make, re-cut, re-score or re-voice Binboard promo videos (the 60s sales demo, the 34s open-source showcase, the 1:41 guided tour, or a new one) end to end. Records the board with Playwright using sample data, encodes 1080p, measures the scene cuts, puts audio behind the video (original music generated in code, a song the user supplies such as a Suno track, or narration), checks everything numerically, and delivers. Use this whenever the user asks for a demo, promo, launch, marketing, sales, YouTube or walkthrough video, a voiceover, music behind a video, a song fitted to a video, or a new length, cut or style of an existing one, even casually ("make a quick demo so I can present it", "use this track behind the video", "make it like a product launch").
---

# Binboard promo videos

The user presents and publishes these videos, so they need to look finished. The audio has to be safe to use commercially: the sales video is commercial, and the videos go on YouTube. You can't hear audio, so every audio claim must rest on a measurement, and the user always gets the last listen.

## What already exists

The kit lives on branch `marketing/video-kit` in `marketing/video/`. Its README has setup and exact commands.

| Piece | What it does |
| --- | --- |
| `record/record-sales.mjs`, `record-oss.mjs`, `record-tour.mjs` | Drive the built `index.html`, drawing captions, title cards and a cursor into the page. They save a `.webm` and `marks.json` |
| `audio/music3.py` | Original launch-trailer music (D minor, 120 BPM pulse, risers into cuts, hits on cuts, D major reveal on the offer card). Each video has a `SECTIONS`/`HITS`/`BIG` entry |
| `audio/vo.py` | Kokoro-82M narration (Apache-2.0): places each line on its scene, lowers the music under it, normalises to -14 LUFS, and checks the wording with speech-to-text. Needs huggingface.co |
| `text/` | The narration script, and clean lyric sheets for Suno |

The scripts in this skill:
- `scripts/cuts.sh <video> [threshold] [sheet.png]`: scene-cut times, plus a one-frame-per-second contact sheet.
- `scripts/fit_to_song.py VIDEO SONG OUT --scenes ...`: retimes a video so each scene starts as its line is sung. It reads the timings from the song's embedded lyrics and warns when the lyrics contain table text.
- `scripts/check.sh <video>`: decode check, streams, loudness and peak.

## The loop

1. **Pin down the ask** in one short question if it's open: which video, rough length, aspect (16:9, or 9:16 for Shorts), audience, and audio source (original music, the user's song, narration, or captions only). For a quick presentation demo, an existing video plus captions and music is the fastest answer; offer it.
2. **Record** from a fresh build (`cd app && npm run build:page`) that includes the features being shown. Copy a recorder and edit its scenes: one `mark('scene')` per chapter, captions at the start of their scene and never ahead of it, `hold()` long enough to read (about 2.5–3.5 s per caption).
3. **Encode**: `-ss 1.5` to drop browser start-up, `scale=1920:1080:flags=lanczos`, libx264 CRF 18, 25 fps, a silent AAC track. The README has the exact command.
4. **Measure the cuts** with `cuts.sh`, and look at the contact sheet. Marks fire when the cursor starts moving, so real cuts land up to about 2 s later. Time audio to the measured cuts, never to the marks. Fades and similar-looking pages score low: rerun with threshold 0.08, or grab frames around the cut.
5. **Audio**, one of these:
   - **Original music:** add a section to `music3.py` from the measured cuts (energy 0 = drone, 1 = pulse, 2 = with kick, 3 = full, `'b'` = breakdown before the reveal, `'r'` = reveal), then mux it in.
   - **The user's song:** `fit_to_song.py` with the original scene starts. It never slows a scene below 0.85×; the rest is a held frame during instrumental gaps. Read its lyric printout and warnings before delivering.
   - **Narration:** `vo.py fetch`, then `render <voice>`, then `check <voice>`. Fix any line flagged as running past its scene, or that differs in the transcript, by rewording the spoken text, never the screen.
6. **Check**: `check.sh` on the result, plus full-size frames at the key moments (`ffmpeg -ss T -frames:v 1`). Read them yourself: overlapping captions, a modal covering the feature, a clipped card.
7. **Deliver** the video with `SendUserFile`, plus a short markdown file with chapters and captions (speaker cues), and YouTube chapters when every chapter is at least 10 s. Say plainly what you measured and that they need to listen once.
8. **Save the source** (recorder changes, music sections) to `marketing/video-kit`. Never commit videos, audio or models: `work/` is git-ignored. Ask before pushing to any other branch.

## Traps already hit (and why)

- **Record at the video size:** viewport 1440×810 with deviceScaleFactor 1, `recordVideo.size` the same, then upscale in ffmpeg. With a device scale factor other than 1, Playwright pads the frame and the video gets a grey border.
- **Overlay CSS class names:** prefix them with `demo-`. A card class named `.brand` collided with the app's own `.brand` styles.
- **Sample data only:** the escalation workbook is `tests/fixtures/escalation-matrix-sample.xlsx` (made-up Northwind data). Never record, commit or screenshot the user's real VW workbook; it has real people's details.
- **Mocking the AI:** the tour and open-source recorders serve the page on 127.0.0.1:4192 and mock `/api/**`. Playwright runs the most recently registered matching route first, so register specific mocks such as `/api/ai/kb-ask` after the catch-all.
- **Escalate:** the Escalate button opens an Outlook draft in a new window, which never shows in the recording. Show escalation through the work-notes handover instead.
- **Lyrics:** when the user pastes a script table into Suno, the headers, timestamps and scene names get sung. Give them a clean lyric sheet (`text/Binboard-Suno-lyrics.md`); `fit_to_song.py` warns when it sees table text.
- **Measuring music without hearing it:** render each part on its own and compare levels and the spectrum. The first mix put half its energy below 100 Hz, which laptop speakers can't play. Short noise bursts (hats) can set the peak level, so look at per-part peaks too.
- **Measuring narration:** the TTS reads acronyms (SLA, IT, AI, OpenAI, HTML, MIT) correctly as written. Spacing out letters makes it worse, because "S L A" turns the A into "uh". Spell out only "24/7" ("twenty-four seven") and Ollama ("Oh-lama").

## Rights (check before delivering anything public)

- `music3.py` output is original: nothing to license.
- **Kokoro voice:** Apache-2.0, which allows commercial use. Credit it as "Narration: AI-generated voice" in the YouTube description.
- **Suno songs:** commercial use only if made and downloaded on Pro or Premier. Free-plan songs are personal, non-commercial only, and upgrading later doesn't add rights to them. Ask; never assume.
- **macOS `say` voices:** personal, non-commercial licence. Never use them in these videos.
