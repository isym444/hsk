#!/usr/bin/env python3
"""End-to-end extraction of per-question clips from the HSK4 listening MP3s.

Pipeline
--------
1. decode each MP3 to 16 kHz mono PCM
2. find speech blocks (runs separated by the >=4 s answer pauses)
3. transcribe each block with whisper.cpp (cached in tx/)
4. map blocks -> question numbers (fixed for all three papers)
5. compute, from the PCM + whisper segment times, the exact span that carries
   one question, and cut it with ffmpeg to clips/<paper>_q<NN>.mp3

Usage
-----
    python3 scripts/extract-listening-clips.py public/audio

Requires `ffmpeg`, `ffprobe` and `whisper-cli` (Homebrew `whisper-cpp`), plus the
three source MP3s. Point SRC at them (or set HSK_AUDIO_DIR); the transcriptions
are cached in `scripts/.cache/tx/`, so re-running after a boundary tweak only
re-cuts the audio.

To check the result, transcribe the cut clips and score them against the
transcripts in `src/app/data/*.data.ts`:

    python3 scripts/verify-listening-clips.py
"""
import array
import json
import math
import os
import re
import subprocess
import sys

# The three official recordings. Put them anywhere and set HSK_AUDIO_DIR, or
# drop them next to this script.
AUDIO_DIR = os.environ.get('HSK_AUDIO_DIR', os.path.dirname(os.path.abspath(__file__)))
SRC = {p: os.path.join(AUDIO_DIR, '%s.mp3' % p) for p in ('H41001', 'H41002', 'H41003')}
WHISPER = os.environ.get('WHISPER_CLI', 'whisper-cli')
MODEL = os.environ.get('WHISPER_MODEL', os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                     '.cache', 'models', 'ggml-large-v3-turbo.bin'))

SR = 16000
STEP = 0.01                      # analysis frame
SIL_TH = -55.0                   # dB: below this a frame is silence
MIN_SPEECH = 0.06                # s: ignore shorter speech blips
BLOCK_GAP = 4.0                  # s: silence that separates blocks

# block -> (question number, part).  Verified against the transcriptions.
#   b40 = passage + Q36      b41 = Q37 only
#   b42 = passage + Q38      b43 = Q39 only   ... and so on to b50 = Q45
LAYOUT = []
LAYOUT.append((1, None))                       # paper intro
LAYOUT.append((2, None))                       # worked example
for n in range(1, 11):
    LAYOUT.append((n + 2, (n, 1)))             # b03..b12 -> part 1 Q1..Q10
LAYOUT.append((13, None))                      # part 2 intro + example
for n in range(11, 26):
    LAYOUT.append((n + 3, (n, 2)))             # b14..b28 -> part 2 Q11..Q25
LAYOUT.append((29, None))                      # part 3 intro + example
for n in range(26, 36):
    LAYOUT.append((n + 4, (n, 3)))             # b30..b39 -> part 3 Q26..Q35
for n in range(36, 46):
    LAYOUT.append((40 + (n - 36), (n, 4)))     # b40 -> Q36 ... b50 -> Q45

INTRO_RE = re.compile(r'^(现在开始第|第\s*\d+\s*到\s*\d+\s*题|[以第]\s*\d+\s*到\s*\d+\s*题|第[一二三四]部分)')


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw).stdout


def pcm_of(path):
    raw = run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'])
    a = array.array('h')
    a.frombytes(raw)
    return a


def frame_db(a):
    n = int(SR * STEP)
    out = []
    for i in range(0, len(a) - n, n):
        s = sum(v * v for v in a[i:i + n])
        out.append(20 * math.log10(max(math.sqrt(s / n), 1e-6) / 32768))
    return out


