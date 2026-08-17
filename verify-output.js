// Extracts the real output/state functions out of index.html and exercises them
// with fake review state. No DOM: copyText and the `el` map are stubbed.
//
// v2: eighteen ERROR_CODES + five CASE_LEVEL_CODES, three independent scopes,
// and the sort rule where the four `Prompt:` codes lead and scope never affects
// position. The v1 `langReq` cases are gone with the checkbox they tested.
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
  if (s === -1) throw new Error('missing decl ' + decl);
  const e = src.indexOf(endMarker, s);
  if (e === -1) throw new Error('unterminated ' + decl);
  return src.slice(s, e + endMarker.length);
}
// For one-line declarations whose body contains a `;` of its own.
function grabLine(decl) {
  const s = src.indexOf(decl);
  if (s === -1) throw new Error('missing decl ' + decl);
  return src.slice(s, src.indexOf('\n', s));
}

const pieces = [
  grabVar('var ERROR_CODES = [', '];'),
  grabVar('var CASE_LEVEL_CODES = [', '];'),
  grabLine('var PROMPT_CODES = '),
  grabLine('var SORT_ORDER = '),
  grabVar('var CODE_ORDER = {};', 'CODE_ORDER[c] = i; });'),
  grabVar("var CASE_TARGET = ", ';'),
  grabVar("var SET_TARGET = ", ';'),
  grabFn('emptyReview'),
  grabFn('normalizeCodeSet'),
  grabFn('scopePrefix'),
  grabFn('sortCodes'),
  grabFn('pairsForScope'),
  grabFn('collectRowPairs'),
  grabFn('distinctCodes'),
  grabFn('block'),
  grabFn('buildRemarks'),
  grabFn('currentOutput'),
  grabFn('joinList'),
  grabFn('doCopy')
].join('\n\n');

const run = new Function('captured', pieces + `
  var review, currentCase;
  function copyText(text, okNode, message) { captured.push({ text: text, message: message }); }
  var el = { okCodes: 'okCodes', okRemarks: 'okRemarks' };
  return {
    set: function (r, c) { review = r; currentCase = c; },
    currentOutput: currentOutput,
    doCopy: doCopy,
    emptyReview: emptyReview,
    ERROR_CODES: ERROR_CODES,
    CASE_LEVEL_CODES: CASE_LEVEL_CODES,
    SORT_ORDER: SORT_ORDER
  };
`);
const captured = [];
const api = run(captured);

function caseOf(n) { return { rubrics: new Array(n).fill(0).map(() => ({})) }; }
let fails = 0;
function eq(label, got, want) {
  const ok = got === want;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label);
  if (!ok) console.log('  got : ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want));
}

const C = {
  timed:  'Prompt: Time Sensitive',
  vague:  'Prompt: Vague',
  image:  'Prompt/History: Contains Image',
  fab:    'P0 Inauthenticity / Fabrication / False Capability',
  unmet:  'P0 Unmet Demands / Missing Critical Element',
  mlr:    'P0 Missing Language Requirement',
  weight: 'P0 Unreasonable Rubric Weightage',
  p0o:    'P0 Others',
  atom:   'P1 Rubrics Lack Atomicity',
  fluff:  'P1 Rubrics Redundancy (Fluff / Bonus Bloat)',
  homog:  'P1 Homogenous / Undifferentiated Weightage',
  p2o:    'P2 Others'
};

// ── 0. the taxonomy itself ─────────────────────────────────────────────────
eq('18 error codes', api.ERROR_CODES.length, 18);
eq('5 case-level codes', api.CASE_LEVEL_CODES.length, 5);
eq('22 distinct codes in the sort order', new Set(api.SORT_ORDER).size, 22);
eq('the four Prompt: codes lead the sort',
  api.SORT_ORDER.slice(0, 4).join('|'),
  [C.timed, C.vague, C.image, 'Prompt/History: Missing Context'].join('|'));
eq('P0 Missing Language Requirement sits in canonical slot 5',
  api.ERROR_CODES[4], C.mlr);
