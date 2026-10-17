"""Launch-trailer bed for the Binboard videos: dark D-minor drone, driving synth-bass pulse, risers into scene cuts,
impacts on the cuts, and a big D-major reveal on the offer / end card. Additive synthesis only (no samples).
Usage: music3.py sales|oss <out.wav>"""
import sys, wave
import numpy as np

SR = 48000
BEAT = 0.5          # 120 BPM
rng = np.random.default_rng(23)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)

# chord roots / triads (MIDI): D minor world, D major reveal
CH = {'Dm': (38, [50, 53, 57]), 'Bb': (34, [50, 53, 58]), 'F': (41, [48, 53, 57]), 'C': (36, [48, 52, 55]),
      'Gm': (43, [50, 55, 58]), 'A': (45, [49, 52, 57]), 'D': (38, [50, 54, 57])}
# sections: (start, chord, energy) energy: 0 drone, 1 pulse, 2 pulse+kick, 3 full, 'b' breakdown, 'r' reveal
SECTIONS = {
    'sales': (60.04, [(0.0, 'Dm', 0), (4.3, 'Dm', 1), (11.16, 'Bb', 2), (15.0, 'F', 2), (20.04, 'Dm', 3), (24.9, 'C', 3),
                      (29.76, 'Bb', 3), (32.44, 'F', 3), (39.24, 'Dm', 3), (42.8, 'C', 3), (47.84, 'Gm', 'b'), (50.2, 'A', 'b'),
                      (52.2, 'D', 'r')]),
    'oss': (33.64, [(0.0, 'Dm', 0), (3.3, 'Dm', 1), (8.0, 'Bb', 2), (11.3, 'F', 2), (14.6, 'Dm', 3), (19.4, 'C', 3),
                    (22.28, 'Bb', 3), (24.92, 'Gm', 'b'), (26.8, 'A', 'b'), (28.64, 'D', 'r')]),
}
HITS = {'sales': [0.15, 11.16, 20.04, 29.76, 39.24, 52.2], 'oss': [0.15, 8.0, 14.6, 22.28, 28.64]}
BIG = {'sales': 52.2, 'oss': 28.64}

def place(buf, sig, start, g=1.0):
    i = int(round(start * SR))
    if i >= len(buf) or i + len(sig) <= 0: return
    a = max(0, -i); i = max(0, i); j = min(len(buf), i + len(sig) - a)
    buf[i:j] += g * sig[a: a + j - i]

def saw_lp(f, t, cutoff, maxh=40):
    """Band-limited saw through a soft low-pass at `cutoff` Hz (scalar or array over t)."""
    out = np.zeros_like(t)
    for h in range(1, maxh + 1):
        fh = f * h
        if fh > 12000: break
        w = 1 / (1 + (fh / cutoff) ** 4)
        out += w * np.sin(2 * np.pi * fh * t) / h
    return out

def bass_note(note, dur, bright):
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / 0.004) * np.exp(-t / (dur * 0.55))
    cutoff = 300 + 1800 * bright * np.exp(-t / 0.06)
    return env * (saw_lp(midi(note), t, cutoff, 24) + 0.6 * np.sin(2 * np.pi * midi(note) / 2 * t))

def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 45 + 110 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) + 0.15 * rng.standard_normal(len(t)) * np.exp(-t / 0.004)

def hat():
    m = int(0.05 * SR); x = np.diff(np.clip(rng.standard_normal(m + 1), -2.2, 2.2))
    return np.convolve(x, [0.25, 0.5, 0.25], 'same') * np.exp(-np.arange(m) / SR / 0.012)

def impact(big=False):
    d = 3.5 if big else 2.2
    t = np.arange(int(d * SR)) / SR
    f = 32 + 60 * np.exp(-t / 0.12)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (1.1 if big else 0.7))
    nz = rng.standard_normal(len(t)); k = np.exp(-np.arange(200) / 40); k /= k.sum()
    crack = np.convolve(nz, k, 'same') * np.exp(-t / 0.09)
    return boom + 0.5 * crack

def braam(notes, dur, big=False):
    """Brassy low chord with a filter that opens on the hit and slowly closes."""
    t = np.arange(int(dur * SR)) / SR
    cutoff = 250 + (2600 if big else 1500) * np.exp(-t / (1.4 if big else 0.8))
    env = np.minimum(1, t / 0.02) * np.exp(-t / (2.6 if big else 1.4))
    out = np.zeros_like(t)
    for n in notes:
        for det in (0.996, 1.0, 1.004):
            out += saw_lp(midi(n) * det, t, cutoff, 30)
    return env * out / len(notes)

def riser(dur):
    t = np.arange(int(dur * SR)) / SR
    x = rng.standard_normal(len(t)); y = np.zeros_like(x); a = 0.0
    cut = 300 * (8000 / 300) ** (t / dur)                      # low-pass opening 300 Hz -> 8 kHz
    alpha = 1 - np.exp(-2 * np.pi * cut / SR)
    for i in range(len(x)):
        a += alpha[i] * (x[i] - a); y[i] = a
    tone = np.sin(2 * np.pi * np.cumsum(220 * 4 ** (t / dur)) / SR)   # pitch rising two octaves
    env = (t / dur) ** 2.2
    return env * (0.8 * y / (np.abs(y).max() + 1e-9) + 0.25 * tone)

