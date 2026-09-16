'use strict';
const A = require('./index.js');
const crypto = require('crypto');
let pass = 0, fail = 0;
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log('  FAIL ' + name + (detail ? '\n        ' + detail : '')); } };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

console.log('\n=== APT cutoffs: minimal against the exact binomial tail ===');
const survival = (n, p, c) => { let s = 0;
  for (let k = c; k <= n; k++) {
    const lg = lgam(n + 1) - lgam(k + 1) - lgam(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p);
    s += Math.exp(lg);
  } return s; };
function lgam(x) { const C=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y=x,tmp=x+5.5,ser=1.000000000190015; tmp-=(x+.5)*Math.log(tmp);
  for(let j=0;j<6;j++)ser+=C[j]/++y; return -tmp+Math.log(2.5066282746310005*ser/x); }
const alpha = Math.pow(2, -20);
let allMinimal = true;
for (const H of [0.5, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const c = A.aptCutoff(512, H), n = 511, p = Math.pow(2, -H);
  const atC = survival(n, p, c), atC1 = survival(n, p, c - 1);
  const minimal = atC <= alpha && atC1 > alpha;
  if (!minimal) allMinimal = false;
  console.log(`  H=${String(H).padStart(3)}  C=${String(c).padStart(4)}  Pr[X>=C]=${atC.toExponential(2)}  Pr[X>=C-1]=${atC1.toExponential(2)}  ${minimal ? 'minimal' : 'NOT MINIMAL'}`);
}
t('every APT cutoff is the minimal one', allMinimal);
t('APT cutoffs decrease with entropy', [0.5,1,2,3,4,5,6,7,8].map(h => A.aptCutoff(512,h)).every((v,i,a) => i===0 || v<=a[i-1]));
t('RCT cutoff matches 1+ceil(20/H)', A.rctCutoff(1)===21 && A.rctCutoff(4)===6 && A.rctCutoff(8)===4);

console.log('\n=== MCV estimator against known distributions ===');
const mcvOf = (gen, n) => { const h = new Uint32Array(256); for (let i=0;i<n;i++) h[gen()]++; return A.mcvMinEntropy(h, n); };
const cases = [
  ['uniform bytes (true H = 8.00)', () => crypto.randomBytes(1)[0], 8.00, 0.30],
  ['4 values equiprobable (2.00)',  () => crypto.randomBytes(1)[0] & 3, 2.00, 0.05],
  ['constant (0.00)',               () => 0, 0.00, 0.01],
  ['50% zero, rest uniform (1.00)', () => { const b = crypto.randomBytes(1)[0]; return b < 128 ? 0 : b; }, 1.00, 0.05],
];
for (const [label, gen, expect, tol] of cases) {
  const got = mcvOf(gen, 200000);
  const ok = Math.abs(got - expect) <= tol;
  console.log(`  ${label.padEnd(34)} measured ${got.toFixed(3)}`);
  t(label, ok, `expected ~${expect} +-${tol}, got ${got.toFixed(3)}`);
}

console.log('\n=== MCV ceiling: what a PERFECT source could score at each n ===');
let ceilOK = true;
for (const n of [2000, 8000, 20000, 200000, 2000000]) {
  const ceil = A.mcvCeiling(n);
  const real = A.mcvMinEntropy((() => { const h = new Uint32Array(256);
    const b = crypto.randomBytes(Math.min(n, 400000));
    for (let i = 0; i < b.length; i++) h[b[i]]++;
    // scale a smaller sample up for the very large n case
    if (n > b.length) for (let i = 0; i < 256; i++) h[i] = Math.round(h[i] * n / b.length);
    return h; })(), n);
  const err = Math.abs(ceil - real);
  if (err > 0.35) ceilOK = false;
  console.log(`  n=${String(n).padStart(8)}  predicted ceiling ${ceil.toFixed(2)}   actual CSPRNG ${real.toFixed(2)}   diff ${err.toFixed(2)}`);
}
t('ceiling predicts real CSPRNG scores across five sample sizes', ceilOK);

console.log('\n=== assessEntropy end to end ===');
const good = A.assessEntropy(crypto.randomBytes(20000));
console.log(`  CSPRNG           H=${good.minEntropyPerByte} b/B  verdict=${good.verdict}  compress=${good.compressionRatio}`);
t('CSPRNG passes both health tests', good.repetitionCountTest.pass && good.adaptiveProportionTest.pass);
t('CSPRNG reads as full entropy', good.verdict === 'looks-full-entropy');
// the false-alarm case: a perfect CSPRNG measured over a SMALL sample
const small = A.assessEntropy(crypto.randomBytes(3000));
console.log(`  CSPRNG @3000B    H=${small.minEntropyPerByte} ceiling=${small.maxAchievableAtThisN} frac=${small.fractionOfAchievable} verdict=${small.verdict}`);
t('a good CSPRNG is NOT maligned on a small sample', small.verdict === 'looks-full-entropy', 'got ' + small.verdict);

const stuck = A.assessEntropy(Buffer.alloc(20000, 0x5a));
console.log(`  stuck-at-0x5a    H=${stuck.minEntropyPerByte} b/B  verdict=${stuck.verdict}  RCT pass=${stuck.repetitionCountTest.pass}`);
t('stuck source fails the repetition test', !stuck.repetitionCountTest.pass);
t('stuck source reports zero entropy', stuck.minEntropyPerByte === 0);

const counter = Buffer.alloc(20000); for (let i = 0; i < 20000; i++) counter[i] = i & 255;
const ctr = A.assessEntropy(counter);
console.log(`  counter 0..255   H=${ctr.minEntropyPerByte} b/B  verdict=${ctr.verdict}  compress=${ctr.compressionRatio}`);
t('counter is caught as structured despite a flat histogram', ctr.verdict === 'structured');
t('...and MCV alone would have been fooled', ctr.minEntropyPerByte > 7.0);

const weak = Buffer.alloc(20000); for (let i = 0; i < 20000; i++) weak[i] = Math.floor(Math.random() * 16);
const w = A.assessEntropy(weak);
console.log(`  16 values only   H=${w.minEntropyPerByte} b/B  verdict=${w.verdict}  distinct=${w.distinctValues}`);
t('16-value source reports ~4 bits', Math.abs(w.minEntropyPerByte - 4) < 0.35);
t('16-value source is NOT called structured (it is genuinely random, just narrower)', w.verdict === 'reduced-entropy', 'got ' + w.verdict);

console.log('\n=== hacZ: does the correction actually restore calibration? ===');
function falsePositiveRate(rho, n, trials) {
  let naive = 0, corrected = 0;
  for (let m = 0; m < trials; m++) {
    const s = []; let prev = 0;
    for (let i = 0; i < n; i++) { prev = rho * prev + Math.sqrt(1 - rho * rho) * gauss(); s.push(prev); }
    const r = A.hacZ(s);
    if (r.naivelySignificant) naive++;
    if (r.significant) corrected++;
  }
  return [naive / trials, corrected / trials];
}
console.log('  AR(1) null series; both should fire at 0.050');
console.log('   rho     n     naive    corrected');
let improved = 0, tested = 0;
for (const [rho, n] of [[0, 500], [0.3, 500], [0.6, 500], [0.8, 1000], [0.9, 2000]]) {
  const [nv, cv] = falsePositiveRate(rho, n, 400);
  console.log(`  ${String(rho).padEnd(5)} ${String(n).padStart(5)}    ${nv.toFixed(3)}     ${cv.toFixed(3)}`);
  if (rho > 0) { tested++; if (cv < nv) improved++; }
}
t('correction lowers the false-positive rate at every positive rho', improved === tested, `${improved}/${tested}`);
const [n0, c0] = falsePositiveRate(0, 500, 600);
t('independent series: correction costs little (naive ' + n0.toFixed(3) + ' -> ' + c0.toFixed(3) + ')', Math.abs(c0 - 0.05) < 0.035);

console.log('\n=== hacZ: a real effect must still be detected ===');
const withEffect = []; let p2 = 0;
for (let i = 0; i < 800; i++) { p2 = 0.7 * p2 + Math.sqrt(1 - 0.49) * gauss(); withEffect.push(p2 + 0.5); }
const eff = A.hacZ(withEffect);
console.log(`  mean=${eff.mean}  naiveZ=${eff.naiveZ}  z=${eff.z}  vif=${eff.vif}  effectiveN=${eff.effectiveN}/800`);
t('genuine shift is still significant after correction', eff.significant);
t('correction widened the interval', eff.vif > 1.2);
t('effective N is below raw N', eff.effectiveN < 800);

console.log('\n=== pairedNull ===');
const ctrl = Array.from({length: 600}, gauss);
const same = Array.from({length: 600}, gauss);
const shifted = same.map(v => v + 0.4);
// a single comparison of two null series IS a 5%-false-positive test, so check
// the rate over many trials rather than asserting one draw came out clean
let fp = 0;
for (let m = 0; m < 400; m++) {
  const c = Array.from({length: 400}, gauss), s2 = Array.from({length: 400}, gauss);
  if (A.pairedNull(s2, c).significant) fp++;
}
console.log(`  matched controls: ${(100*fp/400).toFixed(1)}% flagged over 400 trials (expect ~5%)`);
t('matched controls flagged at about the nominal rate', Math.abs(fp/400 - 0.05) < 0.035, `${fp}/400`);
let det = 0;
for (let m = 0; m < 100; m++) {
  const c = Array.from({length: 400}, gauss), s2 = c.map(() => gauss() + 0.4);
  if (A.pairedNull(s2, c).significant) det++;
}
console.log(`  shifted signal:   ${det}% detected over 100 trials`);
t('a real shift is detected nearly always', det >= 95, `${det}/100`);

console.log('\n=== HacAccumulator matches the batch form ===');
const series = Array.from({length: 1500}, gauss);
const acc = new A.HacAccumulator(32);
series.forEach(v => acc.push(v));
const st = acc.result(), bt = A.hacZ(series);
console.log(`  streaming z=${st.z}  batch z=${bt.z}  (bandwidth ${st.bandwidth}/${bt.bandwidth})`);
t('streaming and batch agree to 3 decimals', Math.abs(st.z - bt.z) < 0.002, `${st.z} vs ${bt.z}`);

console.log('\n=== input handling ===');
t('hex string accepted', A.assessEntropy('deadbeef'.repeat(100)).n === 400);
t('array accepted', A.assessEntropy(Array.from({length: 300}, () => 7)).n === 300);
t('short input refused politely', A.assessEntropy([1,2,3]).verdict === 'insufficient-data');
try { A.hacZ([1,2,3]); t('hacZ rejects tiny series', false); }
catch (e) { t('hacZ rejects tiny series', e instanceof RangeError); }

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
