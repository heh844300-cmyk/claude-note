// Vocabulary of the daily English reading: frequency bands, measured difficulty, the reader's word record, question types.
'use strict';
const fs = require('fs'), path = require('path');
const V = require('../lib/vocab');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// a tiny lexicon: line order is frequency rank, so pad the first 1000 and 2000 lines
const pad = (n, p) => Array.from({ length: n }, (_, i) => p + 'x' + i);
const ngsl = ['# comment', 'the', 'be is are was', 'read reads reading', 'word words', ...pad(996, 'a'), 'retrieve retrieves retrieved', ...pad(999, 'b'), 'mitigate mitigates'].join('\n');
const lex = V.createLexicon({ ngsl, sup: 'monday mondays', nawl: 'paradigm paradigms\nthe' });
assert(lex.lookup('is').lemma === 'be' && lex.lookup('is').band === 1 && lex.lookup('retrieved').band === 2 && lex.lookup('mitigates').band === 3 && lex.lookup('paradigms').band === 4 && lex.lookup('monday').band === 0, 'lexicon: a form gives its headword and frequency band');
assert(lex.lookup('the').band === 1 && lex.lookup('zeitgeist').band === V.OFF && lex.lookup('zeitgeist').lemma === 'zeitgeist', 'lexicon: a more frequent list wins; unlisted words are their own headword');
assert(lex.lookup('mitigated').lemma === 'mitigate' && lex.lookup('wording').lemma === 'word' && lex.lookup('this').band === V.OFF, 'lexicon: regular endings fall back to the base word; short words are not stripped');

// tokens
const tk = V.tokens("## It isn't Tailscale. Reading helps, said Tono.");
assert(tk.map((t) => t.w).join(' ') === 'it isn tailscale reading helps said tono' && tk.find((t) => t.w === 'tailscale').name && !tk.find((t) => t.w === 'reading').name && tk.find((t) => t.w === 'tono').name,
  'tokens: heading mark and stray letters dropped; a capital inside a sentence marks a name, at its start it does not');

// the reader's record
assert(V.isKnown({ band: 2 }, undefined, 'B1') && !V.isKnown({ band: 3 }, undefined, 'B1') && V.isKnown({ band: 3 }, { seen: 3, taps: 0 }, 'B1'), 'known: inside the level\'s bands, or met three times without help');
assert(!V.isKnown({ band: 1 }, { seen: 5, taps: 1, since: 2 }, 'C1') && V.isKnown({ band: 5 }, { seen: 5, taps: 1, since: 3 }, 'A2') && V.isLearning({ taps: 1, since: 0 }) && !V.isLearning({ taps: 0, seen: 9 }),
  'known: a looked-up word is unknown (whatever its band) until it came back three times untapped');

// an article for one reader
const paras = ['The word is read.', 'The paradigm retrieves Tono. The zeitgeist mitigates the paradigm.'];
const p1 = V.profile(paras, lex, { level: 'B1' });
assert(p1.total === 13 && p1.unknown.map((u) => u.lemma).join() === 'paradigm,mitigate,zeitgeist' && p1.unknown[0].n === 2 && Math.abs(p1.coverage - 9 / 13) < 1e-9, 'profile: unknown words by how often they occur; a name counts as known');
const p2 = V.profile(paras, lex, { level: 'B1', rec: { paradigm: { seen: 3, taps: 0 }, retrieve: { seen: 1, taps: 1, since: 0 } } });
assert(p2.unknown.map((u) => u.lemma).join() === 'retrieve,mitigate,zeitgeist' && p2.review.join() === 'retrieves', 'profile: the record overrides the bands both ways; looked-up words that return are review words');
assert(V.profile([], lex).coverage === 0 && V.profile(null, lex).total === 0, 'profile: an empty article does not divide by zero');

// measured difficulty
const easy = ['The word is read. The word is the word. The word was read.'], hard = ['The zeitgeist mitigates the paradigm that retrieves the zeitgeist that mitigates the paradigm that the zeitgeist retrieves and mitigates.'];
const de = V.difficulty(easy, lex), dh = V.difficulty(hard, lex);
assert(de.tier === 0 && de.level === 'B1' && dh.tier === 2 && dh.level === 'C1' && dh.score > de.score && de.rare === 0 && dh.sentenceLen > de.sentenceLen, 'difficulty: common words in short sentences are the easiest tier; rare words in long sentences the hardest');
assert(V.pickByLevel(['C1', 'B2', 'B1'], 'B2') === 1 && V.pickByLevel(['C1', 'B1'], 'B2') === 0 && V.pickByLevel(['B1', 'B1'], 'B1') === 0 && V.pickByLevel(['A2', 'C1'], 'B1') === 0 && V.pickByLevel([], 'B1') === -1,
  'candidates: the reader\'s level first, then one level harder before one easier; ties keep the finder\'s order');

