# Risk Fight credit assignment — why the last two runs learned nothing

The `ko_chance_pressure_v1` objective from the previous report is unchanged. This
report is about the trainer, not the reward: the reward was being computed
correctly and then thrown away by the part of PPO that decides *which actions a
reward is credited to*. Both 19 September runs before this one were random
walks, which is why both landed near a 49% match score.

## What was broken

The trainer scored each decision with an advantage: the fight's remaining reward
minus what the critic (the value head) predicted for that position. Three things
stacked up so that the critic predicted nothing at all:

1. **Returns were undiscounted Monte-Carlo sums.** Every tick of a fight carried
   that whole fight's outcome, so a decision on tick 12 was credited with a KO
   that happened on tick 180. The dense chance, pressure and missed-attack
   rewards were roughly 1% of the variance in that number.
2. **The value loss was Huber with beta = 1**, which caps each sample's gradient
   at 1.0, while the targets were around +/-100 after KOs became worth +/-100.
3. **The critic shared the actor's continuation learning rate** (7e-5) and is a
   linear head on a representation that is deliberately detached from the actor's
   gradient, so it had no other way to move.

The evidence is in the abandoned run's own logs: `value_loss` was 101.8, 99.5,
99.0, 100.8 across its four updates — flat, and equal to the scale of the returns
themselves. A Huber loss near 100 means the mean absolute error was near 100,
so the critic was predicting approximately zero against +/-100 targets.

With a zero critic, `advantage = return - 0 = return`, and after the existing
normalization every action in a won fight got about +1 and every action in a lost
fight got about -1. Good and bad decisions inside the same fight were graded
identically. That is not a reward-shaping problem that more training fixes; the
gradient carried almost no information about individual decisions.

It also explains the earlier null result. Selection reads 144 validation fights,
whose standard error on score is around 4%. Picking the best of 24 such readings
from a policy that is drifting randomly selects noise, which then does not
reproduce on the larger held-out set — exactly the 48.89% that `update 9` of
`20260919-lethal-chance-v2` returned.

## What changed

Only credit assignment. The graded objective is untouched: still undiscounted,
still every KO +/-100, still the same chance, pressure and missed-attack terms,
and the audit that reconciles a fight's reward ledger against the engine report
is unchanged.

- **Undiscounted GAE(lambda = 0.95).** A reward is credited to the ticks that
  led to it instead of to the whole fight. The terminal KO still dominates the
  finishing sequence and still reaches earlier decisions, but through the critic
  rather than by smearing. With lambda = 1 and a zero critic this reduces exactly
  to the old Monte-Carlo behaviour, so the change is a generalization of it.
- **`VALUE_SCALE = 50`.** The critic predicts return / 50, so a KO is a target
  near 2 instead of near 100, and mean-squared error replaces Huber. The critic
  can now travel the distance to its target inside a run.
- **A separate critic learning rate** (3e-3), because the actor's continuation
  rate exists to keep the policy near the incumbent and is far too small for a
  head that starts every objective change wrong.
- **Value-only warm-up epochs** (200 on the first update, 12 per update after),
  so the critic describes the current reward before its errors steer the actor.
- **The resumed value head is reset.** It was fitted to a different reward, it is
  training-only, and it never chooses an action; carrying it in leaves a constant
  offset on precisely the terminal step that grades the KO.

Each update now reports `value_explained_variance`. Near zero means the critic is
dead again and the run is not learning.

## Verification

- `fastsim/tests/test_riskfight_credit_assignment.py`: 9 checks covering the
  lambda = 1 reduction to Monte-Carlo credit, locality of a dense reward, a
  hand-computed GAE series against a live critic, no advantage crossing a
  finished fight, the scaled value target identity, KO-sized targets staying
  small, and explained variance reading 1 for a perfect critic and 0 for a dead
  one.
- The existing risk-fight suite still passes: 55 tests including the 46 that
  covered the objective, accounting, selection and export before this change.
- A three-update smoke run on the real engine
  (`out/riskfight/20260919-credit-smoke2`) showed the critic fitting for the
  first time: explained variance 0.000 -> 0.336 -> 0.527, and critic loss falling
  from 74 (with the inherited head) to about 0.2 (after the reset and warm-up).

## Training run

