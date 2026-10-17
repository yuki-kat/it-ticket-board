"""Binboard narration: Kokoro-82M voice (Apache-2.0), each line placed on its scene, mixed over the launch-trailer
bed with the music lowered under the voice, then loudness-normalised for YouTube.

Usage (see ../README.md for setup; files are read from and written to the work folder):
  vo.py fetch [voice ...]      download the model and voices from huggingface.co
  vo.py render <voice>         build narr-<voice>-{sales,oss}.wav and the mixed videos
  vo.py check <voice>          transcribe the narration and compare it with the script
"""
import json, os, shutil, subprocess, sys, wave
import numpy as np

# Work folder (see ../README.md): sales-video/, oss-video/ and audio/bed3-*.wav live here; nothing in it is committed.
SCRATCH = os.environ.get('BINBOARD_VIDEO_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work'))
HERE = os.path.join(SCRATCH, 'audio')
FFMPEG = os.environ.get('FFMPEG') or shutil.which('ffmpeg') or os.path.join(SCRATCH, 'ffmpeg')
MODELS = os.path.join(HERE, 'models')
HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main'
SR = 48000

# Script lines (as written in the doc) and the text the voice reads, with pronunciation spelled out.
# Scenes are the cuts measured from the videos.
VIDEOS = {
    'sales': dict(video='sales-video/Binboard-sales-60s.mp4', bed='audio/bed3-sales.wav', total=60.04, lines=[
        (0.0, 4.3, 'Meet Binboard: the IT service desk board your team will love.',
         'Meet Binboard: the IT service desk board your team will love.'),
        (4.3, 11.16, 'Sign in and instantly see what needs attention, from priorities to looming SLA breaches.',
         'Sign in, and instantly see what needs attention, from priorities to looming SLA breaches.'),
        (11.16, 20.04, 'Every ticket carries a live SLA countdown. Work in a list, on a Kanban board, or both side by side.',
         'Every ticket carries a live SLA countdown. Work in a list, on a Kahnbahn board, or both, side by side.'),
        (20.04, 29.76, 'When a ticket needs to move up, the handover is ready: priority, state, owner and every work note in one place, timestamped, and one click to copy into email or Teams.',
         'When a ticket needs to move up, the handover is ready: priority, state, owner, and every work note in one place, timestamped. One click copies it into email or Teams.'),
        (29.76, 39.24, 'Already have an escalation matrix in Excel? Import it, and Binboard routes every ticket type to the right team, with the right contacts and timings.',
         'Already have an escalation matrix in Excel? Import it, and Binboard routes every ticket type to the right team, with the right contacts and timings.'),
        (39.24, 47.84, 'Inventory is built in. Scan a serial number to see the device, its health, and exactly who has it.',
         'Inventory is built in. Scan a serial number to see the device, its health, and exactly who has it.'),
        (47.84, 52.2, 'And your knowledge base grows with every ticket you solve.',
         'And your knowledge base grows with every ticket you solve.'),
        (52.2, 60.04, 'Try Binboard free for six months, with our agents ready 24/7, by phone or remotely. Start your trial today.',
         'Try Binboard free for six months, with our agents ready twenty-four seven, by phone or remotely. Start your trial today.'),
    ]),
    'oss': dict(video='oss-video/Binboard-open-source-30s.mp4', bed='audio/bed3-oss.wav', total=33.64, lines=[
        (0.0, 3.3, 'Meet Binboard, an open-source IT service desk board.',
         'Meet Binboard, an open-source IT service desk board.'),
        (3.3, 8.0, "It's one HTML file. Open it, and it works, even offline.",
         "It's one HTML file. Open it, and it works, even offline."),
        (8.0, 14.6, 'Live SLA timers on every ticket, with Kanban, list and split views.',
         'Live SLA timers on every ticket, with Kahnbahn, list, and split views.'),
        (14.6, 22.28, 'Run escalations from a spreadsheet? Import your Excel matrix, and every ticket type goes to the right team.',
         'Run escalations from a spreadsheet? Import your Excel matrix, and every ticket type goes to the right team.'),
        (22.28, 24.92, 'Bring your own AI: Gemini, OpenAI, Claude, or a local model with Ollama.',
         'Bring your own AI: Gemini, OpenAI, Claude, or a local model with Oh-lama.'),
        (24.92, 28.64, 'Or self-host everything with Docker.',
         'Or self-host everything with Docker.'),
        (28.64, 33.64, "It's MIT licensed. Try the live demo, and star it on GitHub.",
         "It's MIT licensed. Try the live demo, and star it on GitHub."),
    ]),
}
LEAD = 0.30         # voice starts this long after the cut, so the hit lands first
GAP = 0.35          # minimum pause between lines
TAIL = 1.2          # voice must finish this long before the video ends (music fade)
MAX_SPEED = 1.15    # never speed a line up more than this


