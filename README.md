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
`c = Z²` (χ²₁, mean 1 under independence). The walk is `Σ(c−1)`; session
significance `Zc = Σ(c−1)/√(2N)` ≈ N(0,1). Computed for the full swarm and
separately for the physical and algorithmic subsets.

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

Read those two loosely. The depression trace carries memory across epochs, so
consecutive samples are not independent and the paired Z runs optimistic; and both
readouts share the same input, so their p-values must not be multiplied.

## What this is not

It measures **coincidence, not meaning**. Run long enough and you *will* cross
p<0.05 about one session in twenty by chance — that is calibration, not a message.
Every arm must be an independent draw; never derive one arm from another.
