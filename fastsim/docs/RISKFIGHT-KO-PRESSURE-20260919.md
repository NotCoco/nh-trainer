# Risk Fight KO, chance and sustained-pressure training

This follows the user's clarification: every KO is the best outcome, creating
and avoiding lethal chances matters, and short tactical holds must be possible
without rewarding prolonged passivity. It supersedes the earlier stocked-combo
reward. The three scripted evaluation opponents are different attack/eating
timings, not fighting styles or action labels the policy has to reproduce.

The live `https://nh-train.com/assets/index-CRpel4c_.js` bundle was inspected on
19 September. It contains checkpoint `38253f5c8c9298c66986bd6d66cdc6342ef52620f4d4336e4cfc9cc0656a5954`
and parameter hash `397924d85e60a5edf9d5437c75531aa684619ca3021c34695c1710fe81f70fe0`,
matching the frozen local incumbent used here. Both policies are evaluated under
the current local source rules; the three pre-existing gameplay source changes
documented in the earlier chance report remain outside this task's edits.

## Objective fixed before training

`ko_chance_pressure_v1` has these components:

- Every win +100, every loss -100, simultaneous KO 0, timeout -30 each.
  Remaining food and combo type no longer change a KO's value. Combo counts
  remain diagnostics and carry no bonus.
- Chance potential: `20 * tanh(1.5 * (created - received))`, paid incrementally.
  Its slope is 30 near zero and its total stays within +/-20. It retains the
  same conditional first-passage probability calculation across one/two ticks,
  including source-engine accuracy, protection, ordered food, Vengeance and
  finite recoil. See the lethal-chance report for its conditional limitations.
- Useful direct damage: `5 * (1 - exp(-damage / 500))`, paid incrementally.
  No reflected damage, overkill, attack clicks, casts, healing or HP levels earn
  this credit. Its total is below 5, so DPS farming cannot outrank a KO.
- A missed normal-attack opportunity costs `.02 + .005 * recent_misses`, with
  a 20-game-tick rolling window including the current miss. Attacking does not
  reset that history. Each isolated miss costs .025; repeatedly alternating
  attack and wait still accumulates the surcharge. Normal weapon/food cooldowns,
  blocked attacks and dying before a scheduled attack add no misses. Eating on
  an otherwise ready tick has an opportunity cost; no extra charge is invented
  for forced recovery ticks. Actual launched attacks, including misses, count
  as attacks. A preloaded special that really launches also counts.

At the default 360-tick limit, the maximum missed-opportunity cost is 43.2.
Even the worst possible winning return exceeds the best drawing return; the
best losing return remains below the worst drawing return. Staying at full HP
does not earn reward. There is no runtime attack/eating/Vengeance override.

The unchanged 53-feature/21-action contract already observes Vengeance and PID.
`WAIT` cancels the target and can stop an attack. Rolling reward history remains
training-only and is not a new private policy feature. The unchanged action
space still lacks an atomic same-tick triple eat; that limitation is not hidden
by a scripted eating helper.

## Selection and verification

Validation selects mean complete objective return, then KO score. Held-out
fights are read only after selection. Qualification requires a positive KO-score
95% interval above .5, or a positive chance-difference interval with the KO-score
interval lower bound at least .48. Current score must be at least .5. It also
requires no supported current chance or varied chance/score regression, at least
90% of reference useful direct damage per tick, deliberate ready waits on at
most 8% of decision ticks, no head-to-head timeouts, legal actions and at least
.5 score against the older stable reference. These are evaluation checks, not
runtime constraints or a fixed allowance of waits per fight.

Typecheck, 27 focused Python tests, and the single browser verifier's
`--mechanics-only` path pass. The verifier includes probability oracles and
checks for a genuine cancelled attack, free normal cooldowns, food opportunity
cost, time-expiring rather than attack-resetting history, bounded DPS credit,
terminal dominance, and negative return for full-HP inactivity.

## Training

The initial run is `out/riskfight/20260919-ko-pressure-v1`: CUDA inference and
PPO, initialized from the live incumbent, 24 updates of 256 fresh fights, four
epochs, learning rate .00007, KL limit .02, base seed 27000041. Twelve independent
validation clusters select weights; 64 fresh held-out clusters and 16 clusters
per scripted opponent are reserved for final qualification. Each evaluation
cluster crosses both roles, both initial PID assignments, and distances 1/5/9.
No supervised tactic labels or policy overrides are introduced. Exact sources,
all checkpoints, reward accounting and seed provenance are retained.

Results will be recorded after the run completes. No deployment is part of this
training task.