eq('P0 Missing Language Requirement is in BOTH lists',
  api.CASE_LEVEL_CODES.indexOf(C.mlr) !== -1 && api.ERROR_CODES.indexOf(C.mlr) !== -1, true);
eq('the Prompt: codes are never in ERROR_CODES',
  [C.timed, C.vague, C.image].some(c => api.ERROR_CODES.indexOf(c) !== -1), false);

// ── 1. whole-rubrics codes only ────────────────────────────────────────────
let r = api.emptyReview();
r.set = { codes: [C.homog, C.fluff], issues: { [C.homog]: 'every rubric is a 7.', [C.fluff]: '' } };
api.set(r, caseOf(3));
let out = api.currentOutput();
eq('set-only codes cell', out.codes, C.fluff + ',' + C.homog);
// A code with an empty box still emits: a bare header is a visible reminder
// that something was left unwritten.
eq('set-only remarks (grouped by code, ALL entry)',
  out.remarks,
  C.fluff + ':\nALL:\n\n' + C.homog + ':\nALL:\nevery rubric is a 7.');
captured.length = 0; api.doCopy('codes', out);
eq('set-only codes msg', captured[0].message, 'Copied 2 error codes — 2 whole-rubrics codes only.');
captured.length = 0; api.doCopy('remarks', out);
eq('set-only remarks msg', captured[0].message,
  'Copied 2 entries under 2 codes — 2 whole-rubrics codes only.');

// ── 2. all three scopes — the worked example from specifications.md § Output ─
r = api.emptyReview();
r.case = { codes: [C.vague, C.mlr], issues: {
  [C.vague]: 'The prompt never says which jurisdiction.',
  [C.mlr]:   'The prompt asks for Malay; no rubric requires the response language.'
} };
r.set = { codes: [C.fluff], issues: {
  [C.fluff]: 'Half the set restates the same ask in different words.'
} };
r.rows = {
  2: { codes: [C.mlr],   issues: { [C.mlr]:   'This criterion is the one that should have carried it.' } },
  3: { codes: [C.fluff], issues: { [C.fluff]: 'Duplicates R1.' } }
};
api.set(r, caseOf(5));
out = api.currentOutput();
eq('three-scope codes cell (deduped across scopes)',
  out.codes, [C.vague, C.mlr, C.fluff].join(','));
// One group per distinct code. The shared codes collapse into ONE group each,
// holding every scope's entry — CASE first, then ALL, then R<n> ascending.
eq('three-scope remarks match the spec example', out.remarks, [
  C.vague + ':\nCASE:\nThe prompt never says which jurisdiction.',
  C.mlr + ':\nCASE:\nThe prompt asks for Malay; no rubric requires the response language.' +
          '\n\nR3:\nThis criterion is the one that should have carried it.',
  C.fluff + ':\nALL:\nHalf the set restates the same ask in different words.' +
            '\n\nR4:\nDuplicates R1.'
].join('\n\n'));
// The audit: group N of remarks is entry N of the codes cell.
eq('group headers read down as exactly the codes cell',
  out.remarks.split('\n\n').filter(b => !/^(CASE|ALL|R\d+):/.test(b))
             .map(b => b.split(':\n')[0]).join(','),
  out.codes);
captured.length = 0; api.doCopy('codes', out);
eq('three-scope codes msg', captured[0].message,
  'Copied 3 error codes from 2 criteria, plus 1 whole-rubrics code and 2 case-level codes.');
captured.length = 0; api.doCopy('remarks', out);
eq('three-scope remarks msg', captured[0].message,
  'Copied 5 entries under 3 codes from 2 criteria, plus 1 whole-rubrics code and 2 case-level codes.');