def fetch(voices):
    os.makedirs(MODELS, exist_ok=True)
    files = [('onnx/model.onnx', 'model.onnx'), ('config.json', 'config.json')] + [(f'voices/{v}.bin', f'{v}.bin') for v in voices]
    for remote, local in files:
        dest = os.path.join(MODELS, local)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            continue
        print('downloading', remote)
        subprocess.run(['curl', '-fL', '--retry', '3', '-o', dest + '.part', f'{HF}/{remote}'], check=True)
        os.replace(dest + '.part', dest)
    # kokoro-onnx wants one .npz of voices, each (510, 1, 256)
    arrays = {v: np.fromfile(os.path.join(MODELS, f'{v}.bin'), dtype=np.float32).reshape(-1, 1, 256) for v in voices}
    np.savez(os.path.join(MODELS, 'voices.npz'), **arrays)
    print('voices:', {k: a.shape for k, a in arrays.items()})


def read_wav(path):
    w = wave.open(path); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, w.getnchannels()) / 32768
    return x, w.getframerate()


def write_wav(path, x, sr):
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    with wave.open(path, 'wb') as w:
        w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def to48k(x, sr):
    tmp_in, tmp_out = os.path.join(HERE, '_rs_in.wav'), os.path.join(HERE, '_rs_out.wav')
    write_wav(tmp_in, x, sr)
    subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp_in, '-ar', str(SR), '-af', 'aresample=resampler=soxr', tmp_out], check=True)
    y, _ = read_wav(tmp_out); os.remove(tmp_in); os.remove(tmp_out)
    return y[:, 0]


def lufs(path):
    out = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    summ = out[out.rfind('Summary'):]
    i = float(summ.split('I:')[1].split('LUFS')[0]); p = float(summ.split('Peak:')[1].split('dBFS')[0])
    return i, p


