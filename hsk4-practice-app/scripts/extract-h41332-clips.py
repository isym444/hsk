#!/usr/bin/env python3
"""Cut per-question clips for H41332 from its single full-length recording.

The H41332 recording has the same spoken structure as H41001-H41003 (intro,
worked example, then 45 questions separated by answer pauses), so the cutting
logic is the same; only the geometry differs:

  * one file for the whole paper instead of one per section
  * the answer pause before the first question is 9.05 s (not 9.9/10.2)
  * parts 2 and 3 use a ~16.2 s pause, part 4 ~16.25 s
  * part 2 starts at b14 and part 3 at b30 (the same as H41332's sibling
    recordings), with the second example block at b13

Usage
-----
    HSK_AUDIO_DIR=~/Downloads python3 scripts/extract-h41332-clips.py public/audio

Requires `ffmpeg`, `ffprobe` and `whisper-cli` (Homebrew `whisper-cpp`). Set
HSK_AUDIO_DIR to the folder holding `H41332.mp3` (default: this script's
folder), and WHISPER_MODEL if the model is not at scripts/.cache/models/. The
per-block transcription cache lives in scripts/.cache132/, so re-running after a
boundary tweak only re-cuts the audio.
"""
import array
import json
import math
import os
import re
import subprocess
import sys

AUDIO_DIR = os.environ.get('HSK_AUDIO_DIR', os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(AUDIO_DIR, 'H41332.mp3')
PAPER = 'H41332'
SR = 16000
STEP = 0.01
SIL_TH = -55.0
MIN_SPEECH = 0.06
BLOCK_GAP = 4.0
WHISPER = os.environ.get('WHISPER_CLI', 'whisper-cli')
MODEL = os.environ.get(
    'WHISPER_MODEL',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache', 'models', 'ggml-large-v3-turbo.bin'),
)

# block -> (question, part); None marks intro/example blocks
LAYOUT = {1: None, 2: None, 13: None, 29: None}
for n in range(1, 11):
    LAYOUT[n + 2] = (n, 1)        # b03..b12 -> Q1..Q10
for n in range(11, 26):
    LAYOUT[n + 3] = (n, 2)        # b14..b28 -> Q11..Q25
for n in range(26, 36):
    LAYOUT[n + 4] = (n, 3)        # b30..b39 -> Q26..Q35
for n in range(36, 46):
    LAYOUT[40 + (n - 36)] = (n, 4)  # b40..b50 -> Q36..Q45

INTRO_RE = re.compile(r'^(现在开始第|第\s*\d+\s*到\s*\d+\s*题|[以第]\s*\d+\s*到\s*\d+\s*题|第[一二三四]部分)')


def pcm_of(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR),
                          '-f', 's16le', '-'], capture_output=True, check=True).stdout
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
    runs, cur, st = [], db[0] > SIL_TH, 0
    for i, d in enumerate(db):
        v = d > SIL_TH
        if v != cur:
            runs.append((cur, st, i)); cur, st = v, i
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


def transcribe(path, cache):
    if os.path.exists(cache):
        text = open(cache, encoding='utf-8').read()
    else:
        out = subprocess.run([WHISPER, '-m', MODEL, '-f', path, '-l', 'zh'],
                             capture_output=True, text=True).stdout
        text = '\n'.join(l for l in out.splitlines() if re.match(r'^\[[0-9]', l.strip()))
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


def cstart_of(blk):
    """Where the actual content starts, skipping a spoken question-number intro."""
    bs, be = blk['block']
    first = blk['segs'][0][2] if blk['segs'] else ''
    if INTRO_RE.match(first):
        lead = [g for g in blk['silences']
                if g[1] - g[0] >= 2.0 and g[1] <= bs + (be - bs) * 0.55]
        if lead:
            return lead[-1][1]
    return bs