def pad(notes, dur):
    t = np.arange(int((dur + 1.5) * SR)) / SR
    e = np.minimum(1, t / 0.8) * np.clip(1 - (t - dur) / 1.5, 0, 1)
    L = sum(np.sin(2 * np.pi * midi(n + 12) * 1.002 * t) + 0.3 * np.sin(2 * np.pi * midi(n + 24) * t) for n in notes)
    R = sum(np.sin(2 * np.pi * midi(n + 12) * 0.998 * t) + 0.3 * np.sin(2 * np.pi * midi(n + 24) * 1.001 * t) for n in notes)
    return e * L, e * R

def reverb(L, R, rt=2.4, mix=0.35):
    n = len(L); m = int(rt * 1.2 * SR); t = np.arange(m) / SR
    def ir():
        x = rng.standard_normal(m) * np.exp(-6.9 * t / rt); k = np.exp(-np.arange(48) / 5.0); k /= k.sum()
        x = np.convolve(x, k, 'same'); x[: int(0.015 * SR)] = 0; return x / np.sqrt((x ** 2).sum())
    N = 1 << int(np.ceil(np.log2(n + m)))
    wl = np.fft.irfft(np.fft.rfft(L, N) * np.fft.rfft(ir(), N), N)[:n]
    wr = np.fft.irfft(np.fft.rfft(R, N) * np.fft.rfft(ir(), N), N)[:n]
    return L + mix * wl, R + mix * wr

ALL = {'drone', 'bass', 'kick', 'hat', 'pad', 'hits', 'risers'}

def build(which, parts=ALL, norm=True):
    total, secs = SECTIONS[which]
    n = int(total * SR); L = np.zeros(n); R = np.zeros(n)
    for k, (start, name, en) in enumerate(secs):
        end = secs[k + 1][0] if k + 1 < len(secs) else total
        root, tri = CH[name]
        seg = end - start
        # Drone: low root octave, always (dark bed)
        if 'drone' in parts:
            t = np.arange(int((seg + 1.0) * SR)) / SR
            e = np.minimum(1, t / 0.6) * np.clip(1 - (t - seg) / 1.0, 0, 1)
            d = e * saw_lp(midi(root - 12) if root > 36 else midi(root), t, 220, 12)
            place(L, d, start, 0.04); place(R, d, start, 0.04)
        # Pad: higher chord, fades in on busier sections and the reveal
        if 'pad' in parts and en in (2, 3, 'b', 'r'):
            pl, pr = pad(tri, seg)
            g = {2: 0.035, 3: 0.045, 'b': 0.06, 'r': 0.075}[en]
            place(L, pl, start, g); place(R, pr, start, g)
        # Bass pulse: 8ths at energy 1, 16ths at 2-3, restarting exactly on the cut
        if 'bass' in parts and en in (1, 2, 3):
            step = BEAT / 2 if en == 1 else BEAT / 4
            i = 0
            while start + i * step < end - 0.02:
                acc = 1.0 if i % 4 == 0 else 0.7
                s = bass_note(root, step * 0.95, 0.6 if en == 3 else 0.35) * acc
                place(L, s, start + i * step, 0.17); place(R, s, start + i * step, 0.17)
                i += 1
        # Kick on the beat at energy 2+, hats on off-beats at 3
        if 'kick' in parts and en in (2, 3):
            i = 0
            while start + i * BEAT < end - 0.05:
                place(L, kick(), start + i * BEAT, 0.2); place(R, kick(), start + i * BEAT, 0.2); i += 1
        if 'hat' in parts and en == 3:
            i = 0
            while start + (i + 0.5) * BEAT < end - 0.05:
                place(L, hat(), start + (i + 0.5) * BEAT, 0.3); place(R, hat(), start + (i + 0.5) * BEAT + 0.003, 0.3); i += 1
        # Reveal: hold the D major chord, with a slow 8th pulse returning softly
        if 'bass' in parts and en == 'r':
            i = 0
            while start + 1.5 + i * BEAT / 2 < end - 1.0:
                s = bass_note(root, BEAT / 2 * 0.9, 0.25) * 0.6
                place(L, s, start + 1.5 + i * BEAT / 2, 0.11); place(R, s, start + 1.5 + i * BEAT / 2, 0.11); i += 1
    # Impacts and braams on the main cuts; risers leading into them
    big_at = BIG[which]
    for h in HITS[which]:
        big = abs(h - big_at) < 0.01
        name = next(nm for (s, nm, _) in reversed(secs) if s <= h + 0.01)
        root, tri = CH[name]
        if 'hits' in parts:
            place(L, impact(big), h, 0.30 if big else 0.22); place(R, impact(big), h, 0.30 if big else 0.22)
            b = braam([root - 12, root - 5, root, tri[1]] if big else [root - 12, root - 5, root], 4.5 if big else 2.5, big)
            place(L, b, h, 0.16 if big else 0.10); place(R, b * 0.98, h + 0.004, 0.16 if big else 0.10)
        if 'risers' in parts and h > 1:
            dur = 4.2 if big else 1.6
            r = riser(dur); place(L, r, h - dur, 0.56 if big else 0.4); place(R, r, h - dur + 0.002, 0.56 if big else 0.4)
    L, R = reverb(L, R)
    fi, fo = int(0.05 * SR), int(2.5 * SR)
    for ch in (L, R):
        ch[:fi] *= np.linspace(0, 1, fi); ch[-fo:] *= np.linspace(1, 0, fo) ** 1.5
    st = np.stack([L, R], 1)
    if norm: st = st / (np.abs(st).max() / 0.89)
    return st

if __name__ == '__main__':
    which, out = sys.argv[1], sys.argv[2]
    st = build(which)
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(st, -1, 1) * 32767).astype('<i2').tobytes())
    print(out, f'{len(st)/SR:.2f}s')
