'use strict';
/**
 * entropy-audit — two measurements that are easy to get wrong by eye.
 *
 * Extracted from the SYNCHRONICITY_MACHINE coherence monitor, where both were
 * built because assuming them cost real false positives.
 *
 * Zero dependencies. Works in node and in a browser (see the UMD tail).
 */

// ─────────────────────────────────────────────────────────────────────────────
// numerics
// ─────────────────────────────────────────────────────────────────────────────
const LGC = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
function lgamma(x) {
  let y = x, tmp = x + 5.5, ser = 1.000000000190015;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (let j = 0; j < 6; j++) ser += LGC[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function erf(x) {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
  const t = 1 / (1 + p * x);
  return s * (1 - ((((a5*t + a4)*t + a3)*t + a2)*t + a1) * t * Math.exp(-x*x));
}
const normCdf = x => 0.5 * (1 + erf(x / Math.SQRT2));
/** Two-tailed p for a standard normal deviate. */
function pTwoTailed(z) {
  const a = Math.abs(z);
  if (a > 8.2) return 0;
  return 2 * (1 - normCdf(a));
}

// ─────────────────────────────────────────────────────────────────────────────
// NIST SP 800-90B
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Most Common Value estimator (SP 800-90B §6.3.1): a 99% upper confidence
 * bound on the most likely symbol, converted to min-entropy.
 */
function mcvMinEntropy(hist, n) {
  if (n < 128) return null;
  let mx = 0;
  for (let i = 0; i < hist.length; i++) if (hist[i] > mx) mx = hist[i];
  const p = mx / n;
  const pu = Math.min(1, p + 2.576 * Math.sqrt(p * (1 - p) / (n - 1)));
  return Math.max(0, -Math.log(pu) / Math.LN2);
}

/**
 * Adaptive Proportion Test cutoff: the smallest C with
 * Pr[Binomial(W-1, 2^-H) >= C] <= alpha.  Computed from the exact binomial
 * tail in log space, summed downward so tiny terms cannot dominate.
 */
function aptCutoff(W, H, alpha = Math.pow(2, -20)) {
  const n = W - 1, p = Math.pow(2, -H);
  if (!(p > 0 && p < 1)) return W;
  const lp = Math.log(p), lq = Math.log(1 - p), lnf = lgamma(n + 1);
  let acc = 0;
  for (let c = n; c >= 1; c--) {
    acc += Math.exp(lnf - lgamma(c + 1) - lgamma(n - c + 1) + c * lp + (n - c) * lq);
    if (acc > alpha) return Math.min(W, c + 1);
  }
  return 1;
}

/** Repetition Count Test cutoff (SP 800-90B §4.4.1) at alpha = 2^-20. */
const rctCutoff = H => 1 + Math.ceil(20 / H);

/**
 * The highest min-entropy the MCV estimator can report for a PERFECT source at
 * this sample size. MCV uses a 99% upper bound on the most common symbol, and
 * with finite samples some bin is always over-represented, so the estimate is
 * capped well below 8 bits until n is large. Without this, a flawless CSPRNG
 * measured over a few thousand bytes looks deficient — which is a false alarm
 * about correct code, the worst kind for a tool like this to raise.
 */
function mcvCeiling(n, k = 256) {
  if (n < 128) return 0;
  const p = 1 / k, mu = n * p, sd = Math.sqrt(n * p * (1 - p));
  const expectedMax = mu + Math.sqrt(2 * Math.log(k)) * sd;   // expected max of k bins
  const ph = Math.min(1, expectedMax / n);
  const pu = Math.min(1, ph + 2.576 * Math.sqrt(ph * (1 - ph) / (n - 1)));
  return Math.max(0, -Math.log(pu) / Math.LN2);
}

function toBytes(data) {
  if (typeof data === 'string') {
    const hex = data.replace(/[^0-9a-fA-F]/g, '');
    if (hex.length < 2) throw new TypeError('string input must be hex');
    const out = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) return new Uint8Array(data);
  throw new TypeError('expected Uint8Array, Buffer, number[] or hex string');
}

/**
 * Assess a byte sequence as an entropy source.
 *
 * Runs the two SP 800-90B *continuous health tests* (Repetition Count and
 * Adaptive Proportion) against the assessed min-entropy, plus the MCV
 * estimator and two structural checks.
 *
 * NOT a full 800-90B validation: no restart tests, no IID track, and only one
 * of the ten non-IID estimators. The real suite takes the MINIMUM across all
 * of them, so treat `minEntropyPerByte` as an UPPER bound. The structural
 * checks exist to catch the cases where MCV is most optimistic.
 */
function assessEntropy(data, opts = {}) {
  const bytes = toBytes(data);
  const n = bytes.length;
  const W = opts.aptWindow || 512;
  const notes = [];
  if (n < 1024) notes.push(`only ${n} bytes: estimates are wide below ~1024, and MCV is bounded by sample size`);

  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[bytes[i]]++;
  const H = mcvMinEntropy(hist, n);
  if (H === null) {
    return { n, minEntropyPerByte: null, verdict: 'insufficient-data',
             notes: [`need at least 128 bytes, got ${n}`] };
  }
  const Hc = Math.max(H, 0.05);
  const rctC = rctCutoff(Hc), aptC = aptCutoff(W, Hc);

  // Repetition Count Test — longest run of one identical value
  let longest = 1, run = 1;
  for (let i = 1; i < n; i++) {
    run = bytes[i] === bytes[i - 1] ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // Adaptive Proportion Test — occurrences of each window's first value
  let aptMax = 0;
  for (let s = 0; s + W <= n; s += W) {
    const first = bytes[s];
    let c = 0;
    for (let i = s; i < s + W; i++) if (bytes[i] === first) c++;
    if (c > aptMax) aptMax = c;
  }

  // structural checks: where MCV is most likely to overstate
  let lag1 = null;
  if (n > 32) {
    let m = 0; for (let i = 0; i < n; i++) m += bytes[i]; m /= n;
    let v = 0, c1 = 0;
    for (let i = 0; i < n; i++) v += (bytes[i] - m) ** 2;
    for (let i = 1; i < n; i++) c1 += (bytes[i] - m) * (bytes[i - 1] - m);
    v /= n; lag1 = v > 1e-12 ? (c1 / (n - 1)) / v : 0;
  }
  let compressionRatio = null;
  try {                                    // node only; a strong structure detector
    const zlib = require('zlib');
    compressionRatio = zlib.deflateRawSync(Buffer.from(bytes), { level: 9 }).length / n;
  } catch (_) { /* browser, or zlib unavailable */ }

  const rctPass = longest < rctC;
  const aptPass = aptMax < aptC;
  if (!rctPass) notes.push(`repetition count test FAILED: a run of ${longest} identical bytes, cutoff ${rctC}`);
  if (!aptPass) notes.push(`adaptive proportion test FAILED: ${aptMax} of ${W} identical in a window, cutoff ${aptC}`);
  if (lag1 !== null && Math.abs(lag1) * Math.sqrt(n) > 4)
    notes.push(`serial correlation at lag 1 is ${lag1.toFixed(3)} — successive bytes are not independent, so the MCV figure overstates`);
  // Compression alone is a bad structure test: a source that is genuinely random
  // over a 16-symbol alphabet compresses to ~50% and is not "structured" at all.
  // What matters is compressing BEYOND what the symbol distribution already
  // explains — that is serial structure the MCV estimator cannot see.
  const expectedRatio = H / 8;
  const excess = (compressionRatio !== null && expectedRatio > 0.01)
    ? compressionRatio / expectedRatio : null;
  const structured = excess !== null && excess < 0.85;
  if (structured)
    notes.push(`compresses to ${(100 * compressionRatio).toFixed(0)}%, well past the ${(100 * expectedRatio).toFixed(0)}% its symbol distribution explains — serial structure MCV cannot see, so the estimate overstates substantially`);
  const ceiling = mcvCeiling(n);
  const ratio = ceiling > 0 ? H / ceiling : 0;
  if (ceiling < 7.9)
    notes.push(`at ${n} bytes the highest any source could score is ${ceiling.toFixed(2)} b/B — compare against that, not against 8. More data raises the ceiling.`);

  const healthy = rctPass && aptPass;
  const verdict = !healthy ? 'fails-health-tests'
    : structured ? 'structured'
    : ratio >= 0.95 ? 'looks-full-entropy'   // judged against what is achievable at this n
    : H >= 2.0 ? 'reduced-entropy'           // a genuinely random 16-symbol alphabet is 4 b/B
    : H > 0.5  ? 'low-entropy'
    : 'negligible-entropy';

  return {
    n,
    minEntropyPerByte: +H.toFixed(4),
    maxAchievableAtThisN: +ceiling.toFixed(4),
    fractionOfAchievable: +ratio.toFixed(3),
    minEntropyTotalBits: Math.round(n * H),
    repetitionCountTest: { pass: rctPass, longestRun: longest, cutoff: rctC },
    adaptiveProportionTest: { pass: aptPass, maxCount: aptMax, cutoff: aptC, window: W },
    serialCorrelationLag1: lag1 === null ? null : +lag1.toFixed(4),
    compressionRatio: compressionRatio === null ? null : +compressionRatio.toFixed(3),
    excessCompression: excess === null ? null : +excess.toFixed(3),
    distinctValues: hist.reduce((a, c) => a + (c > 0 ? 1 : 0), 0),
    verdict,
    notes,
    caveat: 'MCV is one of ten SP 800-90B non-IID estimators; the full suite takes the minimum, so this is an UPPER bound. No restart tests.'
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HAC / Newey-West
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Significance of a series mean when the samples may not be independent.
 *
 * The textbook standard error, sd/sqrt(n), assumes every sample is independent
 * of the last. Benchmark timings, latency samples, per-deploy error rates and
 * anything with a trend are not, and the naive interval is then too narrow —
 * you announce an effect that is not there.
 *
 * This estimates the long-run variance from the series itself (Newey-West with
 * a Bartlett window) and reports both, so you can see what the assumption was
 * buying you.
 */
function hacZ(series, opts = {}) {
  const x = Float64Array.from(series);
  const n = x.length;
  if (n < 8) throw new RangeError(`need at least 8 samples, got ${n}`);
  const mu0 = opts.mu0 || 0;
  const conservative = opts.conservative !== false;

  let mean = 0; for (let i = 0; i < n; i++) mean += x[i]; mean /= n;
  let g0 = 0; for (let i = 0; i < n; i++) g0 += (x[i] - mean) ** 2; g0 /= n;
  if (!(g0 > 1e-300)) {
    return { n, mean, constant: true, z: 0, p: 1, vif: 1,
             verdict: 'constant series — no variance to test against' };
  }
  // Newey-West bandwidth: the standard 4(n/100)^(2/9) rule unless overridden
  let L = opts.maxLag != null ? opts.maxLag
        : Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
  L = Math.max(1, Math.min(L, Math.floor(n / 4)));

  const gamma = k => {
    let s = 0;
    for (let i = k; i < n; i++) s += (x[i] - mean) * (x[i - k] - mean);
    return s / (n - k);
  };
  let s2 = g0;
  for (let k = 1; k <= L; k++) s2 += 2 * (1 - k / (L + 1)) * gamma(k);
  if (!(s2 > 1e-300)) s2 = g0;
  // conservative: the correction may only ever widen the interval, never narrow
  // it, because a downward sampling fluctuation would manufacture confidence.
  if (conservative && s2 < g0) s2 = g0;

  const vif = s2 / g0;
  const naiveZ = (mean - mu0) / Math.sqrt(g0 / n);
  const z = (mean - mu0) / Math.sqrt(s2 / n);
  const lag1 = gamma(1) / g0;
  const effN = n / vif;

  const notes = [];
  if (vif > 1.25) notes.push(`samples are correlated (lag-1 r=${lag1.toFixed(3)}): the naive interval is ${Math.sqrt(vif).toFixed(2)}x too narrow`);
  if (Math.abs(naiveZ) > 1.96 && Math.abs(z) <= 1.96)
    notes.push('SIGNIFICANCE DISAPPEARS once correlation is accounted for — the naive result was an artefact');
  if (n < 100) notes.push(`only ${n} samples: the long-run variance estimate is itself noisy here`);
  if (L >= Math.floor(n / 4)) notes.push('bandwidth is capped by series length; a longer series would estimate it better');

  return {
    n, mean: +mean.toFixed(6), mu0,
    z: +z.toFixed(4), p: pTwoTailed(z),
    naiveZ: +naiveZ.toFixed(4), naiveP: pTwoTailed(naiveZ),
    vif: +vif.toFixed(4),
    effectiveN: Math.round(effN),
    lag1Autocorrelation: +lag1.toFixed(4),
    bandwidth: L,
    significant: Math.abs(z) > 1.96,
    naivelySignificant: Math.abs(naiveZ) > 1.96,
    notes,
    caveat: 'Newey-West is asymptotic; with strong persistence and few samples it under-corrects. It narrows the gap, it does not close it.'
  };
}

/**
 * Compare a measurement against a matched control run, when no analytic null
 * exists. Returns the significance of (signal - control), with the same
 * autocorrelation handling applied to the difference.
 */
function pairedNull(signal, control, opts = {}) {
  const a = Array.from(signal), b = Array.from(control);
  if (a.length !== b.length) throw new RangeError(`series must be the same length: ${a.length} vs ${b.length}`);
  const d = a.map((v, i) => v - b[i]);
  const r = hacZ(d, opts);
  return Object.assign({}, r, {
    signalMean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(6),
    controlMean: +(b.reduce((s, v) => s + v, 0) / b.length).toFixed(6),
    interpretation: r.significant
      ? 'signal differs from its matched control beyond chance'
      : 'signal is indistinguishable from its matched control'
  });
}

/** Streaming form of hacZ, for series too long to hold in memory. */
class HacAccumulator {
  constructor(maxLag = 32) {
    this.maxLag = maxLag; this.W = maxLag + 1;
    this.n = 0; this.sum = 0; this.sq = 0; this.head = 0;
    this.ring = new Float64Array(this.W); this.cross = new Float64Array(this.W);
  }
  push(v) {
    this.n++; this.sum += v; this.sq += v * v;
    const L = Math.min(this.maxLag, this.n - 1);
    for (let k = 1; k <= L; k++)
      this.cross[k] += v * this.ring[((this.head - k + 1) % this.W + this.W) % this.W];
    this.head = (this.head + 1) % this.W;
    this.ring[this.head] = v;
    return this;
  }
  result(opts = {}) {
    const n = this.n;
    if (n < 8) throw new RangeError(`need at least 8 samples, got ${n}`);
    const mean = this.sum / n, g0 = this.sq / n - mean * mean;
    if (!(g0 > 1e-300)) return { n, mean, constant: true, z: 0, p: 1, vif: 1 };
    let L = opts.maxLag != null ? opts.maxLag
          : Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
    L = Math.max(1, Math.min(L, this.maxLag, Math.floor(n / 4)));
    let s2 = g0;
    for (let k = 1; k <= L; k++) s2 += 2 * (1 - k / (L + 1)) * (this.cross[k] / (n - k) - mean * mean);
    if (!(s2 > 1e-300)) s2 = g0;
    if (opts.conservative !== false && s2 < g0) s2 = g0;
    const mu0 = opts.mu0 || 0;
    const z = (mean - mu0) / Math.sqrt(s2 / n);
    return { n, mean: +mean.toFixed(6), z: +z.toFixed(4), p: pTwoTailed(z),
             naiveZ: +((mean - mu0) / Math.sqrt(g0 / n)).toFixed(4),
             vif: +(s2 / g0).toFixed(4), effectiveN: Math.round(n / (s2 / g0)), bandwidth: L };
  }
}

const api = { assessEntropy, hacZ, pairedNull, HacAccumulator,
              mcvMinEntropy, mcvCeiling, aptCutoff, rctCutoff, pTwoTailed };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.entropyAudit = api;
