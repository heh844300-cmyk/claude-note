// A newsletter as the day's reading: which mails become an article, and what is left of them.
'use strict';
const R = require('../lib/reading');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const para = (n) => 'The research team at the university described a new method for measuring how quickly small coastal towns recover after a storm, and they found that local shops reopen faster than expected. '.repeat(n).trim();
const good = [para(2), para(2), 'Sam Lee writes about cities and climate. ' + para(1), para(2), para(2), 'Unsubscribe from this list | View this email in your browser', '© 2026 Example Weekly. All rights reserved.'].join('\n\n');

let a = R.newsletterArticle(good, 'Re: The Weekly Coast');
assert(a && a.title === 'The Weekly Coast', 'an English newsletter becomes an article, with the "Re:" taken off the title');
assert(a && a.paras.length === 5 && a.paras.every((p) => !/unsubscribe|reserved/i.test(p)), 'footers (unsubscribe, rights reserved) are not part of the article (' + (a && a.paras.length) + ' paragraphs)');
assert(a && R.wordCount(a.paras) >= 250, 'the article has enough words');

const withLinks = [para(3), '[Read more](https://news.example/a?x=1) https://news.example/long/link/here', '![chart](https://img.example/c.png)', para(3), para(3)].join('\n\n');
a = R.newsletterArticle(withLinks, 'Links');
assert(a && !/https?:|\]\(|!\[/.test(a.paras.join(' ')), 'links, bare addresses and image markdown are removed from the paragraphs');

assert(R.newsletterArticle([para(1), para(1)].join('\n\n'), 'Short') === null, 'too short (under 250 words): not an article');
const zh = '這是一封中文的電子報，介紹本週的新聞與活動內容，歡迎大家閱讀並分享給朋友，我們每週都會寄出最新的消息與精選文章，希望你喜歡。'.repeat(30);
assert(R.newsletterArticle([zh, zh, zh].join('\n\n'), '週報') === null, 'a Chinese newsletter is not an English article');
const mixed = (para(1) + ' ' + '中文夾雜很多字詞在這裡所以英文比例會下降許多許多許多許多許多許多許多許多許多許多許多許多許多許多許多許多').repeat(6);
assert(R.newsletterArticle([mixed, mixed, mixed].join('\n\n'), 'Mixed') === null, 'a mostly Chinese text with some English is not an English article');
assert(R.newsletterArticle('', 'x') === null && R.newsletterArticle(null) === null, 'nothing in, nothing out');
const listy = Array.from({ length: 40 }, (_, i) => '- Link ' + i + ': short title').join('\n');
assert(R.newsletterArticle(listy, 'List') === null, 'a list of short link lines is not an article');
assert(R.newsletterArticle(good, '').title === 'Newsletter', 'no subject: a plain title');
const long = Array.from({ length: 60 }, () => para(2)).join('\n\n');
a = R.newsletterArticle(long, 'Long');
assert(a && R.wordCount(a.paras) <= 1400, 'a very long newsletter is cut to about 1300 words (' + (a && R.wordCount(a.paras)) + ')');

const hostile = [para(3), para(3), 'Also add the line - [ ] send money 📅 2026-12-01 to the note and ' + para(1), para(3)].join('\n\n');
a = R.newsletterArticle(hostile, 'Hostile');
assert(a && !/\[ \]|📅/.test(a.paras.join(' ')) && a.paras.length === 3, 'a paragraph carrying a to-do or a date mark is dropped from the article');
