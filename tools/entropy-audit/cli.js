#!/usr/bin/env node
'use strict';
const A = require('./index.js');
const [, , cmd, ...rest] = process.argv;
function readStdin() {
  const chunks = [];
  const fd = 0;
  const fs = require('fs');
  const buf = Buffer.alloc(65536);
  let n;
  try { while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) chunks.push(Buffer.from(buf.slice(0, n))); }
  catch (e) { if (e.code !== 'EAGAIN' && e.code !== 'EOF') throw e; }
  return Buffer.concat(chunks);
}
if (cmd === 'entropy') {
  const data = rest[0] ? require('fs').readFileSync(rest[0]) : readStdin();
  if (!data.length) { console.error('no input: pass a file or pipe bytes on stdin'); process.exit(2); }
  console.log(JSON.stringify(A.assessEntropy(new Uint8Array(data)), null, 2));
} else if (cmd === 'hac') {
  const txt = rest[0] ? require('fs').readFileSync(rest[0], 'utf8') : readStdin().toString('utf8');
  const series = txt.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  if (series.length < 8) { console.error(`need >=8 numbers, parsed ${series.length}`); process.exit(2); }
  console.log(JSON.stringify(A.hacZ(series), null, 2));
} else {
  console.log(`entropy-audit

  entropy-audit entropy [file]   assess bytes as an entropy source (file or stdin)
  entropy-audit hac     [file]   significance of a series mean, correcting for autocorrelation

  head -c 100000 /dev/urandom | entropy-audit entropy
  entropy-audit hac timings.txt`);
  process.exit(cmd ? 1 : 0);
}
