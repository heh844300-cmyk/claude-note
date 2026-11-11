'use strict';
// Which queued Agent jobs may start now.
// expand only reads and writes its own research note (synchronously) and never uses the sandbox, so up to `parallel` run side by side;
// everything else stays one at a time: research and term splits edit the user's note in order, and a fill may rewrite
// [[links]] across the whole vault (redirectLinks), which must not race another writer.
const LIGHT = new Set(['expand']);

function pickJobs(jobs, { parallel, lightRunning, heavyBusy }) {
  const busy = new Set(jobs.filter((j) => j.status === 'running').map((j) => j.note)); // never two jobs on one note
  const light = [];
  for (const j of jobs) {
    if (lightRunning + light.length >= parallel) break;
    if (j.status !== 'queued' || !LIGHT.has(j.kind) || busy.has(j.note)) continue;
    light.push(j); busy.add(j.note);
  }
  // FIFO among heavy jobs: the first queued one waits for a light job on its note instead of being skipped
  const first = heavyBusy ? null : jobs.find((j) => j.status === 'queued' && !LIGHT.has(j.kind));
  const heavy = first && !busy.has(first.note) ? first : null;
  return { light, heavy };
}

// keep the job list at `max` by dropping the oldest finished jobs; queued / running ones are never dropped
function trimJobs(jobs, max) {
  for (let i = 0; jobs.length > max && i < jobs.length;) {
    if (jobs[i].status === 'queued' || jobs[i].status === 'running') i++; else jobs.splice(i, 1);
  }
  return jobs;
}

module.exports = { LIGHT, pickJobs, trimJobs };
