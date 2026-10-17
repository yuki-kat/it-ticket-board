"""Fit a video to a song: each scene starts just before its sung line, then the song plays underneath.

The song's line timings come from its embedded subtitle track (Suno exports one) or from --cues. Scenes are never
slowed below MIN_SPEED; any time left over holds the scene's last frame, which reads as a natural pause during an
instrumental gap. The video fades out over the song's last 1.2 seconds.

Usage:
  python fit_to_song.py VIDEO SONG OUT --scenes 0,4.3,11.16,... [--cues 0.24,4.31,...] [--total 73.12]

  --scenes  start of each scene in VIDEO (first is 0), plus its end as the last value
  --cues    when each scene's line starts in SONG (default: the subtitle cues, in order)
  --total   output length (default: the song's length)
"""
import argparse, os, re, shutil, subprocess, sys

LEAD = 0.25        # scene appears this long before its line
MIN_SPEED = 0.85   # never slower than this
FF = os.environ.get('FFMPEG') or shutil.which('ffmpeg') or 'ffmpeg'


def song_cues(song):
    srt = subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-i', song, '-map', '0:s:0', '-f', 'srt', '-'],
                         capture_output=True, text=True).stdout
    starts, texts = [], []
    for block in srt.strip().split('\n\n'):
        lines = block.strip().split('\n')
        if len(lines) < 3: continue
        h, m, s = re.match(r'(\d+):(\d+):([\d,]+)', lines[1]).groups()
        starts.append(int(h) * 3600 + int(m) * 60 + float(s.replace(',', '.')))
        texts.append(' '.join(lines[2:]))
    return starts, texts


def duration(path):
    out = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video'); ap.add_argument('song'); ap.add_argument('out')
    ap.add_argument('--scenes', required=True); ap.add_argument('--cues'); ap.add_argument('--total', type=float)
    a = ap.parse_args()
    orig = [float(x) for x in a.scenes.split(',')]
    n = len(orig) - 1
    if a.cues:
        cues = [float(x) for x in a.cues.split(',')]
    else:
        cues, texts = song_cues(a.song)
        print('song lines:'); [print(f'  {c:6.2f}s  {t[:90]}') for c, t in zip(cues, texts)]
        # Lines containing table syntax or timestamps were probably sung as written: warn, don't guess.
        bad = [t for t in texts if re.search(r'\|\s*\d+:\d\d|^File\s+Time|On screen', t)]
        if bad: print(f'WARNING: {len(bad)} lyric line(s) contain table text, which may have been sung:', *[f'  {t[:70]}' for t in bad], sep='\n')
    if len(cues) < n:
        sys.exit(f'{len(cues)} cues for {n} scenes: pass --cues with one start time per scene')
    total = a.total or duration(a.song)
    new = [0.0] + [c - LEAD for c in cues[1:n]] + [total]
    parts = []
    for k in range(n):
        src = orig[k + 1] - orig[k]; tgt = new[k + 1] - new[k]
        if tgt <= 0: sys.exit(f'scene {k}: target length {tgt:.2f}s; check the cue order')
        speed = max(src / tgt, MIN_SPEED); hold = max(0.0, tgt - src / speed)
        chain = f'[0:v]trim=start={orig[k]}:end={orig[k + 1]},setpts=(PTS-STARTPTS)/{speed:.5f},fps=25'
        if hold > 0.02: chain += f',tpad=stop_mode=clone:stop_duration={hold:.3f}'
        parts.append(chain + f'[v{k}]')
        print(f'scene {k}: {orig[k]:.2f}-{orig[k + 1]:.2f} -> {new[k]:.2f}-{new[k + 1]:.2f}  speed x{speed:.2f}  hold {hold:.2f}s')
    vf = ';'.join(parts) + ';' + ''.join(f'[v{k}]' for k in range(n)) + f'concat=n={n}:v=1:a=0,fade=t=out:st={total - 1.2:.2f}:d=1.2[v]'
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', a.video, '-i', a.song, '-filter_complex', vf,
                    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                    '-r', '25', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', f'{total}', '-movflags', '+faststart', a.out], check=True)
    print('wrote', a.out)


if __name__ == '__main__':
    main()
