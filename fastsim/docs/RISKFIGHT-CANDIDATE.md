# Webweaver risk-fight CUDA candidate

Historical v1 report. The local browser candidate is now described in
[the 17 September browser audit and v2 training report](RISKFIGHT-BROWSER-AUDIT-20260917.md).
The v1 mirror-self-play KO rate below is not evidence of improvement against
another opponent.

Status: **explicit opt-in local browser/FastSim candidate; not promoted and not a Java policy**.

The retained DMM model, safekeep checkpoints, deployed/rollback fixtures and
policy assets were not changed.  The candidate uses its own 45-feature,
18-main-action, 3-prayer-action and 3-movement-action schema.  The existing
114-input/86-action DMM loader intentionally cannot load it.  The local browser
instead embeds the exported payload behind a distinct `RiskFightPolicyController`
whose runtime profile is `risk_webweaver_v1`.

## Result

Run `20260831T140504Z` used the RTX 4060 Ti for every policy/model training
tensor and Adam moment.  It trained a 65,752-row tactical bootstrap followed by
four fresh shared-policy self-play updates (148,386; 143,960; 139,074; and
129,524 active agent decisions).  The fourth update was selected on disjoint
validation seeds.

Held-out deterministic shared-policy self-play used 64 unseen seeds, three
start distances (1, 5 and 9), and both initial PID assignments: 384 matched
fights total.

- 378 valid, opponent-attributed KOs (98.4375%)
- 5 timeouts (1.3021%)
- 1 simultaneous KO (0.2604%; both agents received the death terminal)
- 0 illegal actions and 0 unattributed deaths
- 188/192 and 190/192 valid KOs in the two initial-PID buckets
- 126/128, 125/128 and 127/128 valid KOs at distances 1, 5 and 9
- KO sources: 269 ordinary Webweaver, 67 Elder maul, 26 Webweaver Swarm,
  14 Vengeance and 2 recoil
- winner sides: 186 versus 192 (1.59% imbalance)
- mean per agent: 75.43 legal attacks, 19.24 food uses, 5.87 regular
  Vengeance casts, 193.55 Ultor-worn ticks; movement changed final distance in
  79.17% of fights
- 28,525 total Vengeance reflection damage; maximum eight casts in a 360-tick
  episode, consistent with first casts no closer than 50 logical ticks

Self-play valid-KO rate increased across the four optimizer updates from
77.73% to 87.11%, 91.41% and 95.31%; timeout rate fell from 21.48% to 12.11%,
8.59% and 4.30%.  The separately held-out result above is from the selected
fourth update.

Artifacts (ignored by Git and not promoted):

- `fastsim/out/riskfight/20260831T140504Z/webweaver-riskfight-candidate.pt`
- `fastsim/out/riskfight/20260831T140504Z/report.json`
- `fastsim/out/riskfight/20260831T140504Z/heldout-fights.jsonl`

Local browser export and integration artifacts (also not promoted):

- `src/generated/webweaver-riskfight-candidate.json`
- `src/bot/riskfight-policy.ts`
- `scripts/verify-riskfight-browser-candidate.mjs`

## Mechanics: facts versus assumptions

Kronos source facts:

- Logical combat time is always 600 ms.  Accelerated training changes only
  wall-clock throughput; it must not change a tick count.
- `Projectile.send` uses Chebyshev distance and
  `durationStart + increment * max(0, distance - 1)`. `Hit.clientDelay`
  converts client cycles with integer division by the 600 ms logical tick.
- Normal Webweaver arrows therefore arrive in 2 ticks at distance 1 and 3 at
  distance 9 in this loadout.
- Swarm uses four independent hit rolls and four distinct projectile profiles.
  Their arrival delays are `[1,1,2,3]` at distance 1 and `[2,2,3,3]` at
  distance 9.  They must not be collapsed onto one generic ranged due tick.
- `Hit.defend` compensates the stored counter when the target has already been
  processed.  PID changes same-tick entity/action resolution order; it does
  not shorten absolute projectile travel.  Both target-order assignments are
  tested at near and far distance.
- Regular Vengeance costs 4 astral, 2 death and 10 earth runes; the preset has
  ten casts.  It reflects `ceil(75% * positive hit)` and has a 50-logical-tick
  cooldown.  The first legal recast is T+50 even in accelerated worlds.
- The Kronos server currently has no Elder maul special implementation.  This
  candidate uses the six-tick normal crush attack and does not silently train
  the browser draft's Pulverize behavior.

OSRS evidence and inference:

