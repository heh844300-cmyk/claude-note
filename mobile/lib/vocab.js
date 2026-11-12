// Vocabulary side of the daily English reading: frequency bands (NGSL / NAWL), lexical coverage of an article for one
// reader, the reader's word record (tapped = still learning, seen again untapped = known). Pure functions; no I/O.
'use strict';

// ---------- lexicon: word form -> { lemma, band } ----------
// bands: 0 = supplemental (days, months, numbers), 1–3 = NGSL by frequency rank (1–1000, 1001–2000, 2001+), 4 = NAWL (academic), 5 = on no list
const OFF = 5;
const BAND_NAMES = ['基本字', '最常用 1000 字', '常用 1001～2000 字', '常用 2001～2800 字', '學術用字', '詞表以外'];
const listLines = (text) => String(text || '').replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.toLowerCase().split(/\s+/));
function createLexicon({ ngsl = '', sup = '', nawl = '' } = {}) {
  const map = new Map();
  const add = (forms, band) => { for (const f of forms) if (!map.has(f)) map.set(f, { lemma: forms[0], band }); };
  listLines(ngsl).forEach((forms, i) => add(forms, i < 1000 ? 1 : i < 2000 ? 2 : 3));     // headwords first: a form never overrides a headword of a more frequent word
  listLines(sup).forEach((forms) => add(forms, 0));
  listLines(nawl).forEach((forms) => add(forms, 4));
  // regular inflections of words the lists do not spell out (and of off-list words): try the base form
  const lookup = (w) => {
    if (map.has(w)) return map.get(w);
    for (const [re, to] of [[/ies$/, 'y'], [/es$/, ''], [/s$/, ''], [/ied$/, 'y'], [/ed$/, ''], [/ed$/, 'e'], [/ing$/, ''], [/ing$/, 'e'], [/ly$/, ''], [/er$/, ''], [/est$/, '']]) {
      if (!re.test(w) || w.length < 5) continue;
      const b = w.replace(re, to);
      if (map.has(b)) return map.get(b);
    }
    return { lemma: w, band: OFF };
  };
  return { lookup, size: map.size };
}

// ---------- which bands a CEFR level is assumed to know (before the reader's own record says otherwise) ----------
const LEVEL_BAND = { A2: 1, B1: 2, B2: 3, C1: 4 };
const levelBand = (level) => LEVEL_BAND[String(level || '').toUpperCase()] || 2;
const GRADUATE = 3;                           // a looked-up word counts as known after it came back this many times without being tapped

