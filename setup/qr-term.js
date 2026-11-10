// Print a QR code in the console (used by the setup wizard so a phone can scan the URL off the screen).
// Light modules are drawn as full blocks, so it scans on the usual black console background.
'use strict';
const { encode } = require('../mobile/lib/qr');
const text = process.argv[2];
if (!text) { console.error('usage: node qr-term.js <text>'); process.exit(1); }
const m = encode(text), n = m.length, q = 2;
const dark = (x, y) => x >= 0 && y >= 0 && x < n && y < n && m[y][x];
const lines = [];
for (let y = -q; y < n + q; y++) {
  let s = '  ';
  for (let x = -q; x < n + q; x++) s += dark(x, y) ? '  ' : '██';
  lines.push(s);
}
process.stdout.write(lines.join('\n') + '\n');
