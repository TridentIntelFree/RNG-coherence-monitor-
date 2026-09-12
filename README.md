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

Read them loosely anyway. Measured against a pure null over 560 independent cold
boots of 1200 epochs, `Z_fam` crosses |Z|>1.96 about 6.2% of the time and `Z_ring`
about 5.4%, against a nominal 5% — and the far tail is worse, with |Z|>3 landing
perhaps 2–3× more often than the nominal 0.27%. The MBON trace's memory runs to
~220 epochs, past what any practical lag window recovers. These are exploratory
readouts, not calibrated evidence. Never multiply the two p-values — they share
an input.

### Depth

Five MB compartments (γ, β′, β, α′, α) read the same sparse code at their own
rates — relaxing over roughly 36, 69, 138, 278 and 526 seconds. β keeps the exact
constants the statistic was calibrated against, verified bit-for-bit against the
old single-compartment model over 1500 epochs. Alongside: a stereotyped **lateral
horn**, a bump that **rotates** under a PEN-like drive, the 16→18 **protocerebral
bridge** mapping, and a **fan-shaped body** whose eight layers smear the bump into
a comet trail.

**KC code reuse** measures how much of this epoch's sparse code the previous epoch
already used. Its baseline is *not* K/N — uneven glomerular drive makes some Kenyon
cells win more often, so random input already reuses above K/N. The null twin is
the honest baseline and is shown beside it. Independent draws: signal and null
together near 6–9%. Near-frozen input: signal **76%**, null 7%. Slow drift: **38%**
vs 9%. Common mode barely moves it — that is the ring's job.

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

## The keyed channel

A seed is a key, so the extractor feeds a message box: **AES-256-GCM**, key derived
from the seed by HKDF under its own domain label, a fresh random 96-bit nonce per
message, envelope tag bound in as AAD. Output is a `SYNC1.…` blob you carry
yourself — no server, no account, no transport.

The cipher comes from **WebCrypto**, not from this page. The in-page SHA-256 exists
so HKDF works air-gapped; a block cipher is not something to improvise. Where
WebCrypto is unavailable the panel disables itself rather than falling back to
something weaker.

**The key travels separately — that is the whole security model.** Compare
fingerprints first: derived from the key, reveals nothing about it, safe to read
aloud. Matching fingerprints mean matching keys.

⚠️ Not a secure messenger. No forward secrecy — a leaked key opens every past
message. No sender identity: anyone with the key can forge. Replays undetected.
Use Signal for real conversations. Use this to hand someone a note with no server
in the middle, and rotate keys freely.

Verified: round-trip across independent instances, wrong key rejected, single
flipped ciphertext or nonce bit rejected by the GCM tag, 120 encryptions of
identical plaintext yielding 120 distinct nonces and ciphertexts, short keys
refused, and message bodies rendered via `textContent` so a hostile decrypted
payload cannot inject markup.

## What this is not

It measures **coincidence, not meaning**. Run long enough and you *will* cross
p<0.05 about one session in twenty by chance — that is calibration, not a message.
Every arm must be an independent draw; never derive one arm from another.

The page shows several statistics at once — full swarm, detectors, controls,
their difference, and two fly-brain readouts. They are not independent tests and
no correction is applied across them. Don't read the smallest p on the page as
if it were the only one you looked at.
