# Risk Fight: stocked-opponent combo objective — 18 September 2026

Localhost now uses the coverage replay's selected update 2, qualified by an
independent 5,376-fight confirmation. It achieved 200 stocked combo KOs against
97 from the previous local model in 1,536 head-to-head fights, with a positive
paired-seed confidence interval. All eight qualification checks passed. This
is a local candidate change; Risk Fight has not been pushed or deployed.

This work changes risk-fight training and candidate selection. It does not alter
the playable combat rules, the 53-feature / 21-action risk policy contract, or
the NH and DMM models. Training uses the browser's actual combat engine and CUDA
inference/optimization. Opponent inventories remain hidden from policy inputs;
true remaining healing is used only to grade completed training events.

## Objective

The preceding objective paid +100 for every victory, including exhausted-opponent
kills. Its small Vengeance-stack shaping could not express the requested priority.
The final `stocked_combo_v2` contract uses these grading rules:

- A stocked-opponent combo KO pays +100: at least 50 useful HP of damage across the same
  or adjacent game tick, at least two hits of eight damage or more, at least 15
  direct damage, and at least 44 HP of unused healing on the victim. The final
  contributing direct/Vengeance hit must be lethal. Recoil does not qualify.
- An ordinary stocked victory pays +20. Below 44 HP of healing, this scales down
  proportionally. Finishing an opponent with one pie bite left cannot claim full
  combo-KO credit.
- Exhausted-opponent victories and timeouts pay zero total return. All deaths,
  including simultaneous KOs, pay -10. This keeps ordinary survival secondary
  to a successful stocked combo finish.
- A realized burst of at least 40 net damage can receive provisional combo credit,
  capped at 20 per fighter per episode. Matched Vengeance damage adds to this
  signal; pressing Vengeance, movement, equipping or spec buttons does not.
  Provisional bonuses are retained only by a surviving winner against an opponent
  who still has healing. They are refunded for deaths, timeouts and exhausted wins.

Only useful damage counts: misses and overkill are excluded, healing between
the first and last hits is subtracted, and retained/replayed events cannot pay
twice. Healing stock counts marlins, halibut, individual pie bites and brew doses;
restore and boost potions do not masquerade as food. These thresholds are training
grading choices, not changes to RuneScape combat mechanics.

The existing public damage-ledger features remain unchanged for model-schema
compatibility, but damage by itself no longer earns training reward. Returns are
undiscounted (`gamma=1`) and reconstruct exactly as terminal plus retained combo
reward. The full-fight audit checks that identity against emitted step rewards.

## Selection and evidence

The explicit pre-training localhost v2 checkpoint is the frozen opponent/reference,
with the older migrated v1 checkpoint retained as a separate stable check.
Rollout opposition includes current incumbent, self-play, a lagged snapshot and
observation-only training scripts. Evaluation is deterministic, with disjoint
training/validation/held-out seeds and paired roles, initial PID and distances.

The finishing experiment selects on the candidate's own mean objective return,
then its own stocked combo KO rate. This uses the corrected combo-first reward
instead of allowing one additional noisy validation KO to decide the checkpoint.
Rejected validation snapshots do not reset every subsequent PPO
update. Outcome and behavior evidence remains separate: actual combo KO rates,
ordinary wins, finite supplies, Vengeance contribution, opening casts, double
mauls and actual Elder swings within two ticks of a double maul are reported.
Full stocked-combo finish traces retain landed damage, ticks, weapon attacks and
the victim's remaining healing for inspection.

The held-out improvement gate requires a positive paired-seed confidence interval
for stocked combo KO differential against the explicit current model, a positive
mean own combo-KO improvement against paired varied opponents, no illegal actions,
no supported own-combo or ordinary-score regression against those opponents, and
ordinary match score at least 48% against current v2 plus the old v1 check.
Offensive improvements and ordinary fight outcomes must also be inspected before
selecting localhost's model; a differential can improve by defending better alone.

## Verification and run status

The focused risk browser verifier passes the real-engine reward cases: stocked
lethal and nonlethal stacks, no-food damage/KO, no duplicate credit, overkill,
misses, recoil, intervening healing, tiny remaining stock, death refunds, timeout
refunds, and previously earned bonuses cancelled on an exhausted victory.
The twenty-seven focused Python objective/accounting/selection/export tests and the
TypeScript typecheck also pass.

A read-only parity check confirmed that browser and rollout observations both
update the legacy public damage ledger after resolving due incoming hits and
before deciding. Neither ledger reads future queued damage. Opponent appearance
still comes from the completed previous tick in both paths.