// recording a finished article
const r1 = V.recordArticle({}, paras, lex, { tapped: ['Paradigm', 'mitigates'], date: '2026-11-12' });
assert(r1.rec.paradigm.taps === 1 && r1.rec.paradigm.since === 0 && r1.rec.mitigate.tapped === '2026-11-12' && r1.rec.retrieve.seen === 1 && r1.rec.retrieve.taps === 0 && !('the' in r1.rec) && !('word' in r1.rec),
  'record: tapped words start learning; untapped rarer words are counted as seen; the commonest words are not stored');
let rec = r1.rec, grad = [];
for (let i = 0; i < 3; i++) { const r = V.recordArticle(rec, paras, lex, { tapped: [], date: '2026-11-1' + (3 + i) }); rec = r.rec; grad = r.graduated; }
assert(rec.paradigm.since === 3 && !V.isLearning(rec.paradigm) && grad.sort().join() === 'mitigate,paradigm' && V.stats(rec).graduated === 2 && V.stats(rec).learning === 0, 'record: three returns without a tap graduate a word, reported once');
const r2 = V.recordArticle(rec, paras, lex, { tapped: ['paradigm', 'elsewhere'], date: '2026-11-20' });
assert(V.isLearning(r2.rec.paradigm) && r2.rec.paradigm.taps === 2 && r2.rec.elsewhere.taps === 1 && V.learningWords(r2.rec).join() === 'paradigm,elsewhere' && r1.rec.paradigm.taps === 1,
  'record: tapping again sends a word back to learning; a tap on a word outside the text read is kept; the old record is not mutated');

// question types
assert(V.pickTypes({}).length === 3 && V.pickTypes({ main: { right: 5, total: 5 }, detail: { right: 2, total: 2 } }).join() === 'inference,vocab,attitude', 'types: the least asked types come first');
assert(V.pickTypes({ main: { right: 1, total: 4 }, detail: { right: 3, total: 4 }, inference: { right: 0, total: 2 } })[0] === 'main', 'types: the weakest type (three answers or more) is always asked');
const sc = V.scoreTypes({ main: { right: 1, total: 1 } }, [{ type: 'main' }, { type: 'bogus' }, { type: 'vocab' }], [{ ok: false }, { ok: true }, { ok: true }]);
assert(sc.main.total === 2 && sc.main.right === 1 && sc.vocab.right === 1 && !sc.bogus && V.weakestType(sc) === null && V.weakestType({ vocab: { right: 1, total: 3 } }).name.startsWith('詞義'), 'types: score kept per type; unknown types ignored; weakest needs three answers');

// the word lists shipped with the program
const wl = (f) => fs.readFileSync(path.join(__dirname, '..', 'lib', 'wordlists', f), 'utf8');
const real = V.createLexicon({ ngsl: wl('ngsl-1.2.txt'), sup: wl('ngsl-supplemental.txt'), nawl: wl('nawl-1.2.txt') });
assert(real.lookup('was').lemma === 'be' && real.lookup('the').band === 1 && real.lookup('hypothesis').band >= 3 && real.lookup('monday').band === 0 && real.size > 8000, 'shipped lists: NGSL, supplemental and NAWL load');
assert(['ngsl-1.2.txt', 'ngsl-supplemental.txt', 'nawl-1.2.txt'].every((f) => /CC BY-SA 4\.0/.test(wl(f)) && /Browne/.test(wl(f))) && fs.existsSync(path.join(__dirname, '..', 'lib', 'wordlists', 'README.md')), 'shipped lists: each file carries its attribution and licence');
const news = ['Scientists have discovered that the unprecedented proliferation of microplastics throughout marine ecosystems, which had previously been underestimated, poses considerable risks to biodiversity and may ultimately compromise the sustainability of commercial fisheries worldwide.'];
const kid = ['I have a dog. He is big. We play in the park every day. He likes to run. I like him very much. My mother gives him food.'];
assert(V.difficulty(kid, real).level === 'B1' && V.difficulty(news, real).level === 'C1', 'shipped lists: a children\'s text and a dense news sentence land in the lowest and highest tier');
