# Risk-fight browser audit and CUDA training — 17 September 2026

Status: **qualified and selected for local Risk Fight testing**. NH stake and
DMM policies were not trained or replaced. Nothing was published.

## Mechanics and observations

The risk controller now shares `src/sim/nh/riskfight.ts` with the training
bridge. Both use the actual browser combat, consumable, maul and movement
functions. The older NumPy risk simulator is not the engine for this candidate.

- The old observation encoder exposed private opponent special energy,
  cooldowns, runes, recoil charges and pre-rolled projectile damage. The v2
  encoder uses public attack/cast/heal events and completed-prior-tick opponent
  appearance instead. Incoming projectiles are counts inferred from visible
  launches, without their future damage rolls.
- Public Vengeance tracking ignores recoil and reflected Vengeance hits, just
  as the combat engine does: those hits do not consume the recipient's armed
  Vengeance.
- The encoder includes the bot's own boosted/drained combat levels, current
  weapon, finite supplies, maul queue/preload/expiry, relative position and
  legal movement options. It has 53 explicitly named features and 21 main
  actions; the legacy 45/18 contract is rejected by the new browser loader.
- Browser distances use the actual 0.5 scene-unit tile scale. Movement checks
  collision, PvP area, target occupancy and projectile line of sight. A bot
  standing under its opponent can step off the shared tile.
- The risk adapter now uses the delayed opponent appearance supplied by the
  browser. In rollouts, arriving hits resolve before the next decision: own
  health is current, opponent appearance is from the completed previous tick.
- Vengeance legality includes the current Magic level requirement after brew
  drains. Runes, food, potion doses, recoil and special energy remain finite.
  Risk overhead protection is disabled; the existing Piety/Rigour practice
  behavior remains shared by training and browser inference.
- The live inventory undercounted each whole summer pie as one bite and the
  bot discarded it after that bite. Shared item accounting now counts whole
  pies as two bites, maps one remaining bite to a half pie and leaves the empty
  dish after the second bite. Three preset pies give both players six bites,
  matching the supplies already used in training.
- Double maul, preload and release are separate learned choices. They execute
  through the same special-toggle and attack-request functions as the player.
  There is no tactical override choosing a KO or cancelling a bad learned move.

The requested maul preload was already present in the local shared player
implementation. Tests cover both item 4153 (NH/DMM) and 24225 (risk), for both
actors: two clicks hold two specs without spending energy, release spends 100%,
an exhausted bar cannot produce another spec, and an unused queue expires
according to the existing five-tick Kronos implementation. A real DMM browser
check confirmed the held preload. Switching from staff plus shield to a
two-handed maul needs an inventory space; eating first allowed the switch.

The existing uncharged Webweaver uses ordinary arrows and cannot select Swarm.
Focused tests cover both actors with sapphire/diamond/dragonstone bolt settings
and ensure these settings cannot create bolt effects on bow hits. Ordinary
Rapid cadence, projectile timing, combo order and finite supplies are also
covered.

## Training and selection

The initial run `20260917-browser-audit-v2` retained a useful demonstration
bootstrap but its PPO updates regressed. It was not installed. The follow-up
`20260917-browser-coordinated-v2` resumes that candidate with explicit source
update provenance and entirely fresh training, validation and held-out seeds.

The follow-up uses observation-only demonstrations, including extra weight on
rarer action/movement combinations, then four PPO updates against a mixture of
the frozen incumbent, current self-play and lagged snapshots. The critic cannot
rewrite the actor encoder, PPO starts with fresh Adam moments, uses a smaller
learning rate and a KL stop, and rejected updates restore the best model and
optimizer together. GPU allocation and optimizer checks require CUDA on the
RTX 4060 Ti; there is no CPU training fallback.

Selection uses 144 validation fights. The selected checkpoint is then tested
on 1,008 fresh paired fights against the frozen incumbent, covering both roles,
both initial PID assignments and distances 1, 5 and 9. Normal and tree-cleared
collision maps occur across seeds. Three additional held-out scripts have
different eating and KO thresholds from the demonstration scripts; each faces
both candidate and incumbent in 144 paired fights.

The incumbent is explicitly migrated by feature/action names into the corrected
v2 contract. Both policies receive the same legal observations and rules. New
input columns start at zero, new action rows have a conservative initial bias,
and the original checkpoint is preserved. This comparison does not give the
old bot its private-information inputs or its obsolete Swarm action.

Score is `(wins + 0.5 * draws) / fights`. Confidence intervals resample paired
seed clusters, not individual correlated role/PID fights. Held-out results are
not used to choose a checkpoint. Mirror self-play KO rate is not treated as
evidence of strength.

## Selected result

The accepted model is `update_001` from `20260917-browser-coordinated-v2`.
Validation scored 86.46%; all three later PPO updates were rejected. The final
run took 497.79 seconds, with a measured CUDA peak allocation of 53.5 MiB.