- [Jagex's official February 2016 PvP poll](https://oldschool.runescape.com/polls/2016/1305)
  describes PID as the order in which player actions are registered and
  confirms it was then randomized every game tick. Later official-news text
  mirrored by the OSRS Wiki describes less-frequent rerolls. These establish
  the action-order role of PID, not the private projectile formula used by
  this Kronos revision.
- The exact travel formula, counter compensation and Webweaver projectile
  constants in this candidate come from the checked-in Kronos Java source,
  because that is the game being trained—not from an unsupported claim about
  current live OSRS internals.

Explicit assumptions/known gaps:

- The current browser draft persists a randomized PID order and rerolls after
  40–60 ticks.  Kronos `CoreWorker` rebuilds index order each tick, so its
  scramble appears to affect only the reroll tick.  The candidate follows the
  browser behavior; Java matched-fight parity stays failed until one owner is
  deliberately chosen.
- Protection prayer is enabled and offensive Rigour/Piety follows attack
  style.  Poison is not approximated.  Movement is Chebyshev distance, not
  collision-aware routing.  Drink animation timing is not modeled.

## Reward invariant

Reward is individual, adversarial and undiscounted (`gamma = 1`):

- Every shaping transition is finite and the per-agent episode ledger is hard
  clipped to `[-32,+32]`.  The normalized self and opponent ledgers are policy
  inputs, so saturation is observable rather than hidden history.
- Damage shaping is zero-sum.  Legal attacks and Vengeance casts have no free
  positive reward.  Illegal attempts are individually negative.
- A sole living winner gets `+100` only when the lethal damage retains an
  opponent owner, recognized combat action/source and causal tick. For direct
  attacks that is the launch tick; for Vengeance it is the original legal cast
  tick. The loser gets `-100`. Invalid external death gets `0/0`, timeout gets
  `0/0`, and simultaneous death gets `-100/-100` to avoid a shared suicide
  reward.
- Terminal emission is guarded once per agent.

Therefore the worst valid winner is `100 - 32 = +68`, strictly above the best
non-KO trajectory `+32`.  The best possible loser is `-100 + 32 = -68`,
strictly below the worst non-KO trajectory `-32`.  The strict margin is 36 and
requires `100 > 2 * 32`.

This theorem is deliberately per agent.  Making the *sum* of both agents'
terminal rewards positive would let a shared self-play policy profit from
assigning one copy to commit suicide.  The PPO policy objective uses the
undiscounted per-agent return directly; its auxiliary value head cannot
redefine the utility ordering.

## CUDA proof

- Python 3.12.5; PyTorch 2.11.0+cu128; CUDA build 12.8
- NVIDIA GeForce RTX 4060 Ti; driver 596.49; capability 8.9; 8187.5 MiB
- model parameter devices: only `cuda:0`
- Adam `exp_avg` and `exp_avg_sq`: only `cuda:0` (PyTorch's scalar step counter
  is intentionally CPU)
- parameter SHA-256 changed from
  `f3b891d1b0195b2db519040361f6309ddd61cf4656ff4774c922ef46a762cf74`
  to `ed7e6987e4669ac8da0dc997f1ff42d3aeb7e6bddb666b7f9890f2fe682d415b`
- peak allocated/reserved CUDA memory: 65.56/92.00 MiB

`train_riskfight_cuda.py` rejects a CPU device, unavailable CUDA, failed CUDA
kernel allocation, non-CUDA model parameters/buffers, non-CUDA training
batches/logits/returns/advantages/losses and non-CUDA Adam learned moments.
The branchy combat environment remains NumPy/CPU; the policy forward/backward
and optimizer work are CUDA.

## Why it is not promoted

All isolated training behavioral gates passed.  The immutable training report's
global gate remains false because browser schema integration and Java
matched-fight parity were both false when that report was written.

The local branch now supplies the missing browser side as an opt-in
`Riskfight CUDA Candidate` setup.  It uses the embedded checkpoint export, its
own profile-aware loader/decoder and controller, regular rune-pouch Vengeance,
Webweaver foods/ring actions, and four source-distinct Swarm projectile
profiles.  `npm run verify:riskfight-browser-candidate` checks the exact
checkpoint/parameter/schema identities, a deterministic PyTorch inference
fixture, the action adapter and those mechanics.  This local integration does
not alter the stable/default policy path and is not a promotion.

Java matched-fight parity remains the promotion blocker.  In particular,
FastSim and this browser candidate persist the selected PID order between
40–60-tick rerolls, while Java rebuilds physical player-index order every tick
and randomizes only on the scramble tick.  The safe next phase is to choose the
intended ownership contract deliberately and obtain FastSim/browser/Java trace
parity.  Do not relabel a DMM checkpoint or overwrite the current DMM model.

## Reproduce

From `C:\Kronos\KronosNHTrainer\fastsim`:

```powershell
python tests/test_riskfight.py -v
python train_riskfight_cuda.py --device cuda:0 --oracle-fights 200 --oracle-epochs 20 --selfplay-fights 256 --selfplay-updates 4 --eval-seeds 64 --max-ticks 360 --output-dir out/riskfight
```
