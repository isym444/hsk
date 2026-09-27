#!/usr/bin/env python3
"""Append a paper's listening clips to `src/app/data/audio-clips.ts`.

`audio-clips.ts` is the manifest the app uses to resolve a question to its
recording. Adding a paper means adding 45 (HSK4) or 40 (HSK3) rows; doing that
by hand is noise, so this reads the same paper JSON used to generate the data
file and appends the rows for any paper not already listed.

Durations are measured from the actual files, so the manifest cannot claim a
length the clip does not have (the browser test checks this too).

Usage:
    python3 scripts/merge-audio-clips.py public/audio H31330.json H31332.json
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile

MANIFEST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'app', 'data', 'audio-clips.ts'
)


def duration_of(path: str) -> float:
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True).stdout.strip()
    return round(float(out), 1)


def listening_parts(data: dict) -> dict[int, int]:
    """question number -> listening part, from the paper JSON."""
    parts: dict[int, int] = {}
    lis = data['listening']
    for key, part in (('part1', 1), ('part2', 2), ('part3', 3), ('part4', 4)):
        for block in lis.get(key, []) or []:
            for q in block.get('qs', []):
                parts[q['n']] = part
            if 'n' in block:
                parts[block['n']] = part
    return parts


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(2)
    audio_dir, json_paths = sys.argv[1], sys.argv[2:]

    src = open(MANIFEST, encoding='utf-8').read()
    existing = set(re.findall(r"paper: '(\w+)'", src))
    rows: list[str] = []

    for path in json_paths:
        data = json.load(open(path, encoding='utf-8'))
        paper = data['paper']
        if paper in existing:
            print('%-8s already in the manifest, skipping' % paper)
            continue
        parts = listening_parts(data)
        numbers = sorted(parts)
        if not numbers:
            raise SystemExit('%s has no listening questions' % paper)
        for n in numbers:
            f = os.path.join(audio_dir, '%s_q%02d.mp3' % (paper, n))
            if not os.path.exists(f):
                raise SystemExit('missing clip %s' % f)
            rows.append("  { paper: '%s', n: %d, part: %d, file: '%s_q%02d.mp3', duration: %.1f },"
                        % (paper, n, parts[n], paper, n, duration_of(f)))
        print('%s: %d clips' % (paper, len(numbers)))

    if not rows:
        return
    marker = '];\n\n/** Lookup keyed by'
    if marker not in src:
        raise SystemExit('could not find the end of the clip array in %s' % MANIFEST)
    src = src.replace(marker, '\n'.join(rows) + '\n' + marker)
    open(MANIFEST, 'w', encoding='utf-8').write(src)
    print('appended %d rows to %s' % (len(rows), os.path.relpath(MANIFEST)))


if __name__ == '__main__':
    main()