def render(voice):
    from kokoro_onnx import Kokoro
    os.makedirs(HERE, exist_ok=True)
    tts = Kokoro(os.path.join(MODELS, 'model.onnx'), os.path.join(MODELS, 'voices.npz'))
    report = {}
    for name, v in VIDEOS.items():
        total = v['total']; n = int(total * SR)
        narr = np.zeros(n); placed = []; prev_end = 0.0
        for k, (s0, s1, _shown, said) in enumerate(v['lines']):
            limit = (v['lines'][k + 1][0] if k + 1 < len(v['lines']) else total - TAIL)
            start = max(s0 + LEAD, prev_end + GAP)
            speed = 1.0
            while True:
                audio, sr = tts.create(said, voice=voice, speed=speed, lang='en-us')
                y = to48k(np.asarray(audio, dtype=np.float64), sr)
                dur = len(y) / SR
                if start + dur <= limit + 0.05 or speed >= MAX_SPEED:
                    break
                speed = min(MAX_SPEED, round(speed * (limit - start) / dur * 0.99 + 0.005, 3) if dur > 0 else speed)
                speed = max(speed, 1.0)
            i = int(start * SR); j = min(n, i + len(y)); narr[i:j] += y[: j - i]
            prev_end = start + dur
            placed.append(dict(line=k + 1, scene=f'{s0:.2f}-{s1:.2f}', start=round(start, 2), end=round(prev_end, 2),
                               speed=speed, over_scene=round(max(0.0, prev_end - s1), 2), over_limit=round(max(0.0, prev_end - limit), 2)))
        report[name] = placed
        # Narration alone, for the transcript check and loudness
        npath = os.path.join(HERE, f'narr-{voice}-{name}.wav'); write_wav(npath, narr, SR)
        vi, _ = lufs(npath)
        voice_gain = 10 ** ((-16.0 - vi) / 20)                       # narration at about -16 LUFS
        bed, _ = read_wav(os.path.join(SCRATCH, v['bed']))
        bed = bed[:n]; bed = np.pad(bed, ((0, n - len(bed)), (0, 0)))
        # Duck: an envelope that follows the voice (60 ms attack, 450 ms release), music 11 dB lower under speech
        lvl = np.abs(narr); win = int(0.02 * SR)
        lvl = np.convolve(lvl, np.ones(win) / win, 'same')
        active = (lvl > 10 ** (-45 / 20) * np.abs(narr).max()).astype(float)
        env = np.zeros(n); a_up = 1 - np.exp(-1 / (0.06 * SR)); a_dn = 1 - np.exp(-1 / (0.45 * SR)); e = 0.0
        for t in range(n):                                          # one-pole follower, ~2.9M steps
            e += (a_up if active[t] > e else a_dn) * (active[t] - e); env[t] = e
        music_gain = 10 ** (-4 / 20) * (1 - (1 - 10 ** (-11 / 20)) * env)
        mix = bed * music_gain[:, None] + (narr * voice_gain)[:, None]
        pre = os.path.join(HERE, f'_mix-{voice}-{name}.wav'); write_wav(pre, mix / max(1.0, np.abs(mix).max() / 0.98), SR)
        # Two-pass loudnorm to -14 LUFS, true peak -1 dBTP
        meas = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', pre, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
        m = json.loads(meas[meas.rfind('{'):])
        final = os.path.join(HERE, f'mix-{voice}-{name}.wav')
        af = (f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample={SR}")
        subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', pre, '-af', af, final], check=True)
        os.remove(pre)
        out = os.path.join(SCRATCH, os.path.dirname(v['video']), os.path.basename(v['video']).replace('.mp4', f'-voiced-{voice}.mp4'))
        subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(SCRATCH, v['video']), '-i', final,
                        '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], check=True)
        fi, fp = lufs(out)
        print(f'{name}: {out}  {fi:.1f} LUFS, peak {fp:.1f} dBFS')
        for p in placed:
            flag = '  <-- runs past its scene' if p['over_scene'] > 0.05 else ''
            print(f"   line {p['line']}: scene {p['scene']}  voice {p['start']}-{p['end']}s  speed {p['speed']}{flag}")
    json.dump(report, open(os.path.join(HERE, f'placement-{voice}.json'), 'w'), indent=1)


def check(voice):
    import re
    from faster_whisper import WhisperModel
    model = WhisperModel('small.en', device='cpu', compute_type='int8')
    norm = lambda s: re.sub(r'[^a-z0-9 ]', ' ', s.lower().replace('24/7', 'twenty four seven')).split()
    for name, v in VIDEOS.items():
        segs, _ = model.transcribe(os.path.join(HERE, f'narr-{voice}-{name}.wav'), language='en', beam_size=5)
        heard = ' '.join(s.text for s in segs)
        want = norm(' '.join(l[2] for l in v['lines'])); got = norm(heard)
        import difflib
        sm = difflib.SequenceMatcher(None, want, got)
        diffs = [(' '.join(want[a:b]), ' '.join(got[c:d])) for op, a, b, c, d in sm.get_opcodes() if op != 'equal']
        print(f'== {name}: {sm.ratio():.3f} word match; heard:\n{heard.strip()}')
        for w, g in diffs:
            print(f'   script "{w}"  ->  heard "{g}"')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'fetch':
        fetch(sys.argv[2:] or ['af_heart', 'am_michael'])
    elif cmd == 'render':
        render(sys.argv[2])
    elif cmd == 'check':
        check(sys.argv[2])
