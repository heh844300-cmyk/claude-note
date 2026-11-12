// Settings changed from the app: only the listed keys, validated, merged into config.json without touching the rest.
'use strict';
const S = require('../lib/settings');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const throws = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };

const cfg = { vault: 'C:\\V', apiKey: 'secret', maxTopics: 6, termSplit: true, fillAfterMs: 60000, readingTime: '07:30', bigModel: 'sonnet', vaultExclude: ['私人'] };
const flat = S.view(cfg).flatMap((g) => g.items);
assert(!JSON.stringify(S.view(cfg)).includes('secret') && !flat.some((x) => ['vault', 'apiKey', 'port', 'claude', 'publicUrl', 'search'].includes(x.key)), 'view: keys, paths and addresses are never sent to the browser');
assert(flat.find((x) => x.key === 'fillAfterMs').value === 60 && flat.find((x) => x.key === 'termSplit').value === true && flat.find((x) => x.key === 'smallModel').value === '' && flat.find((x) => x.key === 'vaultExclude').value.join() === '私人',
  'view: milliseconds shown as seconds; missing values shown empty');

const v = S.validate({ maxTopics: '10', termSplit: false, fillAfterMs: 0, readingTime: '7:05', bigModel: ' opus ', vaultExclude: '私人\n\\日記\\2025\\\n私人' }, cfg);
assert(v.maxTopics === 10 && v.termSplit === false && v.fillAfterMs === 0 && v.readingTime === '07:05' && v.bigModel === 'opus' && v.vaultExclude.join() === '私人,日記/2025', 'validate: values cleaned and converted to what config.json stores');
assert(Object.keys(S.validate({ maxTopics: 6, termSplit: true, fillAfterMs: 60, readingTime: '07:30', vaultExclude: ['私人'] }, cfg)).length === 0, 'validate: unchanged values are not written');
assert(S.validate({ readingTime: '' }, cfg).readingTime === '' && S.validate({ bigModel: '' }, cfg).bigModel === '', 'validate: an empty time or model is allowed (off / provider default)');
assert(throws(() => S.validate({ maxTopics: 21 }, cfg)).includes('2～20') && throws(() => S.validate({ maxTopics: 1.5 }, cfg)) && throws(() => S.validate({ maxTopics: '' }, cfg)) && throws(() => S.validate({ termSplit: 'yes' }, cfg)) &&
  throws(() => S.validate({ readingTime: '25:00' }, cfg)) && throws(() => S.validate({ bigModel: 'a b; rm' }, cfg)) && throws(() => S.validate({ vaultExclude: '../外面' }, cfg)), 'validate: out-of-range and malformed values are refused with a message');
assert(throws(() => S.validate({ apiKey: 'x' }, cfg)).includes('apiKey') && throws(() => S.validate({ vault: 'D:\\' }, cfg)) && throws(() => S.validate({ __proto__x: 1 }, cfg)) && throws(() => S.validate(null, cfg)) && throws(() => S.validate([], cfg)),
  'validate: a key outside the list is refused, not ignored');

const text = '\uFEFF{\n  "vault": "C:\\\\V",\n  "apiKey": "secret",\n  "maxTopics": 6,\n  "custom": {"a": 1}\n}';
const out = JSON.parse(S.mergeIntoFile(text, { maxTopics: 10, readingTime: '' }));
assert(out.vault === 'C:\\V' && out.apiKey === 'secret' && out.custom.a === 1 && out.maxTopics === 10 && out.readingTime === '' && Object.keys(out).join() === 'vault,apiKey,maxTopics,custom,readingTime', 'merge: other keys and their order are kept; BOM tolerated');
assert(JSON.parse(S.mergeIntoFile('', { termSplit: false })).termSplit === false && throws(() => S.mergeIntoFile('{bad', { termSplit: false })) && throws(() => S.mergeIntoFile('{}', { apiKey: 'x' })) && throws(() => S.mergeIntoFile('[]', {})),
  'merge: a missing file starts empty; a broken file or an unlisted key stops the write');
assert(new Set(S.KEYS).size === S.KEYS.length && S.SCHEMA.every((g) => g.items.every((x) => x.label && x.hint && (x.type !== 'int' || x.max > x.min))), 'schema: unique keys, every item explained');
