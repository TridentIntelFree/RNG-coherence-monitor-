# entropy-audit

Two measurements that are easy to get wrong by eye, extracted from the
[SYNCHRONICITY_MACHINE](../../) coherence monitor — where both were built
because assuming them cost real false positives.

Zero dependencies. Node or browser. `node test.js` → 29 checks.

## `assessEntropy(bytes)` — is this actually random?

```js
const { assessEntropy } = require('entropy-audit');
assessEntropy(crypto.randomBytes(20000));
// { minEntropyPerByte: 7.29, maxAchievableAtThisN: 7.22,
//   fractionOfAchievable: 1.01, verdict: 'looks-full-entropy',
//   repetitionCountTest: { pass: true, ... },
//   adaptiveProportionTest: { pass: true, ... } }
```

Runs the two NIST SP 800-90B **continuous health tests** — Repetition Count and
Adaptive Proportion, at α=2⁻²⁰, with cutoffs computed from the exact binomial
tail and **verified minimal** (`Pr[X≥C] ≤ α` while `Pr[X≥C−1] > α` at every
tested H) — plus the MCV min-entropy estimator.

**It reports the ceiling.** With finite samples some symbol is always
over-represented, so MCV cannot report 8 bits/byte until n is large: at 8,000
bytes a *flawless* source tops out near 6.9. The verdict is judged against what
is achievable at your sample size, because telling someone their correct CSPRNG
is deficient is the worst kind of false alarm. The predicted ceiling tracks real
CSPRNG scores within 0.06 bits from n=2,000 to n=2,000,000.

**It catches structure MCV cannot see.** A 0–255 counter has a perfectly flat
histogram and scores 7.6 b/B on MCV alone. Compressibility *beyond what the
symbol distribution explains* flags it as `structured`. A genuinely random
16-symbol alphabet compresses to ~50% and is correctly **not** flagged — it is
`reduced-entropy` at ~4 b/B, which is the truth.

> **Caveat, stated up front:** MCV is one of ten SP 800-90B non-IID estimators
> and the real suite takes the **minimum** across all of them. This is an
> **upper bound**. There are no restart tests. Use it to catch broken sources,
> not to certify good ones.

## `hacZ(series)` — is my p-value lying to me?

```js
const { hacZ } = require('entropy-audit');
hacZ(benchmarkTimings);
// { naiveZ: 5.31, naiveP: 1e-7,     <- what you would have reported
//   z: 2.83,    p: 0.0046,          <- after accounting for correlation
//   vif: 3.51, effectiveN: 171,     <- of 600 samples
//   lag1Autocorrelation: 0.730,
//   notes: ['samples are correlated (lag-1 r=0.730): the naive interval is 1.87x too narrow'] }
```

`sd/√n` assumes every sample is independent of the last. Benchmark timings
aren't — thermal drift and cache state correlate them. Neither are latency
samples, per-deploy error rates, or anything with drift. When they're
correlated the naive interval is too narrow and **you announce an effect that
isn't there.**

This estimates the long-run variance from the series itself (Newey–West,
Bartlett window) and returns **both** results so the gap is visible. Measured
false-positive rate on AR(1) null series, nominal 0.050:

| ρ | n | naive | corrected |
|---|---|---|---|
| 0.0 | 500 | 0.040 | 0.037 |
| 0.3 | 500 | 0.152 | **0.068** |
| 0.6 | 500 | 0.328 | **0.100** |
| 0.8 | 1000 | 0.505 | **0.180** |
| 0.9 | 2000 | 0.640 | **0.250** |

> **It narrows the gap, it does not close it.** Newey–West is asymptotic; under
> strong persistence with few samples it still under-corrects badly. At ρ=0.9 it
> takes you from catastrophic to merely bad. Treat a corrected result on a
> highly persistent series as a lower bound on your uncertainty, not a fix.

A real effect still survives: a genuine +0.5 shift under ρ=0.7 reports
z=7.9 with effective N of 212 from 800 samples.

`pairedNull(signal, control)` compares against a matched control run when no
analytic null exists. `HacAccumulator` is the streaming form, for series too
long to hold in memory.

## MCP server

```json
{ "mcpServers": { "entropy-audit": { "command": "node",
    "args": ["/path/to/tools/entropy-audit/mcp-server.js"] } } }
```

Exposes `assess_entropy`, `hac_z` and `paired_null`. Zero dependencies, raw
JSON-RPC over stdio, so it drops into any agent setup.

## CLI

```
head -c 100000 /dev/urandom | ./cli.js entropy
./cli.js hac timings.txt
```

## Why this exists

Three times while building the monitor, I reported a statistic that assumed
independence it didn't have: the walk-chart confidence bands, an arm whose
values autocorrelated at r=0.72, and my own detector firing at 13% where 5% was
nominal. Each took a Monte Carlo to catch. This is that lesson, made callable.