// ── 3. scope never affects sort position ───────────────────────────────────
// A Prompt: code entered at case level still leads; a P0 entered on a row still
// sorts by its canonical slot, not by the scope that produced it.
r = api.emptyReview();
r.case = { codes: [C.timed], issues: { [C.timed]: 'asks for "today".' } };
r.set  = { codes: [C.p2o],   issues: { [C.p2o]: '' } };
r.rows = { 0: { codes: [C.fab], issues: { [C.fab]: 'cites a filing that does not exist.' } } };
api.set(r, caseOf(2));
out = api.currentOutput();
eq('Prompt: block first, then canonical, regardless of scope',
  out.codes, [C.timed, C.fab, C.p2o].join(','));

// ── 4. one code in all three scopes → one group, three entries ─────────────
r = api.emptyReview();
r.case = { codes: [C.mlr], issues: { [C.mlr]: 'the prompt names the language.' } };
r.set  = { codes: [C.mlr], issues: { [C.mlr]: 'no criterion in the set mentions it.' } };
r.rows = { 6: { codes: [C.mlr], issues: { [C.mlr]: 'R7 was the natural home for it.' } } };
api.set(r, caseOf(8));
out = api.currentOutput();
eq('a code in three scopes is ONE entry in the codes cell', out.codes, C.mlr);
eq('a code in three scopes is ONE group with three entries', out.remarks,
  C.mlr + ':\nCASE:\nthe prompt names the language.' +
  '\n\nALL:\nno criterion in the set mentions it.' +
  '\n\nR7:\nR7 was the natural home for it.');
captured.length = 0; api.doCopy('remarks', out);
eq('entries exceed codes when one code spans every scope', captured[0].message,
  'Copied 3 entries under 1 code from 1 criterion, plus 1 whole-rubrics code and 1 case-level code.');

// ── 5. rows only, one code across two rubrics ──────────────────────────────
r = api.emptyReview();
r.rows = {
  0: { codes: [C.atom],   issues: { [C.atom]: 'test\nSplit into separate atomic criteria.' } },
  7: { codes: [C.atom],   issues: { [C.atom]: 'Split the criteria into 2:' } },
  6: { codes: [C.weight], issues: { [C.weight]: 'This should be critical, not a pitfall.' } },
  5: { codes: [C.homog],  issues: { [C.homog]: 'This is a double negative,' } }
};
api.set(r, caseOf(9));
out = api.currentOutput();
// Canonical order: weight (#6) precedes atom (#10) precedes homog (#13). That is
// what keeps group N of this cell equal to entry N of the codes cell.
eq('one code, two rubrics -> one group with two entries', out.remarks, [
  C.weight + ':\nR7:\nThis should be critical, not a pitfall.',
  C.atom + ':\nR1:\ntest\nSplit into separate atomic criteria.\n\nR8:\nSplit the criteria into 2:',
  C.homog + ':\nR6:\nThis is a double negative,'
].join('\n\n'));
captured.length = 0; api.doCopy('remarks', out);
eq('rows-only remarks msg', captured[0].message,
  'Copied 4 entries under 3 codes from 4 criteria.');
captured.length = 0; api.doCopy('codes', out);
eq('rows-only codes msg', captured[0].message, 'Copied 3 error codes from 4 criteria.');

// ── 6. case scope alone is sufficient ──────────────────────────────────────
r = api.emptyReview();
r.case = { codes: [C.vague], issues: { [C.vague]: '' } };
api.set(r, caseOf(2));
out = api.currentOutput();
eq('case-only codes cell', out.codes, C.vague);
eq('case-only remarks is a bare header', out.remarks, C.vague + ':\nCASE:');
captured.length = 0; api.doCopy('codes', out);
eq('case-only msg', captured[0].message, 'Copied 1 error code — 1 case-level code only.');

// ── 7. malformed stored scopes survive a normalization round trip ──────────
r = api.emptyReview();
r.set = 'garbage';
r.case = 42;
api.set(r, caseOf(1));
out = api.currentOutput();
eq('malformed stored set normalizes to empty', out.setPairs.length, 0);
eq('malformed stored case normalizes to empty', out.casePairs.length, 0);

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall green');
process.exit(fails ? 1 : 0);