def clip_spans(info, part, block):
    b = info[block]
    bs, be = b['block']
    sp = b['speech']
    cstart = cstart_of(b)
    cend = sp[-1][1] if sp else be

    if part == 1:
        # the block ends with the true/false statement: cut at the last pause
        internal = [g for g in b['silences']
                    if cstart + 0.5 < g[0] and g[1] < be - 0.1 and g[1] - g[0] >= 0.5]
        return [(cstart, internal[-1][0] if internal else cend)]

    if part in (2, 3):
        return [(cstart, cend)]

    # part 4: even block = passage + its own question; odd block = the second
    # question only, so it is played after the previous block's passage.
    if block % 2 == 0:
        return [(cstart, cend)]
    prev = info[block - 1]
    pbs, pbe = prev['block']
    pstart = cstart_of(prev)
    if prev['segs']:
        pend = max(pstart, pbs + prev['segs'][-1][0] - 0.4)
    else:
        pend = pbe
    qend = bs + b['segs'][-1][1] if b['segs'] else cend
    return [(pstart, pend), (cstart, qend)]


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else 'clips'
    here = os.path.dirname(os.path.abspath(__file__))
    cache = os.path.join(here, '.cache132')
    os.makedirs(outdir, exist_ok=True)
    os.makedirs(cache, exist_ok=True)

    a = pcm_of(SRC)
    total = len(a) / SR
    db = frame_db(a)
    marks = [d > SIL_TH for d in db]
    runs, cur, st = [], marks[0], 0
    for i, v in enumerate(marks):
        if v != cur:
            runs.append((cur, st, i)); cur, st = v, i
    runs.append((cur, st, len(marks)))
    gaps = [(s * STEP, e * STEP) for state, s, e in runs if not state and (e - s) * STEP >= BLOCK_GAP]
    blocks, prev = [], 0.0
    for gs, ge in gaps:
        blocks.append((prev, gs)); prev = ge
    blocks.append((prev, total))
    blocks = [(round(s, 2), round(e, 2)) for s, e in blocks if e - s > 1.0]
    print('blocks:', len(blocks))

    info = {}
    for i, (bs, be) in enumerate(blocks, 1):
        i0, i1 = int(bs / STEP), int(be / STEP)
        sp, si = regions(db[i0:i1], bs)
        wav = os.path.join(cache, 'b%02d.wav' % i)
        if not os.path.exists(wav):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-ss', '%.3f' % bs,
                            '-to', '%.3f' % be, '-ar', str(SR), '-ac', '1', wav], check=True)
        info[i] = {'block': (bs, be), 'speech': sp, 'silences': si,
                   'segs': transcribe(wav, os.path.join(cache, 'b%02d.txt' % i))}

    manifest = []
    for block in sorted(LAYOUT):
        qn = LAYOUT[block]
        if qn is None:
            continue
        n, part = qn
        spans = [(max(0.0, s - 0.15), min(total, e + 0.25)) for s, e in clip_spans(info, part, block)]
        f = os.path.join(outdir, '%s_q%02d.mp3' % (PAPER, n))
        if len(spans) == 1:
            s, e = spans[0]
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-ss', '%.3f' % s,
                            '-to', '%.3f' % e, '-ar', '24000', '-ac', '1', '-b:a', '48k', f], check=True)
        else:
            parts = []
            for k, (s, e) in enumerate(spans):
                p = os.path.join(cache, 'q%02d_%d.mp3' % (n, k))
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-ss', '%.3f' % s,
                                '-to', '%.3f' % e, '-ar', '24000', '-ac', '1', '-b:a', '48k', p], check=True)
                parts.append(p)
            cmd = ['ffmpeg', '-v', 'error', '-y']
            for p in parts:
                cmd += ['-i', p]
            cmd += ['-filter_complex', 'concat=n=%d:v=0:a=1[out]' % len(parts),
                    '-map', '[out]', '-ar', '24000', '-ac', '1', '-b:a', '48k', f]
            subprocess.run(cmd, check=True)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                    '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
        manifest.append({'paper': PAPER, 'question': n, 'part': part, 'block': block,
                         'spans': [[round(s, 2), round(e, 2)] for s, e in spans],
                         'duration': round(dur, 2)})
    manifest.sort(key=lambda m: m['question'])
    json.dump(manifest, open(os.path.join(outdir, 'clips.json'), 'w'), indent=1)
    ds = [m['duration'] for m in manifest]
    print('%s: %d clips, total %.0fs, min %.2f, max %.2f' % (PAPER, len(manifest), sum(ds), min(ds), max(ds)))


if __name__ == '__main__':
    main()