def regions(db, t0):
    """(speech, silence) region lists in absolute seconds."""
    runs, cur, st = [], db[0] > SIL_TH, 0
    for i, d in enumerate(db):
        v = d > SIL_TH
        if v != cur:
            runs.append((cur, st, i))
            cur, st = v, i
    runs.append((cur, st, len(db)))
    runs = [r for r in runs if not r[0] or (r[2] - r[1]) * STEP >= MIN_SPEECH]
    merged = []
    for state, s, e in runs:
        if merged and merged[-1][0] == state:
            merged[-1] = (state, merged[-1][1], e)
        else:
            merged.append((state, s, e))
    sp = [(t0 + s * STEP, t0 + e * STEP) for st_, s, e in merged if st_]
    si = [(t0 + s * STEP, t0 + e * STEP) for st_, s, e in merged if not st_]
    return sp, si


def transcribe(path):
    """[(start,end,text)] relative to the file, via whisper.cpp.

    Results are cached in tx/<basename>.txt so a re-run of the extraction does
    not pay for whisper again.
    """
    cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache', 'tx',
                         os.path.splitext(os.path.basename(path))[0] + '.txt')
    if os.path.exists(cache):
        text = open(cache, encoding='utf-8').read()
    else:
        out = subprocess.run([WHISPER, '-m', MODEL, '-f', path, '-l', 'zh'],
                             capture_output=True, text=True).stdout
        text = '\n'.join(l for l in out.splitlines() if re.match(r'^\[[0-9]', l.strip()))
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        open(cache, 'w', encoding='utf-8').write(text + '\n')
    segs = []
    for line in text.splitlines():
        m = re.match(r'\[(\d+):(\d+):(\d+\.\d+) --> (\d+):(\d+):(\d+\.\d+)\]\s*(.*)', line.strip())
        if m:
            h1, m1, s1, h2, m2, s2, txt = m.groups()
            if txt.strip():
                segs.append((int(h1) * 3600 + int(m1) * 60 + float(s1),
                             int(h2) * 3600 + int(m2) * 60 + float(s2), txt.strip()))
    return segs


def build_blocks(pid, a, wavdir):
    db = frame_db(a)
    n = int(SR * STEP)
    marks = [d > SIL_TH for d in db]
    runs, cur, st = [], marks[0], 0
    for i, v in enumerate(marks):
        if v != cur:
            runs.append((cur, st, i))
            cur, st = v, i
    runs.append((cur, st, len(marks)))
    gaps = [(s * STEP, e * STEP) for state, s, e in runs if not state and (e - s) * STEP >= BLOCK_GAP]
    blocks, prev = [], 0.0
    for gs, ge in gaps:
        blocks.append((prev, gs))
        prev = ge
    blocks.append((prev, len(a) / SR))
    blocks = [(round(s, 2), round(e, 2)) for s, e in blocks if e - s > 1.0]

    info = {}
    for i, (bs, be) in enumerate(blocks, 1):
        i0, i1 = int(bs / STEP), int(be / STEP)
        sp, si = regions(db[i0:i1], bs)
        wav = os.path.join(wavdir, '%s_b%02d.wav' % (pid, i))
        if not os.path.exists(wav):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC[pid], '-ss', '%.3f' % bs,
                            '-to', '%.3f' % be, '-ar', str(SR), '-ac', '1', wav], check=True)
        info[i] = {'block': (bs, be), 'speech': sp, 'silences': si,
                   'segs': transcribe(wav)}
    return info


