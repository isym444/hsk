#!/usr/bin/env python3
"""Validate extracted clips: does each clip's ASR match its own transcript?

Reads the expected listening transcripts straight out of the Angular data files,
reads the whisper transcription of each extracted clip, and reports per-clip
similarity plus a confusion matrix (argmax expected-vs-clip).
"""
import json
import os
import re
import sys
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'src', 'app', 'data')


def parse_ts(fname):
    src = open(os.path.join(DATA, fname), encoding='utf-8').read()
    # only the listening section (up to the reading: key)
    lis = src.split('reading:')[0]
    expected = {}

    # part1: { n: 1, statement: "...", audio: "...", answer: ... }
    for m in re.finditer(r'\{ n: (\d+), statement: "(.*?)", audio: "(.*?)", answer: (?:true|false) \}', lis):
        expected[int(m.group(1))] = m.group(3)

    # parts 2/3: passage: "..." then qs with n
    blocks = re.findall(r'passage: "(.*?)",\s*qs: \[(.*?)\],\s*\}', lis, re.S)
    for passage, qs in blocks:
        qs = qs.replace('\\n', ' ')
        for qm in re.finditer(r'\{ n: (\d+), q: "(.*?)", o: \[(.*?)\], a: (\d+) \}', qs):
            n = int(qm.group(1))
            if n <= 45:
                expected[n] = passage + ' ' + qm.group(2)
    return expected


def norm(s):
    s = s.replace('\\n', ' ')
    s = re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]', '', s)
    return s


def sim(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def main():
    papers = {'H41001': 'h41001.data.ts', 'H41002': 'h41002.data.ts', 'H41003': 'h41003.data.ts'}
    ctxdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '.cache', 'ctx')
    grand = []
    for pid, f in papers.items():
        exp = parse_ts(f)
        got = {}
        for n in range(1, 46):
            p = os.path.join(ctxdir, '%s_q%02d.txt' % (pid, n))
            got[n] = open(p, encoding='utf-8').read().strip() if os.path.exists(p) else ''
        print('=' * 72)
        print(pid)
        for n in range(1, 46):
            s = sim(exp.get(n, ''), got[n])
            print('  Q%02d sim %.3f' % (n, s))
            grand.append((pid, n, s))
        # confusion: for each clip, which expected text fits best?
        wrong = 0
        for n in range(1, 46):
            best = max(range(1, 46), key=lambda k: sim(exp.get(k, ''), got[n]))
            if best != n:
                wrong += 1
                print('  !! clip Q%02d best matches expected Q%02d (%.3f vs %.3f)'
                      % (n, best, sim(exp.get(best, ''), got[n]), sim(exp.get(n, ''), got[n])))
        print('  mismatched clips: %d/45' % wrong)
    vals = [s for _, _, s in grand]
    vals.sort()
    print('=' * 72)
    print('overall n=%d mean %.3f median %.3f min %.3f  p10 %.3f' %
          (len(vals), sum(vals) / len(vals), vals[len(vals) // 2], vals[0], vals[len(vals) // 10]))
    low = [(p, n, s) for p, n, s in grand if s < 0.6]
    print('clips below 0.60:', len(low))
    for p, n, s in low:
        print('   %s Q%02d %.3f' % (p, n, s))


if __name__ == '__main__':
    main()