`out/riskfight/20260919-credit-assignment-v1`, initialized from the same live
incumbent as the abandoned runs
(`20260918-finishing-coverage-v1-replay/selected-candidate-v2.pt`), which stays
frozen as the comparison. 24 updates of 256 fresh fights, four epochs, actor rate
1e-4, KL limit .02, lambda .95, base seed 29000053. Sixteen validation clusters
select the checkpoint; 64 fresh held-out clusters and 16 per scripted opponent
are read only afterwards. Every cluster crosses both roles, both initial PID
assignments and distances 1/5/9.

The abandoned run's artifacts and its four flat `value_loss` readings are kept in
`out/riskfight/20260919-ko-pressure-v1-deadcritic-evidence`.

## Results

The run completed all 24 updates in 4,349 seconds on the RTX 4060 Ti, peak
PyTorch allocation 64.94 MiB, no illegal actions and no timeouts. Explained
variance rose from 0 to about .75, so the critic described three quarters of its
own target by the end — the quantity that was flat at zero in every earlier run.

Validation improved steadily rather than wandering, and was still improving at
the last update:

| update | score | objective return | chance created | chance received | HP at a decision |
| ---: | ---: | ---: | ---: | ---: | ---: |
| resume (live model) | .500 | 2.14 | .601 | .601 | 61.6 |
| 5 | .622 | 29.02 | .601 | .450 | 63.4 |
| 11 | .656 | 37.66 | .605 | .348 | 65.3 |
| 17 | .604 | 26.89 | .662 | .472 | 65.1 |
| 23 (selected) | .664 | 41.08 | .712 | .333 | 67.4 |
| 24 | .646 | 36.08 | .611 | .327 | 67.0 |

Selection took `update_023` by the declared rule, before any held-out result was
read.

### Held-out qualification

768 fresh fights against the frozen live model, paired by seed, role, initial PID
and distance:

- **Score 61.46%** (462 wins, 286 losses, 20 draws), 95% interval
  **57.68–65.43%**. The interval's lower bound is above .5, so the improvement is
  established on score alone rather than on the chance term.
- Chance differential **+0.31927**, interval **[+0.25360, +0.38939]**.
- HP at a decision **66.88 vs 60.26**. Damage per fight **464.4 vs 446.1**.
  Useful direct damage per tick **2.5387 vs 2.5021**, so the extra eating did not
  cost output.
- Deliberate ready waits 0.000% of decision ticks. No timeouts, no illegal moves.

Against the three held-out scripted opponents, 192 fights per policy each:

| Opponent | Candidate | Live model |
| --- | ---: | ---: |
| Aggressive | 88.02% | 77.60% |
| Balanced | 70.83% | 54.95% |
| Conservative | 67.71% | 55.73% |

Chance received was lower than the live model's against all three. Score against
the older stable v1 reference was 96.09%.

All eleven qualification checks pass and the report is `export_ready: true`. This
is the first Risk Fight candidate to qualify since the KO-weighted objective was
introduced. It answers the behaviour that prompted the work: it sits about 6 HP
higher, is chanced roughly half as often, creates more lethal chances, and does
slightly more damage while doing it.

Artifacts:

- [Run and qualification report](../out/riskfight/20260919-credit-assignment-v1/report.json)
- [Selected checkpoint](../out/riskfight/20260919-credit-assignment-v1/selected-candidate-v2.pt)
- Parameter SHA-256: `c3762d6009f9503acd788a0100dd0d0db6e6591074e80d795016d8b06ba769ce`

Nothing has been exported, activated or deployed. Promotion remains a separate,
explicit step.

## Continuation run (v2) — inconclusive

`out/riskfight/20260919-credit-assignment-v2` resumed from the qualified v1
candidate with that candidate frozen as its own comparison, so it had to beat the
newly trained model rather than the live one: 32 updates of 256 fights, seed
30000071, 79.3 minutes.

Its opening baseline confirms the v1 gain held on fresh seeds — the resumed model
entered at 66.6 HP at a decision, 507 damage per fight and 5.16% wasted
ready-ticks, against the live model's 61.6 / 463 / 7.22 in the v1 run.

