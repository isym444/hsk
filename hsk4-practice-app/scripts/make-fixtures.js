#!/usr/bin/env node
/**
 * Regenerates src/app/testing/fixtures/{tests,units}.json straight out of
 * `../hsk4-practice.html`, so the specs can assert that the Angular port is
 * data- and behaviour-identical to the original single-file app.
 *
 * Run from the app directory:  node scripts/make-fixtures.js
 *
 * The fixtures are checked in because they change only when the original app
 * changes; this script exists so they can be regenerated rather than
 * hand-edited.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'hsk4-practice.html'), 'utf8');

const dataStart = html.indexOf('const T=(n,statement,audio,answer)');
const engineStart = html.indexOf('/* ============================== ENGINE');
const scriptEnd = html.indexOf('</script>', engineStart);
if (dataStart < 0 || engineStart < 0) {
  throw new Error('could not find the data/engine blocks in hsk4-practice.html');
}

// The engine touches document/window at module scope (renderHome(), the back
// button wiring, speak()'s voice priming), so stub just enough DOM to load it.
const noop = () => {};
const fakeElement = () => ({
  classList: { add: noop, remove: noop, toggle: noop },
  style: { setProperty: noop, width: '' },
  appendChild: noop,
  textContent: '',
  innerHTML: '',
  onclick: null,
  addEventListener: noop,
});

const sandbox = {
  document: {
    getElementById: fakeElement,
    createElement: fakeElement,
    documentElement: { style: { setProperty: noop } },
    querySelector: () => null,
  },
  window: {
    speechSynthesis: { getVoices: () => [], speak: noop, cancel: noop },
    scrollTo: noop,
  },
  alert: noop,
  console,
  Math,
};

vm.createContext(sandbox);
vm.runInContext(
  html.slice(dataStart, scriptEnd) +
    `
;globalThis.__OUT = {
  TESTS: TESTS,
  SECTION_META: SECTION_META,
  units: (function () {
    var out = {};
    Object.keys(TESTS).forEach(function (testId) {
      ["listening", "reading", "writing"].forEach(function (sectionKey) {
        out[testId + "|" + sectionKey] = buildUnits(testId, sectionKey);
      });
    });
    return out;
  })(),
};`,
  sandbox,
);

const out = sandbox.__OUT;
const dir = path.join(root, 'hsk4-practice-app', 'src', 'app', 'testing', 'fixtures');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tests.json'), JSON.stringify(out.TESTS));
fs.writeFileSync(path.join(dir, 'units.json'), JSON.stringify(out.units));

for (const key of Object.keys(out.units)) {
  console.log(`${key}: ${out.units[key].length} units`);
}
