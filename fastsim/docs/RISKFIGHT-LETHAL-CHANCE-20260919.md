# Risk Fight lethal-chance training — 19 September 2026

Training completed, but the selected candidate did not establish an improvement
on fresh evaluation. It was retained for inspection/continuation and **not
exported, activated, pushed or deployed**. The existing Risk Fight, NH and DMM
policy artifacts are unchanged.

The requested objective is to create meaningful lethal chances while avoiding
being chanced, including bursts spread across two adjacent game ticks. There is
no fixed HP penalty, eating bonus, forced eating rule, or Vengeance-cast bonus.

## Grading

`lethal_chance_v1` adds a symmetric term to the existing stocked-combo objective:

`100 * (new lethal probability created - new lethal probability received)`.

The training-only grader reads committed/resolved impacts, including misses.
It uses each hit's source-engine accuracy and discrete uniform damage roll from
zero through the maximum, with the engine's protection reduction. It propagates
HP probability mass through the recorded event order, applying the source
consumable function to each surviving HP state. Dead branches cannot eat later.
Vengeance consumes the first positive triggering hit and reflects the same roll
using the engine's ceiling rule. Recoil charges and finite spare rings are carried
through the probability calculation. Reflected hitsplats do not introduce new,
independent rolls. A double-maul dispatch includes its committed second roll even
if the first actual roll killed and suppressed the second rendered hitsplat.

Each step grades the current and preceding tick together. It subtracts death
probability before the current tick, so an old lethal opportunity is not paid
again merely because its events remain in the window. The first tick's realized
low roll does not replace its distribution when grading the follow-up. Supplies
are applied in their actual order, with per-branch healing caps. Chance credit is
retained for wins, losses, simultaneous KOs and timeouts. The old provisional
combo bonus retains its existing terminal refund rules. Exhausted-opponent KOs
still receive no terminal/combo bonus, but now retain chance grading.

For two independent accurate 0–40 hits, lethal probability is 1/1681 at 80 HP
and 231/1681 at 60 HP. At 50% accuracy per hit, the 80-HP probability is
0.25/1681. These are conditional examples, not claimed in-game maul accuracy.

This is an exact marginal calculation **conditional on the recorded attack and
consumption sequence**, not an alternative-policy simulation. It does not invent
unlaunched attacks or re-decide future food/actions after alternative damage.
Opponent actions are held fixed, including actions that an alternative early KO
could have prevented. It therefore measures exposure along a committed/observed
sequence, rather than an unconditional probability of losing the whole fight.
Per-fight chance metrics are sums of first-passage contributions, not a single
0–100% fight-loss probability. No private grading data enters policy observations.

The existing 53-feature / 21-main-action policy contract is preserved. It offers
double-food actions and a separate brew action; an atomic same-tick triple eat
is not currently an available policy action. This run changes the learned
choices and reward, not the action vocabulary or playable combat mechanics.

## Training and selection

- Initialize from the current local checkpoint in
  `out/riskfight/20260918-finishing-coverage-v1-replay/selected-candidate-v2.pt`.
- Keep its frozen weights as the main comparison and the original migrated v1
  checkpoint as a separate stable reference.
- Use the browser's actual engine, CUDA inference/optimization, 12 PPO updates
  of 192 fresh fights, four epochs, learning rate 0.00007, KL limit 0.02.
- No supervised eating/HP labels or demonstration warm-start. Rollout opposition
  remains current incumbent, self-play, lagged policy and observation-only scripts.
- Base seed 23000027; 16 validation clusters; 64 final held-out clusters; 16
  held-out clusters per varied script. Each evaluation cluster has 12 role/PID/
  distance combinations. Training, selection and held-out seeds are disjoint.
- Select by mean own objective return, then own stocked-combo KO rate. Held-out
  results are evaluated only after selection, with deterministic inference.
- Qualification requires a positive held-out chance-differential interval,
  lower mean received chance across varied opponents, no supported offensive or
  defensive chance regression, no supported combo/ordinary-score regression,
  at least 48% score against current weights and 50% against stable v1.
  These checks do not automatically install or deploy anything.

