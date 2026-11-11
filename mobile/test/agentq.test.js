'use strict';
const { pickJobs } = require('../lib/agentq.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const J = (id, kind, note, status = 'queued') => ({ id, kind, note, status });

let r = pickJobs([J(1, 'expand', '研究/A.md'), J(2, 'expand', '研究/B.md'), J(3, 'expand', '研究/C.md'), J(4, 'expand', '研究/D.md')], { parallel: 3, lightRunning: 0, heavyBusy: false });
assert(r.light.map((j) => j.id).join() === '1,2,3', 'up to `parallel` light jobs start together, oldest first');
r = pickJobs([J(1, 'expand', '研究/A.md'), J(2, 'expand', '研究/B.md')], { parallel: 3, lightRunning: 2, heavyBusy: false });
assert(r.light.length === 1, 'jobs already running count toward the limit');
r = pickJobs([J(1, 'expand', '研究/A.md', 'running'), J(2, 'expand', '研究/A.md'), J(3, 'expand', '研究/B.md')], { parallel: 3, lightRunning: 1, heavyBusy: false });
assert(r.light.map((j) => j.id).join() === '3', 'two jobs on the same note never run together');
r = pickJobs([J(1, 'fill', '研究/A.md'), J(2, 'fill', '研究/B.md')], { parallel: 3, lightRunning: 0, heavyBusy: false });
assert(!r.light.length && r.heavy && r.heavy.id === 1, 'gray-link fills stay one at a time (they may rewrite links in other notes)');
r = pickJobs([J(1, 'expand', '研究/A.md', 'running'), J(2, 'expand', '研究/A.md')], { parallel: 3, lightRunning: 1, heavyBusy: false });
assert(r.light.length === 0, 'a note with a running job waits');

r = pickJobs([J(1, 'terms', 'n1.md'), J(2, undefined, 'n1.md'), J(3, 'expand', '研究/A.md')], { parallel: 3, lightRunning: 0, heavyBusy: false });
assert(r.heavy && r.heavy.id === 1 && r.light.length === 1, 'one heavy job (oldest) starts alongside light jobs');
r = pickJobs([J(1, 'terms', 'n1.md', 'running'), J(2, undefined, 'n2.md')], { parallel: 3, lightRunning: 0, heavyBusy: true });
assert(r.heavy === null, 'heavy jobs run one at a time');
r = pickJobs([J(1, 'expand', '研究/A.md', 'running'), J(2, undefined, '研究/A.md'), J(3, undefined, 'n3.md')], { parallel: 3, lightRunning: 1, heavyBusy: false });
assert(r.heavy === null, 'heavy jobs keep their order: the first waits for its note instead of being skipped');
r = pickJobs([J(1, 'expand', '研究/A.md', 'done'), J(2, 'expand', '研究/B.md', 'error')], { parallel: 3, lightRunning: 0, heavyBusy: false });
assert(!r.light.length && !r.heavy, 'finished jobs are not started again');
r = pickJobs([J(1, 'expand', '研究/A.md'), J(2, 'expand', '研究/B.md')], { parallel: 1, lightRunning: 0, heavyBusy: false });
assert(r.light.length === 1, 'agentParallel 1 means one at a time');

const { trimJobs } = require('../lib/agentq.js');
const list = [J(1, 'x', 'a', 'done'), J(2, 'x', 'b', 'queued'), J(3, 'x', 'c', 'error'), J(4, 'x', 'd', 'running'), J(5, 'x', 'e', 'queued')];
trimJobs(list, 3);
assert(list.map((j) => j.id).join() === '2,4,5', 'trimming drops the oldest finished jobs, never queued or running ones');
const busyList = [J(1, 'x', 'a'), J(2, 'x', 'b'), J(3, 'x', 'c')];
trimJobs(busyList, 2);
assert(busyList.length === 3, 'a list of only active jobs may exceed the cap rather than lose work');