// ---------- tokens ----------
// words of a paragraph; a capitalised off-list word that does not start a sentence is a name (names count as known)
function tokens(para) {
  const out = [];
  const s = String(para || '').replace(/^(## |- )/, '');
  const re = /[A-Za-z]+/g;
  for (let m; (m = re.exec(s));) {
    const w = m[0];
    if (w.length < 2 && !/^[aAiI]$/.test(w)) continue;                      // stray letters from contractions (isn't -> isn, t)
    const before = s.slice(0, m.index).replace(/["“‘'(\[\s]+$/, '');
    const startsSentence = !before || /[.!?:]$/.test(before);
    out.push({ w: w.toLowerCase(), raw: w, name: /^[A-Z]/.test(w) && !startsSentence });
  }
  return out;
}

// ---------- the reader's word record ----------
// rec[lemma] = { seen, taps, since, last }: seen = finished articles it appeared in; taps = articles it was tapped in;
// since = appearances after the last tap without tapping again
const isLearning = (e) => !!e && e.taps > 0 && (e.since || 0) < GRADUATE;
function isKnown(info, e, level) {
  if (e && e.taps > 0) return (e.since || 0) >= GRADUATE;                    // looked up: known only once it stopped needing a tap
  if (info.band <= levelBand(level)) return true;
  return !!e && (e.seen || 0) >= GRADUATE;                                   // met several times, never needed help
}

// ---------- an article for one reader ----------
function profile(paras, lex, { level = 'B1', rec = {} } = {}) {
  let total = 0, known = 0;
  const bands = [0, 0, 0, 0, 0, 0], unknown = new Map(), review = new Map(), lemmas = new Map();
  for (const p of paras || []) for (const t of tokens(p)) {
    const info = lex.lookup(t.w);
    total++;
    if (t.name && info.band === OFF) { known++; continue; }                  // proper nouns are not vocabulary
    bands[info.band]++;
    lemmas.set(info.lemma, (lemmas.get(info.lemma) || new Set()).add(t.w));
    const e = rec[info.lemma];
    if (isLearning(e)) review.set(info.lemma, (review.get(info.lemma) || new Set()).add(t.w));
    if (isKnown(info, e, level)) known++;
    else { const u = unknown.get(info.lemma) || { word: t.raw.toLowerCase(), lemma: info.lemma, band: info.band, n: 0 }; u.n++; unknown.set(info.lemma, u); }
  }
  return { total, coverage: total ? known / total : 0, bands, lemmas,
    unknown: [...unknown.values()].sort((a, b) => b.n - a.n || a.band - b.band),
    review: [...review.values()].flatMap((s) => [...s]) };
}
// difficulty of the text itself, measured (not asked from the AI): share of words beyond the 1000 most frequent + sentence length.
// Checked on the OneStopEnglish corpus (189 articles, each in elementary / intermediate / advanced): this score puts the three
// versions of an article in the right order 92.6% of the time (word frequency alone: 75%). The two cut points were fitted on half
// of the articles; on the other half the tier is exactly right 60% of the time and within one tier 95% — so it is used to compare
// candidates and as a second opinion beside the AI's level, never as the only judge.
// Tiers are read as B1 (elementary or easier), B2 (intermediate), C1 (advanced): an assumption, the corpus has no CEFR labels.
const CUTS = [0.354, 0.4019];
function difficulty(paras, lex) {
  const p = profile(paras, lex, { level: 'C1' });
  const voc = p.bands.reduce((a, b) => a + b, 0) || 1;
  const sentences = (paras || []).map((x) => String(x).replace(/^(## |- )/, '')).join(' ').split(/[.!?]+\s/).filter((s) => /[A-Za-z]/.test(s)).length || 1;
  const rare = (voc - p.bands[0] - p.bands[1]) / voc, sentenceLen = p.total / sentences;
  const score = rare + sentenceLen / 100;
  const tier = score < CUTS[0] ? 0 : score < CUTS[1] ? 1 : 2;
  return { score: Math.round(score * 1000) / 1000, rare: Math.round(rare * 1000) / 1000, sentenceLen: Math.round(sentenceLen * 10) / 10, tier, level: ['B1', 'B2', 'C1'][tier] };
}
const LV = ['A2', 'B1', 'B2', 'C1'];
// of several candidate articles (their measured levels), the one closest to the reader's level; one level harder beats one
// level easier (a simplified version exists for that), and ties keep the earlier one (the finder's own preference)
function pickByLevel(levels, userLevel) {
  const u = Math.max(0, LV.indexOf(userLevel));
  const cost = (l) => { const d = LV.indexOf(l) - u; return d === 0 ? 0 : d > 0 ? d : -d + 0.5; };
  let best = -1;
  levels.forEach((l, i) => { if (best < 0 || cost(l) < cost(levels[best])) best = i; });
  return best;
}
const pct = (c) => Math.round(c * 1000) / 10;

// ---------- after an article is finished: update the record ----------
// tapped: word forms the reader tapped in this article; only words worth tracking are stored (above the most common 1000, or ever tapped)
function recordArticle(rec0, paras, lex, { tapped = [], date = '' } = {}) {
  const rec = { ...rec0 };
  const taps = new Set(tapped.map((w) => lex.lookup(String(w).toLowerCase()).lemma));
  const p = profile(paras, lex, { rec: rec0 });
  const graduated = [];
  for (const lemma of p.lemmas.keys()) {
    const info = lex.lookup(lemma), e0 = rec[lemma];
    if (!e0 && !taps.has(lemma) && info.band <= 1) continue;
    const e = { seen: 0, taps: 0, since: 0, ...e0 };
    e.seen++; e.last = date;
    if (taps.has(lemma)) { e.taps++; e.since = 0; e.tapped = date; }
    else if (e.taps > 0) { const was = isLearning(e); e.since++; if (was && !isLearning(e)) graduated.push(lemma); }
    rec[lemma] = e;
  }
  for (const lemma of taps) if (!p.lemmas.has(lemma)) rec[lemma] = { seen: 1, since: 0, ...rec[lemma], taps: ((rec[lemma] || {}).taps || 0) + 1, tapped: date, last: date };
  return { rec, graduated, tapped: [...taps] };
}
const stats = (rec) => {
  const all = Object.values(rec || {});
  return { learning: all.filter(isLearning).length, graduated: all.filter((e) => e.taps > 0 && !isLearning(e)).length, tracked: all.length };
};
const learningWords = (rec, max = 30) => Object.entries(rec || {}).filter(([, e]) => isLearning(e)).sort((a, b) => String(b[1].tapped || '').localeCompare(String(a[1].tapped || ''))).slice(0, max).map(([w]) => w);

// ---------- comprehension question types: the program chooses them and keeps the score per type ----------
const QTYPES = { main: '主旨', detail: '細節', inference: '推論', vocab: '詞義（從上下文判斷）', attitude: '作者的態度或目的' };
// three types for the next article: the weakest one (at least 3 answers on record) first, then the ones asked least so far
function pickTypes(score = {}, n = 3) {
  const keys = Object.keys(QTYPES);
  const total = (k) => (score[k] && score[k].total) || 0, rate = (k) => (total(k) ? score[k].right / total(k) : 1);
  const weak = keys.filter((k) => total(k) >= 3 && rate(k) < 1).sort((a, b) => rate(a) - rate(b))[0];
  const rest = keys.filter((k) => k !== weak).sort((a, b) => total(a) - total(b));
  return (weak ? [weak, ...rest] : rest).slice(0, n);
}
function scoreTypes(score0 = {}, questions = [], items = []) {
  const score = JSON.parse(JSON.stringify(score0 || {}));
  questions.forEach((q, i) => {
    if (!QTYPES[q.type] || !items[i]) return;
    const s = (score[q.type] = score[q.type] || { right: 0, total: 0 });
    s.total++; if (items[i].ok) s.right++;
  });
  return score;
}
const weakestType = (score = {}) => {
  const k = Object.keys(QTYPES).filter((x) => score[x] && score[x].total >= 3 && score[x].right < score[x].total).sort((a, b) => score[a].right / score[a].total - score[b].right / score[b].total)[0];
  return k ? { type: k, name: QTYPES[k], right: score[k].right, total: score[k].total } : null;
};

module.exports = { OFF, BAND_NAMES, createLexicon, levelBand, GRADUATE, tokens, isLearning, isKnown, profile, difficulty, CUTS, pickByLevel, pct,
  recordArticle, stats, learningWords, QTYPES, pickTypes, scoreTypes, weakestType };