Run artifacts: `out/riskfight/20260919-lethal-chance-v2`. Exact engine and grading
sources are snapshotted with the checkpoints; the trainer checks source hashes
again before final qualification. The preliminary `...-v1` directory contains an
interrupted baseline diagnostic, stopped before its first PPO update to correct
finite spare-recoil handling. It is not a trained or selected candidate.

## Verification and current-source boundary

The 28 Python objective/accounting/selection/export tests and TypeScript typecheck
passed. The focused browser verifier's mechanics-only path passes, including
the new probability regressions and the existing combat regressions.

The default browser-candidate verifier initially rejected three pre-existing
source changes (`spellRequirements.ts`, `riskfight.ts`, `runtimePlayerCombat.ts`)
relative to the currently embedded model's qualification. Those gameplay files
were not edited for this task. The new run explicitly records source-updated
continuation and evaluates both candidate and incumbent under current rules.
The guard was not weakened. Stable NH and DMM model fixtures remain protected.

## Completed results and decision

The RTX 4060 Ti completed all 12 PPO updates from 2,304 fresh training fights.
Inference and optimization ran on CUDA. Elapsed run time was 3,014.97 seconds,
including validation and final evaluation; peak PyTorch allocation was 51.74 MiB.
The run retained all twelve checkpoints and selected **update 9** by the declared
validation rule, before examining final held-out results.

The full fresh qualification comprised 2,688 completed fights: 768 against the
current incumbent, 1,152 paired varied-opponent fights, and 768 against stable v1.
No illegal actions or timeouts occurred. All 23 source hashes still matched at
completion, and the training/bridge processes exited.

Against the current incumbent, the selected candidate had 367 wins, 384 losses
and 17 draws: **48.89% match score**, paired-seed 95% interval **45.25–52.54%**.
Both policies scored 97 stocked combo KOs. Candidate chance differential was
**-0.03886 per fight**, interval **[-0.09899, +0.02100]**, failing the required
positive interval. The other nine qualification checks passed; the result is
inconclusive for improvement, not proof of a significant regression.

| Head-to-head diagnostic | Candidate | Current opponent |
| --- | ---: | ---: |
| Mean chance created | 0.47169 | 0.51055 |
| Mean chance received | 0.51055 | 0.47169 |
| Mean HP at a decision | 64.13 | 63.14 |
| Attacks per fight | 31.83 | 31.78 |
| Useful healing per fight | 339.55 | 337.34 |
| Opening Vengeance casts | 416 | 480 |
| Stocked combo KOs involving Vengeance | 17 | 21 |

The small increase in average HP and fewer opening casts did not establish
better survival or Vengeance timing. HP averages include entire fights, including
late supply depletion; chance values are accumulated exposure, not whole-fight
death probabilities. Increased HP alone is not a promotion criterion.

Each varied matchup had 192 fights per policy, with paired seeds/roles/PID/distances:

| Opponent | Candidate/current score | Candidate/current chance received | Candidate/current chance created |
| --- | ---: | ---: | ---: |
| Aggressive | 79.43% / 79.17% | 0.26768 / 0.24629 | 1.00811 / 1.04391 |
| Balanced | 53.65% / 52.60% | 0.50457 / 0.56527 | 0.52581 / 0.60968 |
| Conservative | 44.79% / 51.82% | 0.51142 / 0.50501 | 0.48685 / 0.51263 |

All paired varied score/chance-delta intervals include zero. Mean received
chance fell by 0.01097 across the three styles, but created chance also fell in
all three point estimates. The stable-v1 score was 89.78%; beating that older
reference does not establish improvement over the current model.

Artifacts:

- [Full run and qualification report](../out/riskfight/20260919-lethal-chance-v2/report.json)
- [Selected checkpoint](../out/riskfight/20260919-lethal-chance-v2/selected-candidate-v2.pt)
- Checkpoint SHA-256: `07f1a9b24340ea47c8ba0fd7476d867f53e5dce73367cb6220fbc7afa667cf52`
- Parameter SHA-256: `f9f280c07a8feb23dac5ee1d76d47e3025b967a1cd091f737a6f7e8b9543d803`
- The report and checkpoint have `export_ready: false`; no fallback checkpoint
  was selected using the held-out results and no qualification gate was relaxed.

Final checks confirmed unchanged hashes for the browser Risk Fight JSON and
controller, `nh-neural-policy-test.json`, and `nh-neural-policy-dmm-current.json`.