Validation oscillated between .469 and .602 with a mean near .53, and held-out
came back at **52.21%** over 768 fights, 95% interval **48.50–55.86%**. Chance
differential was +0.046 with an interval spanning zero. Ten of the eleven checks
pass, including every non-regression check and the .5 score floor, but
`proven_current_ko_or_chance_improvement` fails and the report is
`export_ready: false`.

Read plainly: the second pass is not a regression and its point estimate is
positive, but 768 fights cannot separate it from its parent. That is what
diminishing returns look like once the policy is close to a self-play
equilibrium, and it is the honest reading rather than a failure of the method.

## Third run

`out/riskfight/20260919-credit-assignment-v3` addresses both the noise floor and
the shipping question. It resumes from the v2 candidate but freezes **the live
model** as its comparison, so its qualification measures the whole chain against
what is actually deployed instead of against an intermediate checkpoint. It uses
384 fights per update and 24 validation clusters (288 fights per selection
reading) to cut the gradient and selection noise that left v2 undecidable, over
24 updates at seed 32000089.

### v3 results — stronger, but one guard trips

`update_021` selected. Against the live model over 768 fresh fights: **70.12%**,
95% interval **66.67–73.63%**; chance differential **+0.449** [+0.378, +0.520];
HP at a decision **76.35 vs 59.98**; damage **468.4 vs 431.8**; no timeouts.
Score against stable v1 was 96%+. Ten checks pass.

`no_supported_varied_created_chance_regression` **fails**. Against the aggressive
script the candidate creates fewer lethal chances than the live model does:
0.776 vs 0.891, interval [-0.219, -0.013]. In that same matchup it wins more
(89.58% vs 82.55%) and is chanced far less (0.088 vs 0.223), so it is closing
those fights safely rather than generating large windows. The guard was not
weakened and the report is `export_ready: false`.

Per-opponent score against the live model's score: aggressive 89.58 / 82.55,
balanced 68.75 / 49.22, conservative 75.00 / 55.21.

## Fourth run — qualified

`out/riskfight/20260919-credit-assignment-v4` resumed from the v3 candidate,
still benchmarked against the live model, 24 updates of 384 fights, entropy
coefficient raised to .015 because v3's validation had flattened, seed 33000103,
89.9 minutes. `update_012` selected.

Against the live model over 768 fresh fights:

- **Score 70.38%**, 95% interval **66.73–73.83%** (528 wins, 215 losses, 25 draws).
- Chance differential **+0.46051**, interval **[+0.39256, +0.52922]**.
- HP at a decision **76.15 vs 59.65**. Damage per fight **454.7 vs 421.7**.
- No timeouts, no illegal actions, 0.000% deliberate waits.
- Score against stable v1: **98.63%**.

| Opponent | Candidate | Live model | Chance created | Chance received |
| --- | ---: | ---: | --- | --- |
| Aggressive | 85.16% | 77.86% | .847 vs .818 | .165 vs .219 |
| Balanced | 77.08% | 52.86% | .769 vs .457 | .258 vs .410 |
| Conservative | 75.78% | 52.60% | .705 vs .548 | .199 vs .498 |

**All eleven checks pass and the report is `export_ready: true`.** The v3
created-chance regression is gone: the aggressive-script interval now spans zero
and the other two are significantly positive. This is the strongest qualified
candidate and the one worth shipping.

Parameter SHA-256: `3947c914e100e45e52a7dc31c4bef129c9bf91310a365c2e4a2140f4ab438da2`.

### Where the chain has got to

| Model | Score against the live model |
| --- | ---: |
| Live model | 50% |
| v1 candidate | 61.5% |
| v2 candidate | ~69% (validation, 288 fights) |
| v3 candidate | 70.1% |
| v4 candidate | 70.4% |

v3 and v4 are statistically indistinguishable on score, so the chain has
plateaued against this fixed opponent. That is expected: accuracy rolls, damage
rolls and PID put a ceiling on how often any player beats a competent opponent,
and ~70% is close to it. Further real gains have to be measured peer-to-peer
against the newest model rather than against the live one, which is what the
fifth run does.

## Fifth run — no further gain at peer level

`out/riskfight/20260919-credit-assignment-v5` resumed from the qualified v4
candidate with v4 itself frozen as the comparison, so it had to beat the best
model rather than the deployed one. 24 updates of 384 fights, seed 34000117,
82.8 minutes, `update_023` selected.

