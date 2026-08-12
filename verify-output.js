// Extracts the real output/state functions out of index.html and exercises them
// with fake review state. No DOM: copyText and the `el` map are stubbed.
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'index.html'), 'utf8');

function grabFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('missing fn ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced ' + name);
}
function grabVar(decl, endMarker) {
  const s = src.indexOf(decl);
  const e = src.indexOf(endMarker, s);
  return src.slice(s, e + endMarker.length);
}

const pieces = [
  grabVar('var ERROR_CODES = [', '];'),
  "var CODE_ORDER = {}; ERROR_CODES.forEach(function (c, i) { CODE_ORDER[c.code] = i; });",
  grabVar("var CASE_LEVEL_CODE = ", ";"),
  grabVar("var SET_PREFIX = ", ";"),
  grabVar("var SET_TARGET = ", ";"),
  grabFn('emptyReview'),
  grabFn('langReqState'),
  grabFn('setState'),
  grabFn('rowState'),
  grabFn('normalizeCodeSet'),
  grabFn('targetState'),
  grabFn('pruneIssues'),
  grabFn('sortCodes'),
  grabFn('collectPairs'),
  grabFn('collectSetPairs'),
  grabFn('distinctCodes'),
  grabFn('block'),
  grabFn('buildRemarks'),
  grabFn('currentOutput'),
  grabFn('joinList'),
  grabFn('doCopy'),
].join('\n\n');

const ctx = {};
const run = new Function('captured', pieces + `
  var review, currentCase;
  function copyText(text, okNode, message) { captured.push({ text: text, message: message }); }
  var el = { okCodes: 'okCodes', okRemarks: 'okRemarks' };
  return {
    set: function (r, c) { review = r; currentCase = c; },
    currentOutput: currentOutput,
    doCopy: doCopy,
    emptyReview: emptyReview
  };
`);
const captured = [];
const api = run(captured);

function caseOf(n) { return { id: 'X', rubrics: new Array(n).fill(0).map(() => ({})) }; }
let fails = 0;
function eq(label, got, want) {
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label);
  if (!ok) console.log('  got : ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want));
}

const C = {
  fab: 'P0 Inauthenticity / Fabrication / False Capability',
  unmet: 'P0 Unmet Demands / Missing Critical Element',
  weight: 'P1 Unreasonable Rubric Weightage',
  redund: 'P1 Rubrics Redundancy (Fluff / Bonus Bloat)',
  homog: 'P2 Homogenous / Undifferentiated Weightage',
  pitfall: 'P2 Weak Pitfall ("Others")',
  atom: 'P1 Rubrics Lack Atomicity'
};

// ── 1. whole-rubrics codes only ────────────────────────────────────────────
let r = api.emptyReview();
r.set = { codes: [C.homog, C.redund], issues: { [C.homog]: 'every rubric is a 7.', [C.redund]: '' } };
api.set(r, caseOf(3));
let out = api.currentOutput();
eq('set-only codes cell', out.codes, C.redund + ',' + C.homog);
eq('set-only remarks (grouped by code, ALL sub-entry)',
  out.remarks,
  C.redund + ':\nALL:\n\n' + C.homog + ':\nALL:\nevery rubric is a 7.');
captured.length = 0; api.doCopy('codes', out);
eq('set-only codes msg', captured[0].message, 'Copied 2 error codes — 2 whole-rubrics codes only.');
captured.length = 0; api.doCopy('remarks', out);
eq('set-only remarks msg', captured[0].message,
  'Copied 2 entries under 2 codes — 2 whole-rubrics codes only.');

// ── 2. all three scopes, with a code shared between scopes ─────────────────
r = api.emptyReview();
r.langReq = { on: true, note: 'prompt asks for Malay.' };
r.set = { codes: [C.redund], issues: { [C.redund]: 'half the set restates the ask.' } };
r.rows = {
  0: { codes: [C.unmet, C.pitfall], issues: { [C.unmet]: 'no filing date.', [C.pitfall]: 'nothing falsifiable.' } },
  3: { codes: [C.redund], issues: { [C.redund]: 'duplicates R1.' } }
};
api.set(r, caseOf(5));
out = api.currentOutput();
eq('three-scope codes cell (deduped across scopes)',
  out.codes, [CASE_LEVEL(), C.unmet, C.redund, C.pitfall].join(','));