Vengeance timing remains a separate behavior question. The original checkpoint
was bootstrapped with an unconditional legal-cast priority and strongly prefers
casting when available. The later demonstration teacher is conditional, but a
six-fight diagnostic found it still first cast on tick 2 for eight of twelve
actors and tick 5 for the other four. Its incoming/outgoing-arrow trigger often
endorses an early cast, so repeating its broad imitation warm-start is not a
proven timing fix. That diagnostic did not change weights or gameplay.

The first `stocked_combo_v1` experiment completed 1,728 rollout fights and saved
eight PPO updates before being stopped for objective correction. Its -100 generic
death penalty was still favoring survival: the best validation snapshot had one
fewer own combo KO (25 to 24), but eight fewer deaths. Avoided death cost improved
return by 800 while positive rewards fell 164. All of the return gain was survival.
It was not promoted or evaluated on held-out seeds. The run, source snapshot and
stopping rationale remain under `fastsim/out/riskfight/20260918-stocked-combo-v1`.

The revised experiment reduced death cost to -10 and initially selected own
combo-KO rate first. It completed 3,072 rollout fights and all 16 PPO updates.
The selected update 1 did not generalize: in 576 fresh head-to-head fights it
scored 48.52%, with 39 stocked combo KOs against the incumbent's 48. The paired
combo differential confidence interval was [-6.42, +3.47] percentage points.
Its own combo rate also fell 2.78 points across the paired varied opponents, and
it failed the ordinary-score regression check. It was not exported.

Before those held-out results were seen, a separate validation-only rule retained
update 3: highest mean objective return among snapshots with improved own combo
rate and at least 55% ordinary validation score. This avoided choosing a single
extra noisy combo KO over a much better total return. It received a separate
fresh-seed qualification, with no further training or test-set checkpoint search.
It scored 53.82% in 576 head-to-head fights, but had 55 combo KOs to the incumbent's
56; the combo differential interval was [-3.82, +3.47] points. Its paired varied
own combo rate fell 0.69 points. It also failed qualification and was not exported.

These results show why beating the older v1 reference (about 84% match score for
both candidates) is insufficient: neither candidate established the requested
combo improvement against the actual current model. Full reports are retained in
`20260918-stocked-combo-v2` and
`20260918-stocked-combo-alternative-qualification` under `fastsim/out/riskfight`.

A source-engine probe also found a seed-diversity problem in the training bridge:
consecutive episode IDs went directly into the engine's linear congruential RNG,
making their first accuracy rolls nearly identical. The bridge now mixes each
episode ID through a bijective 32-bit avalanche before initializing combat, and
records the original ID and resulting combat seed. The game's RNG and mechanics
are unchanged. A focused real-engine regression checks opening-arrow hit/miss
diversity across 32 consecutive IDs and exact replay of the same ID. The finishing
experiment's 1,280 combat seeds are unique and do not overlap the recorded raw
combat seeds from the earlier lineages. Earlier reports remain historical
diagnostics; their correlated opening rolls limit broad strength claims.

The focused finishing experiment completed under
`fastsim/out/riskfight/20260918-finishing-practice-v1`. It resumes the prior update
3 as an initialization, while keeping the original localhost model as the frozen
reference. CUDA imitation training uses 192 real-engine fights and eight epochs,
followed by eight rounds of 128 outcome-reward fights. The settings, source
snapshots and separate validation/held-out seeds were fixed before training.

The optional finishing teacher defers Vengeance until public incoming-attack and
finishing opportunities align, and demonstrates legal Elder follow-ups after a
completed maul queue. It uses observations and legal masks, not hidden opponent
food or future damage. It exists only in training. Held-out opponents and export
gates are unchanged; the browser still runs the neural policy without tactical
helpers. Demonstrations are examples to learn from, not evidence that the learned
model is strong or that every example is optimal.

The actual demonstration fights produced 41 stocked combo finishes, including 11
with Vengeance contribution, and 68 Elder swings within two ticks of a double maul.
They contained no opening Vengeance casts. These are teacher diagnostics, not
candidate evaluation results.

The learned model selected after finishing practice scored 55.12% in 576 fresh
head-to-head fights (306 wins, 247 losses, 23 draws), with 50 stocked combo KOs
against 39. The paired combo differential interval was [-2.08, +5.56] percentage
points, so the apparent advantage was inconclusive. Its own combo rate fell 2.60
points across the paired varied opponents. Qualification failed and it was not
exported. The later eight PPO updates did not beat the practice checkpoint on
validation, and were not searched using held-out results.