Held-out: **49.15%** over 768 fights, interval 44.73–53.52%; chance differential
-0.056 with an interval spanning zero. Four checks fail, including the .5 score
floor and two varied-opponent regressions. `export_ready: false`, so v4 stands.

The style also drifted the wrong way: HP at a decision fell to 69.71 with damage
up to 527.6, both sides trending more aggressive. Note that HP at a decision is
opponent-dependent — v4's own figure in this peer matchup is 70.95, not the 76.15
it shows against the live model — so it is a comparative number, not an absolute
property of a policy.

Two consecutive attempts past v4 produced nothing, which is the practical signal
that this recipe has converged.

## Sixth run — confirms convergence

`out/riskfight/20260919-credit-assignment-v6` repeated the peer-level attempt
with deliberately finer steps: learning rate 5e-5, KL limit .015, entropy back to
.01, 32 updates of 384 fights, seed 35000131, 106.9 minutes, `update_013`
selected.

Held-out: **50.91%** against v4 over 768 fights, interval 47.98–53.78%; chance
differential +0.0006 with an interval centred on zero. Only the improvement check
fails; there are no regressions anywhere. Both sides sit at ~70.5 HP and ~522
damage, i.e. the two policies are playing the same game equally well.

Two independent attempts past v4, at different learning rates, entropy settings
and lengths, both land on a coin flip. **v4 is the final model of this chain.**

## Conclusion

| Model | Score against the live model | Qualified |
| --- | ---: | --- |
| Live model | 50% | — |
| v1 | 61.5% | yes |
| v2 | ~69% (validation) | no, could not be separated from v1 |
| v3 | 70.1% | no, one varied-opponent guard |
| **v4** | **70.4%** | **yes, all eleven checks** |
| v5 | — (49.2% vs v4) | no |
| v6 | — (50.9% vs v4) | no |

The behaviour that started this work is fixed. Against the live model, v4 holds
76.2 HP at a decision versus 59.7, is chanced less than half as often (.33 vs
.79), creates more than twice the lethal chance (.79 vs .33), and still out-damages
it (455 vs 422). It wins more against all three held-out opponents while creating
more chances against each. None of that came from a new rule, a scripted helper
or an HP penalty: the objective is the same one written before this work started,
and only the trainer's credit assignment changed.

### Installed locally

v4 is installed for local play. The export was written to
`out/riskfight/20260919-credit-assignment-v4/webweaver-riskfight-candidate.json`
and copied to `src/generated/webweaver-riskfight-candidate.json`; the previous
model is kept at `out/riskfight/PREVIOUS-webweaver-riskfight-candidate-20260919.json`.
The runtime pins the model's hashes, so `src/bot/riskfight-policy.ts` now carries
v4's checkpoint and parameter SHA-256. That pin is also the promotion switch: a
web build from this tree ships v4. To go back, restore the previous JSON and the
two constants.

`npm run verify:riskfight-browser-candidate` passes in full against the installed
model, and `qualifiedGameplaySourceMatches` is now **true** — the pre-existing
source mismatch called out in the earlier reports is gone, because v4 was
qualified under the current gameplay source.

The original export command, for reference — it writes a new file and does not
touch anything else:

```
python fastsim/export_riskfight_browser_v2.py \
  --checkpoint fastsim/out/riskfight/20260919-credit-assignment-v4/selected-candidate-v2.pt \
  --checkpoint-sha256 dc0a51df97ba0cd7dc7990716036d06c40bd7e050c8053c3605ca84444ad9acf \
  --current-incumbent-sha256 38253f5c8c9298c66986bd6d66cdc6342ef52620f4d4336e4cfc9cc0656a5954 \
  --qualification-report fastsim/out/riskfight/20260919-credit-assignment-v4/report.json \
  --output <new browser model path>
```

### Known gap

Neither this candidate nor the live model ever uses a deliberate hold:
`readyWaitTicks` is 0.000% for both. The tactic of briefly refusing to attack
into an opponent's active Vengeance is available in the action space and cheap
under the objective (.025 for an isolated hold), but it has not been discovered.
That is the next thing worth attacking, along with continuing the climb, since
validation had not levelled off at update 24.
