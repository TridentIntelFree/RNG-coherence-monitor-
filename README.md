# RNG-coherence-monitor-

Seeking anomalous coherence in randomness.

A single-file browser instrument (`index.html`). Every second it draws from a swarm
of independent entropy arms — a CSPRNG, five separately-seeded PRNGs as null
controls, CPU/clock timing jitter, device motion, the arrival timing of the
Wikipedia / Bluesky / Mastodon firehoses, drand, and the Coinbase tape — and asks
whether they agree more than independence allows. A slow context ring (solar wind,
seismic, barometric, tide, river, air quality, swell, NIST, HN, GitHub) rides
alongside and never touches the statistic.

## The statistic

Each epoch, over the arms with genuinely fresh data: `Z = Σzᵢ/√N`, coherence
`c = Z²` (χ²₁, mean 1 under independence). The walk is `Σ(c−1)`. Computed for
the full swarm and separately for the physical and algorithmic subsets.

The textbook session significance `Σ(c−1)/√(2N)` assumes every epoch is
independent of the last — but that assumption *is* the experiment, so it isn't
taken on trust. The long-run variance is estimated from the series itself
(Newey–West, Bartlett window): it collapses to exactly `√(2N)` when epochs
really are independent, and widens the error bar when they aren't. The estimate
is clamped so the correction can only ever widen the interval, never narrow it —
a downward sampling fluctuation would otherwise manufacture confidence. The
inflation factor shows as `vif` when it exceeds 1.05.

**The one rule, instrumented.** Every arm must be an independent draw, so every
arm is measured for it: each row reports live `n`, realised `σ̂` (should be 1.00)
and lag-1 `r₁` (should be 0), and flags amber past 4σ. This caught the original
Coinbase arm — an EWMA z of realised volatility, which inherits volatility
clustering at `r₁ ≈ 0.72`. With only two live physical arms that pushed the
detector panel's p<0.05 rate from 5% to 12%. It now draws from trade arrival
timing and tick/size low bits. No variance estimator can rescue a badly
dependent arm, so the tool names the offender instead of absorbing it.

**Detector vs control.** The subsets use disjoint arms, so their session Z's are
independent and `(Z_det − Z_ctl)/√2` is itself ≈N(0,1). That difference is the
hypothesis the whole instrument exists to test, so it's reported with a p-value.

## Running it

The session survives a reload — only running sums are stored, so a resumed
session is numerically identical to one that never stopped. `Reset` discards it.
`CSV` exports the per-epoch series; `JSON` exports the full session state
including every arm's diagnostics.

`setInterval` is not a clock: a hidden tab gets throttled, often to once a
minute. A late epoch is **discarded**, not counted, and the stream backlog
cleared — folding a minute of events into one "one-second" draw would change
what the arms measure. Discarded gaps and measured epoch spacing are both shown.
Sampling continues while the tab is hidden; only the painting stops.

## The fly-brain readout

The χ² statistic tests one very specific hypothesis: *everything leaning the same
way at once*. `FLY.BRAIN` reads the same per-epoch swarm vector through a
*Drosophila*-shaped circuit instead of a sum, so it can see structure the sum is
blind to:

- **Antennal lobe** — 48 glomeruli with divisive gain control.
- **Mushroom body** — 2000 Kenyon cells, 6 random PN claws each; an APL-style
  global inhibitory neuron squeezes this to a ~5% sparse code (a random-projection
  hash of the swarm's configuration).
- **MBON** — one output neuron whose KC synapses depress on use and slowly recover.
  A configuration the brain has seen before lands on weakened synapses and produces
  **low** drive. That is a familiarity/novelty detector: it answers *has this
  happened before?*
- **Ellipsoid body** — a 16-wedge ring attractor (local excitation, global
  inhibition). Its bump vector strength `PVA` answers *does the swarm point
  somewhere?*

Parameters follow the published hemibrain / FlyWire connectome figures; the wiring
is redrawn from fresh entropy at every boot, because individual flies differ. This
is a model of that circuit's shape, not fly data.

**It is not an arm.** It is derived from the arms, so feeding it into the coherence
statistic would manufacture exactly the fake coherence the project's one rule
forbids. And a circuit with memory has no analytic null — so every epoch an
**identical twin brain** (same wiring, same parameters, same live channels) is fed
matched synthetic noise, and both readouts are reported as **paired differences
against that live null**: `Z_fam` from `MBON_null − MBON_signal`, `Z_ring` from
`PVA_signal − PVA_null`.

The paired differences are not independent across epochs — the MBON depression
trace and the ring attractor both carry state — so the same Newey–West correction
the main statistic uses is applied here, with the same one-directional floor.

Read them loosely anyway. Measured against a pure null over 360 independent cold
boots of 1200 epochs, `Z_fam` crosses |Z|>1.96 about 6.7% of the time and `Z_ring`
about 5.6%, against a nominal 5%: the MBON trace's memory runs to ~220 epochs,
past what any practical lag window recovers. These are exploratory readouts, not
calibrated evidence. And never multiply the two p-values — they share an input.

## The seed extractor

The swarm is a pile of entropy sources, so it can hand you a seed. Every enabled
layer is folded through `HKDF-SHA-256` (RFC 5869) into 128/256/512 bits — on your
device, no network call, no storage, gone on reload.

**The safety argument is the design.** `crypto.getRandomValues()` is always in the
input *and* supplies the salt, and cannot be switched off, so extra layers can only
add — never subtract. With six of the seven layers pinned to a constant, 400
extractions are still all distinct and statistically indistinguishable from pure
CSPRNG output. This is not "more random" than your CSPRNG; nothing is. It is *less
dependent on any single source*.

Layers: CSPRNG floor (always on) · timing jitter · pointer/touch movement · device
motion · microphone noise floor, LSBs only · your own typed dice rolls · the public
swarm.

**Every source is measured, not trusted.** Each layer runs the two NIST SP 800-90B
continuous health tests — Repetition Count and Adaptive Proportion at α=2⁻²⁰ — plus
the MCV min-entropy estimator (§6.3.1). Min-entropy is assessed once and then
**latched**: cutoffs hold fixed against that assessment, because recomputing them
from the live estimate would let a failing source drag its own cutoff down and never
trip. A source that degrades after assessment fires its test and drops to claiming
zero bits.

Public sources count as **zero secret bits**, always — drand and the firehoses are
unpredictable in advance but anyone can watch the same events.

The crypto (SHA-256, HMAC, HKDF) is implemented in the page and verified against
FIPS 180-4, RFC 4231 and RFC 5869 vectors, so it also works with the page saved and
opened offline.

⚠️ A browser tab is not a safe place to make long-lived secrets. Don't generate
wallets or production keys here. And no seed is ever served from a server — a seed
that came off a server is known to that server.

## What this is not

It measures **coincidence, not meaning**. Run long enough and you *will* cross
p<0.05 about one session in twenty by chance — that is calibration, not a message.
Every arm must be an independent draw; never derive one arm from another.

The page shows several statistics at once — full swarm, detectors, controls,
their difference, and two fly-brain readouts. They are not independent tests and
no correction is applied across them. Don't read the smallest p on the page as
if it were the only one you looked at.