Some intended behavior did improve: actual Elder follow-ups increased from 16 to
81, and Vengeance-assisted stocked combo KOs from 2 to 7, in the head-to-head
suite. A retained finish includes 18 reflected Vengeance damage followed by
39+14 useful maul damage, with 538 HP of healing still on the victim. However,
aggregate Vengeance combo damage did not improve, and isolated good finishes are
insufficient to establish a broadly stronger bot. Early casts are a diagnostic,
not automatically a mistake: some led to valid finishing stacks.

A read-only review found that the practice generator coupled distance to fixed
ordered teacher pairs: aggressive/balanced at distance 1, balanced/conservative
at 5, and conservative/aggressive at 9. Both actors were always scripted, so no
demonstrations faced the actual current bot. There were already 21,154 legal-cast
deferral labels, so missing generic deferral examples was not the explanation.

One bounded follow-up experiment corrects that concrete coverage gap. It uses a
balanced 216-fight schedule, half against the frozen current bot and half against
training scripts, with only the designated teacher side supervised. Teacher,
distance, side and PID are balanced independently. Teacher behavior, combat,
reward and held-out qualification gates stay unchanged. Pre/post imitation
agreement is recorded as in-sample fitting diagnostics, separately from fight
quality. The active localhost model remains unchanged pending qualification.

The coverage run was interrupted after saving its bootstrap checkpoint because
a coverage-report field was a NumPy integer rather than a JSON-compatible Python
integer. The repair only normalizes report fields; a reconstructed full 384-fight
report now serializes successfully. The original artifacts are retained, and an
exact replay uses the same initialization, seeds, settings and criteria under
`20260918-finishing-coverage-v1-replay`. No held-out evaluation occurred before
the interruption. The replay's fourteen saved parameter tensors exactly match
the interrupted checkpoint, confirming the logging repair did not alter learning.

The coverage replay completed and selected PPO update 2 from validation before
held-out evaluation. In 768 fresh head-to-head fights it scored 54.17% (399 wins,
335 losses, 34 draws), with 107 stocked combo KOs against 68. The combo
differential was +5.08 percentage points with paired-seed 95% interval
[-0.78, +10.81], so this first test did not qualify the checkpoint.

Actual Elder swings within two ticks after a double maul increased from 38 to
145 in that suite. Vengeance-assisted stocked combo KOs increased from 0 to 18,
and opening Vengeance casts fell from 768 to 0. These are useful behavior
changes, but total Vengeance combo damage was slightly lower; this is not proof
of optimal Vengeance timing. A retained finish at seed 10900061, distance 1,
PID 0, challenger side 0 shows a double maul on tick 10, a legal 43-damage Elder
follow-up on tick 12, then 20 reflected Vengeance damage on tick 13 to finish a
victim still carrying 514 HP of healing.

Those 18 Vengeance-assisted KOs span ten independent seed clusters. Fourteen
include at least eight reflected damage, with a median contribution of 16 HP;
four include only 2, 2, 5, and 7 HP. They are actual stacks, but counting every
positive reflection alone would overstate the strength of some contributions.

Against aggressive, balanced, and conservative held-out scripts, its own stocked
combo-KO rates improved by 4.17, 0.69, and 2.78 percentage points respectively.
Ordinary match-score differences were +8.33, -6.77, and -7.29 points. None of
the paired ordinary-score intervals excluded zero, but those mixed results must
remain visible. Stable-v1 match score was 88.28%. All seven other qualification
checks passed; only the positive head-to-head combo-differential confidence
interval failed.

The ordinary-score declines are concentrated in attrition. Against balanced,
exhausted-opponent wins fell from 94 to 62, while deaths after exhausting healing
rose from 67 to 120; stocked ordinary/combo deaths fell from 40/50 to 34/21.
Against conservative, exhausted-opponent wins fell from 153 to 112, exhausted
deaths rose from 102 to 131, and stocked ordinary/combo deaths fell from 20/3 to
8/0. Mutual KOs rose from 5 to 19 in the conservative matchup. Lower reflected
Vengeance damage there (56.9 to 23.9 per fight) may contribute to the attrition
cost, but the comparisons do not establish causation. This is a limitation of
the learned policy to retain in the result, not a reason to weaken the gates.

One larger, independent, no-learning confirmation is therefore predeclared in
`.codex-tmp/stocked-combo-training-20260918/coverage-confirmation-plan.md`.
It tests the same selected weights, SHA-256
`38253f5c8c9298c66986bd6d66cdc6342ef52620f4d4336e4cfc9cc0656a5954`,
with 128 fresh seed clusters: 1,536 head-to-head fights, 1,536 stable-v1 fights,
and 384 fights per policy against each of three varied scripts. The seed audit
found no reused mixed combat seeds or collisions with earlier raw combat seeds.
Every original gate is retained. The first failed report remains intact; there
is no further checkpoint selection or repeated test expansion.

