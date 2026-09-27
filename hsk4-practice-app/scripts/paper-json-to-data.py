#!/usr/bin/env python3
"""Turn an extracted paper JSON into an Angular data file.

The HSK3 papers are extracted by `scripts/extract-*.py`-adjacent tooling into a
JSON mirror, because building the TypeScript by hand for 80 questions is
error-prone and the JSON is also what the answer-key/clip verification runs
against. This converts that JSON into the `*.data.ts` shape the app imports.

Usage:
    python3 scripts/paper-json-to-data.py H31330.json src/app/data/h31330.data.ts H31330
"""
import json
import os
import re
import sys


def js(s: str) -> str:
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'


def arr(items) -> str:
    return '[' + ', '.join(js(i) for i in items) + ']'


LETTERS = 'ABCDEF'


def statement_of(text: str) -> str:
    """Drop the paper's ★ marker; the true/false component renders its own."""
    return text.lstrip('★ ').strip()


def listening_question(text: str) -> str:
    """Listening questions carry the 问： marker, as the HSK4 files do."""
    text = text.strip()
    return text if text.startswith('问：') else '问：' + text


def reading_question(text: str) -> str:
    """Reading part-3 questions carry the ★ marker, as the HSK4 files do."""
    text = text.strip()
    return text if text.startswith('★') else '★ ' + text


def reading_answer(row: dict) -> str:
    """The answer the fill component compares against, not the printed letter.

    HSK3 prints a letter for its reading banks, but `FillBlankUnit.answer` holds
    the *text* the learner should end up with (the app tests `bank[picked]`).
    Converting here keeps the JSON faithful to the paper while the data file
    matches what the component expects.
    """
    answer = row['answer']
    bank = row.get('bank', [])
    if len(answer) == 1 and answer in LETTERS and answer not in bank:
        index = LETTERS.index(answer)
        if index >= len(bank):
            raise SystemExit('answer %r is outside the bank for question %s' % (answer, row['n']))
        return bank[index]
    return answer


def matching_sentence(row: dict) -> str:
    """Give a matching exercise a visible blank for the reply to go in."""
    sentence = row['sentence']
    return sentence if '（' in sentence else sentence + '（　）'


def build(d: dict) -> str:
    export = d.get('export') or d['paper']
    L: list[str] = []
    L.append("import { Test } from './models';")
    L.append('')
    L.append(f'export const {export}: Test = {{')
    L.append('  listening: {')

    lis = d['listening']
    L.append('    part1: [')
    for item in lis['part1']:
        # Two shapes share part 1: HSK4 true/false items and HSK3 picture items.
        if 'options' in item:
            L.append('      { n: %d, audio: %s, options: %s, answer: %d },'
                     % (item['n'], js(item['audio']), arr(item['options']), item['answer']))
        else:
            L.append('      { n: %d, statement: %s, audio: %s, answer: %s },'
                     % (item['n'], js(statement_of(item['statement'])), js(item['audio']),
                        'true' if item['answer'] else 'false'))
    L.append('    ],')

    for key in ('part2', 'part3', 'part4'):
        blocks = lis.get(key)
        if blocks is None:
            continue
        L.append(f'    {key}: [')
        for block in blocks:
            # part 2 items are true/false; parts 3/4 are passage + questions.
            if 'statement' in block:
                L.append('      { n: %d, statement: %s, audio: %s, answer: %s },'
                         % (block['n'], js(statement_of(block['statement'])), js(block['audio']),
                            'true' if block['answer'] else 'false'))
                continue
            L.append('      {')
            L.append('        passage: %s,' % js(block['passage']))
            L.append('        qs: [')
            for q in block['qs']:
                L.append('          { n: %d, q: %s, o: %s, a: %d },'
                         % (q['n'], js(listening_question(q['q'])), arr(q['o']), q['a']))
            L.append('        ],')
            L.append('      },')
        L.append('    ],')
    L.append('  },')

    L.append('  reading: {')
    for key in ('part1', 'part2', 'part3'):
        rows = d['reading'].get(key, [])
        L.append(f'    {key}: [')
        if key == 'part1':
            # HSK3's matching exercise: a prompt matched to one of six replies.
            for r in rows:
                L.append('      { n: %d, bank: %s, sentence: %s, answer: %s },'
                         % (r['n'], arr(r['bank']), js(matching_sentence(r)),
                            js(reading_answer(r))))
        elif key == 'part2':
            for r in rows:
                L.append('      { n: %d, bank: %s, sentence: %s, answer: %s },'
                         % (r['n'], arr(r['bank']), js(r['sentence']),
                            js(reading_answer(r))))
        else:
            for block in rows:
                L.append('      {')
                L.append('        passage: %s,' % js(block['passage']))
                L.append('        qs: [')
                for q in block['qs']:
                    L.append('          { n: %d, q: %s, o: %s, a: %d },'
                             % (q['n'], js(reading_question(q['q'])), arr(q['o']), q['a']))
                L.append('        ],')
                L.append('      },')
        L.append('    ],')
    L.append('  },')

    L.append('  writing: {')
    L.append('    part1: [')
    for r in d['writing']['part1']:
        L.append('      { n: %d, words: %s, orders: [%s] },'
                 % (r['n'], arr(r['words']), ', '.join(arr(o) for o in r['orders'])))
    L.append('    ],')
    L.append('    part2: [')
    for r in d['writing']['part2']:
        # HSK3 asks for one character given a gapped sentence and its pinyin;
        # `word` is that prompt and `model` is the character to write.
        prompt = re.sub(r'（\s+）', '（　）', r.get('sentence') or r['word'])
        L.append('      { n: %d, word: %s, model: %s, instruction: %s },'
                 % (r['n'], js(prompt), js(r['word']),
                    js('Write the character that fills the blank (the original item prints its pinyin).')))
    L.append('    ],')
    L.append('  },')
    L.append('};')
    L.append('')
    return '\n'.join(L)


def main() -> None:
    if len(sys.argv) != 4:
        print(__doc__)
        raise SystemExit(2)
    src, dst, export = sys.argv[1], sys.argv[2], sys.argv[3]
    data = json.load(open(src, encoding='utf-8'))
    data['export'] = export
    text = build(data)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    open(dst, 'w', encoding='utf-8').write(text)
    counts = {
        'listening': sum(len(v) if 'qs' not in (v[0] if v else {}) else sum(len(b['qs']) for b in v)
                         for k, v in data['listening'].items() if v),
        'reading': sum(len(v) for v in data['reading'].values()),
        'writing': sum(len(v) for v in data['writing'].values()),
    }
    print('wrote %s (%d lines) %s' % (dst, text.count('\n'), counts))


if __name__ == '__main__':
    main()