function CASE_LEVEL() { return 'P0 Missing Language Requirement'; }
// One group per distinct code, canonical order, ALL leading its group. The
// shared code (redund) collapses into ONE group holding both scopes' entries.
eq('three-scope remarks grouped by code', out.remarks, [
  'P0 Missing Language Requirement:\nprompt asks for Malay.',
  C.unmet + ':\nR1:\nno filing date.',
  C.redund + ':\nALL:\nhalf the set restates the ask.\n\nR4:\nduplicates R1.',
  C.pitfall + ':\nR1:\nnothing falsifiable.'
].join('\n\n'));
// The audit grouping restores: group N of remarks is entry N of the codes cell.
eq('group headers match the codes cell exactly',
  out.remarks.split('\n\n').filter(b => !/^(ALL|R\d+):/.test(b))
             .map(b => b.split(':\n')[0]).join(','),
  out.codes);
captured.length = 0; api.doCopy('codes', out);
eq('three-scope codes msg', captured[0].message,
  'Copied 4 error codes from 2 criteria, plus 1 whole-rubrics code and the case-level language requirement.');
captured.length = 0; api.doCopy('remarks', out);
eq('three-scope remarks msg', captured[0].message,
  'Copied 5 entries under 4 codes from 2 criteria, plus 1 whole-rubrics code and the case-level language requirement.');

// ── 3. unchanged legacy behaviour: rows only ───────────────────────────────
r = api.emptyReview();
r.rows = { 0: { codes: [C.weight], issues: { [C.weight]: 'nine for a nicety.' } } };
api.set(r, caseOf(2));
out = api.currentOutput();
eq('rows-only codes cell', out.codes, C.weight);
eq('rows-only remarks', out.remarks, C.weight + ':\nR1:\nnine for a nicety.');
captured.length = 0; api.doCopy('codes', out);
eq('rows-only msg', captured[0].message, 'Copied 1 error code from 1 criterion.');

// ── 3b. one code across two rubrics — the shape the grouping was asked for ─
r = api.emptyReview();
r.rows = {
  0: { codes: [C.atom], issues: { [C.atom]: 'test\nSplit into separate atomic criteria.' } },
  7: { codes: [C.atom], issues: { [C.atom]: 'Split the criteria into 2:' } },
  6: { codes: [C.weight], issues: { [C.weight]: 'This should be a critical criteria and should not be a pitfall.' } },
  5: { codes: [C.homog], issues: { [C.homog]: 'This is a double negative,' } }
};
api.set(r, caseOf(9));
out = api.currentOutput();
// Groups run in canonical ERROR_CODES order — #7 Unreasonable Rubric Weightage
// precedes #9 Rubrics Lack Atomicity. That is what keeps group N of this cell
// equal to entry N of the codes cell.
eq('one code, two rubrics -> one group with two entries', out.remarks, [
  C.weight + ':\nR7:\nThis should be a critical criteria and should not be a pitfall.',
  C.atom + ':\nR1:\ntest\nSplit into separate atomic criteria.\n\nR8:\nSplit the criteria into 2:',
  C.homog + ':\nR6:\nThis is a double negative,'
].join('\n\n'));
captured.length = 0; api.doCopy('remarks', out);
eq('entries exceed groups when a code repeats', captured[0].message,
  'Copied 4 entries under 3 codes from 4 criteria.');

// ── 4. unchanged legacy behaviour: case-level only ─────────────────────────
r = api.emptyReview();
r.langReq = { on: true, note: '' };
api.set(r, caseOf(2));
out = api.currentOutput();
eq('langreq-only remarks', out.remarks, 'P0 Missing Language Requirement:');
captured.length = 0; api.doCopy('codes', out);
eq('langreq-only msg (spec wording)', captured[0].message,
  'Copied 1 error code — the case-level language requirement only.');

// ── 5. stored set survives a normalization round trip ──────────────────────
r = api.emptyReview();
r.set = 'garbage';
api.set(r, caseOf(1));
out = api.currentOutput();
eq('malformed stored set normalizes to empty', out.setPairs.length, 0);

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall green');
process.exit(fails ? 1 : 0);