The independent confirmation established the primary improvement: 814 wins,
672 losses and 50 draws in 1,536 head-to-head fights (54.62% match score), with
200 stocked combo KOs against 97. The combo differential was +6.71 percentage
points, paired-seed 95% interval [+2.86, +10.29].

The fresh varied-opponent comparisons, each with 384 fights per policy, were:

| Opponent | Candidate / current stocked combo KOs | Candidate / current match score |
| --- | ---: | ---: |
| Aggressive | 69 / 32 | 67.58% / 63.80% |
| Balanced | 44 / 16 | 51.95% / 37.37% |
| Conservative | 11 / 0 | 52.60% / 50.13% |

These fresh results did not repeat the smaller test's ordinary-score declines.
Both reports are retained rather than pooling or selectively hiding results.
All three fresh paired own-combo-rate intervals were positive. The older v1
reference check scored 89.26% (1,352 wins, 146 losses, 38 draws). All eight
qualification checks passed, with no illegal actions or timeouts in the suite.

In the fresh head-to-head test, actual Elder swings within two ticks of double
maul increased from 52 to 262. Stocked combo KOs with Vengeance contribution
increased from 8 to 37. Opening Vengeance casts were 0 for the candidate versus
1,536 for the old model. Aggregate Vengeance combo damage remained slightly
lower (4.19 versus 4.62 per fight), so these results establish better finishing
outcomes, not universally optimal casting. Long defensive fights remain a
useful area for further improvement. One actual finish at seed 12900101 stacks
20 reflected damage on tick 7 with 31+32 useful maul damage on tick 8, killing
an opponent carrying 538 HP of unused healing.

An independent audit of the fresh varied files checked 2,304 fights / 4,608
actor results. All 1,364 exhausted-opponent wins returned exactly zero; all
2,358 deaths returned -10, including both actors in 54 mutual KOs. All 357
stocked combo wins and 529 ordinary stocked wins had correct terminal payouts.
Earlier recorded stacks left no retained bonus for 613 deaths and 444 exhausted
wins. All totals matched terminal plus final combo bonus; every positive bonus
belonged to a stocked victory and stayed within the cap. All six comparison
sets exactly covered the intended seed/role/PID/distance combinations. This
audit checks final records; per-tick accounting and timeout refunds are covered
by the focused tests, not an independent replay of these saved fights.

The exporter now accepts an explicit passing no-learning confirmation for the
same fixed trained weights even when the first held-out comparison was
inconclusive. It retains the original failed report and export-ready flag,
verifies exact checkpoint/parameter/reference/source identity and trained
validation selection, excludes prior learning/selection/held-out seeds, and
reuses every numerical gate unchanged. It does not rewrite the checkpoint.

Activated locally:

- Checkpoint: `fastsim/out/riskfight/20260918-finishing-coverage-v1-replay/selected-candidate-v2.pt`
- Checkpoint SHA-256: `38253f5c8c9298c66986bd6d66cdc6342ef52620f4d4336e4cfc9cc0656a5954`
- Parameter SHA-256: `397924d85e60a5edf9d5437c75531aa684619ca3021c34695c1710fe81f70fe0`
- Qualification: `fastsim/out/riskfight/20260918-finishing-coverage-confirmation/report.json`
- Browser JSON SHA-256: `2f894c72f0a89da7ba05439cce01b8919aca3ba6b53718e68dae7cbf51625f12`
- Rollback: `.codex-tmp/stocked-combo-training-20260918/browser-before.json` and `controller-before.ts`

Final validation passed: 27 focused Python tests, TypeScript typecheck, and
`verify:riskfight-browser-candidate`. Python/browser inference error stayed below
0.000002. HTTP requests verified the exact checkpoint, parameters, controller,
passing qualification report hash, and unpromoted status served at
`http://127.0.0.1:5173/`. Only the controller's two identity constants changed;
no tactical runtime helper was added. NH and DMM policy hashes remain unchanged.
The existing verifier's browser-versus-Java PID parity limitation is unchanged;
these results qualify the actual local browser engine, not a production release.
All training/evaluation helper processes exited; the existing Vite server remains.

Stable model SHA-256 before training:

- NH `nh-neural-policy-test.json`: `d7e4ad871fcbed03c704bfc059ef096f3df50660b7c985bb967de03a44fdcde0`
- DMM `nh-neural-policy-dmm-current.json`: `ccb88e7616ff170b7415755beefc25d888f1155ffae9f27914e4716dd2f393cf`