def clip_span(info, n, part, block):
    """List of absolute (start, end) spans carrying question n, in play order.

    Part-4 odd questions (Q37, Q39, ...) return two spans: the shared passage
    from the previous block and this block's own question.
    """
    b = info[block]
    bs, be = b['block']
    sp = b['speech']
    first_txt = b['segs'][0][2] if b['segs'] else ''

    # start of real content: drop a leading "现在开始第X题" style announcement
    cstart = bs
    if INTRO_RE.match(first_txt):
        lead = [g for g in b['silences']
                if g[1] - g[0] >= 2.0 and g[1] <= bs + (be - bs) * 0.55]
        if lead:
            cstart = lead[-1][1]

    cend = sp[-1][1] if sp else be

    if part == 1:
        # the block ends with the true/false statement -> keep the last pause
        internal = [g for g in b['silences']
                    if cstart + 0.5 < g[0] and g[1] < be - 0.1 and g[1] - g[0] >= 0.5]
        cend = internal[-1][0] if internal else cend
        return [(cstart, cend)]

    if part in (2, 3):
        return [(cstart, cend)]

    # part 4: b40 = "passage + Q36", b41 = "Q37 only", b42 = "passage + Q38" ...
    # Both questions of a pair are played the shared passage first.
    if block % 2 == 0:
        return [(cstart, cend)]
    # odd block holds only its own question text; prepend the previous
    # (even) block's passage, i.e. everything before that block's own question.
    prev = info[block - 1]
    pbs, pbe = prev['block']
    prev_first = prev['segs'][0][2] if prev['segs'] else ''
    cstart_prev = pbs
    if INTRO_RE.match(prev_first):
        lead = [g for g in prev['silences']
                if g[1] - g[0] >= 2.0 and g[1] <= pbs + (pbe - pbs) * 0.55]
        if lead:
            cstart_prev = lead[-1][1]
    if prev['segs']:
        passage_end = max(cstart_prev, pbs + prev['segs'][-1][0] - 0.4)
    else:
        passage_end = pbe
    q_end = bs + b['segs'][-1][1] if b['segs'] else cend
    return [(cstart_prev, passage_end), (cstart, q_end)]


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else 'clips'
    here = os.path.dirname(os.path.abspath(__file__))
    wavdir = os.path.join(here, '.cache', 'wav')
    os.makedirs(outdir, exist_ok=True)
    os.makedirs(wavdir, exist_ok=True)

    all_info = {}
    for pid in SRC:
        a = pcm_of(SRC[pid])
        all_info[pid] = {'audio': a, 'blocks': build_blocks(pid, a, wavdir)}
        print(pid, 'blocks', len(all_info[pid]['blocks']))

    manifest = {}
    tmp = os.path.join(outdir, '.tmp')
    os.makedirs(tmp, exist_ok=True)
    for pid in SRC:
        man = []
        total = len(all_info[pid]['audio']) / SR
        for block, qn in LAYOUT:
            if qn is None:
                continue
            n, part = qn
            spans = []
            for s, e in clip_span(all_info[pid]['blocks'], n, part, block):
                spans.append((max(0.0, s - 0.15), min(total, e + 0.25)))
            f = os.path.join(outdir, '%s_q%02d.mp3' % (pid, n))
            if len(spans) == 1:
                s, e = spans[0]
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC[pid], '-ss', '%.3f' % s,
                                '-to', '%.3f' % e, '-ar', '24000', '-ac', '1', '-b:a', '48k', f],
                               check=True)
            else:
                parts = []
                for k, (s, e) in enumerate(spans):
                    p = os.path.join(tmp, '%s_q%02d_%d.mp3' % (pid, n, k))
                    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC[pid], '-ss', '%.3f' % s,
                                    '-to', '%.3f' % e, '-ar', '24000', '-ac', '1', '-b:a', '48k', p],
                                   check=True)
                    parts.append(p)
                lst = os.path.join(tmp, '%s_q%02d.txt' % (pid, n))
                with open(lst, 'w') as fh:
                    for p in parts:
                        fh.write("file '%s'\n" % p)
                cmd = ['ffmpeg', '-v', 'error', '-y']
                for p in parts:
                    cmd += ['-i', p]
                cmd += ['-filter_complex', 'concat=n=%d:v=0:a=1[out]' % len(parts),
                        '-map', '[out]', '-ar', '24000', '-ac', '1', '-b:a', '48k', f]
                subprocess.run(cmd, check=True)
            dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                        '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
            man.append({'paper': pid, 'question': n, 'part': part, 'block': block,
                        'spans': [[round(s, 2), round(e, 2)] for s, e in spans],
                        'duration': round(dur, 2)})
        man.sort(key=lambda m: m['question'])
        manifest[pid] = man
    json.dump(manifest, open(os.path.join(outdir, 'clips.json'), 'w'), indent=1)
    for pid, man in manifest.items():
        ds = [m['duration'] for m in man]
        print(pid, len(man), 'clips, total %.0fs, min %.2f, max %.2f' % (sum(ds), min(ds), max(ds)))


if __name__ == '__main__':
    main()