The final qualification on the corrected browser source produced **830 wins,
155 losses and 23 simultaneous KOs in 1,008 fights**: an 82.34% win rate and
**83.48% score**, with a paired-seed 95% confidence interval of **80.80–86.01%**.
There were zero timeouts and zero illegal actions on either side. Scores at
distances 1/5/9 were 81.85% / 82.29% / 86.31%; with the challenger initially
first/second in PID they were 88.69% / 78.27%. Before the public Vengeance
observation correction, the same weights scored 813 wins, 171 losses and 24
draws; that earlier report is retained separately.

| Held-out opponent | Previous risk bot score | New risk bot score | Paired improvement, 95% CI |
| --- | ---: | ---: | ---: |
| Aggressive | 19.10% | 72.22% | +53.12 points [39.92, 64.24] |
| Balanced | 1.74% | 28.82% | +27.08 points [17.01, 38.54] |
| Conservative | 4.51% | 36.46% | +31.94 points [20.49, 42.01] |

All script comparisons improved, but the balanced and conservative scripts
still win most fights. This is a measured stronger candidate, not a claim that
it is unbeatable or an expert human risk fighter.

Against the incumbent it averaged 23.16 attacks, 334.29 damage, 7.76 food bites
and 1.96 maul specials per fight. Food never exceeded the available 21 bites,
and specials never exceeded two in these matches. The low-HP probe now chooses
double-maul plus HOLD at 20 HP, instead of stepping away from its own special;
some higher-HP probes still expose imperfect attack/movement coordination.

Checkpoint SHA-256:
`230f43873177b54d3df4ef1f53d157027d94d2122c722589e6efe4408b74b994`

Parameter SHA-256:
`4e10156884eabd7b19d76ecbe4df8ccfeae025c5781a95784ada6f012377267a`

## Reproduction and artifacts

From the trainer repository with CUDA-enabled PyTorch:

```powershell
python -u fastsim/train_riskfight_browser_cuda.py `
  --resume-v2 fastsim/out/riskfight/20260917-browser-audit-v2/selected-candidate-v2.pt `
  --allow-resume-source-update --seed 180003 `
  --bootstrap-fights 128 --bootstrap-epochs 6 --balance-demonstrations `
  --fights 96 --updates 4 --epochs 4 --learning-rate 0.00015 `
  --ppo-learning-rate 0.00003 --target-kl 0.015 `
  --validation-seeds 12 --eval-seeds 84 --script-eval-seeds 12 `
  --eval-batch-fights 256 --output-dir <new-output-directory>
```

The output directory retains the exact trainer snapshot, gameplay/bridge source
snapshots and hashes, seed lineage, every candidate, validation results, full
held-out fight records and report. Export requires the selected checkpoint's
explicit SHA-256, successful held-out qualification and matching current source
hashes. Export does not train or publish a model.

The post-training inventory helper correction is qualified separately in
`fastsim/out/riskfight/20260917-browser-inventory-qualification`. It evaluates
the unchanged checkpoint with explicit source-update consent. Every one of the
1,008 detailed fight records and all varied-opponent metrics match the training
run exactly. The final qualification, including the public Vengeance tracking
correction, is `fastsim/out/riskfight/20260917-browser-final-qualification`.
The export records original training hashes separately from current qualified
source hashes and the qualification report's hash; no checkpoint history is
rewritten.

## Verification

- TypeScript checks and `verify:riskfight-browser-candidate` pass. The focused
  suite checks the exact checkpoint, shared source hashes, inference outputs,
  hidden-information invariance, blocked movement, delayed appearance, maul
  hold/release/expiry, food limits, pie transitions, Vengeance and bow effects.
- Browser inference versus the PyTorch fixture differs by at most 0.00000668
  across logits/value. The live Risk Fight uses the selected checkpoint, emits
  53 finite observations and actually attacks on the three-tick Rapid timer.
- Real DMM UI testing confirmed held maul preload. Real risk UI testing
  confirmed six starting pie bites and the player's full → half → dish path.
- `vite build` succeeds. The full `npm run build` wrapper stops at 12 unrelated
  outdated Java source-anchor assertions (melee reach, Hit and old NH policy
  constants); those assertions were not changed or bypassed in the wrapper.
- Stable NH/DMM model assets and the original risk checkpoint remain unchanged.
  All work is local; no GitHub push, production deployment or Java policy
  promotion was performed for this task.

## Limits

These tests establish improvement against the retained incumbent and three
bounded script families. They do not establish expert-human strength. The
policy can still choose a poor legal combination of attack and movement; it is
not protected by a runtime tactical helper. Public-event estimates are not
access to the opponent's private state.

Training follows this browser engine and its existing maul queue expiry. The
browser currently has no passive prayer-point drain; that existing practice
behavior applies to both sides and was preserved. This is not a claim of
complete live-OSRS or Java runtime parity. Neither stable NH/DMM training nor
publication is part of this change.
