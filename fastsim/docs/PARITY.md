# Parity status — read before generating training data

KronosFastSim is a reimplementation of the Kronos Java NH fight path. A green
unit-test suite proves that individual mechanics match their source; it does
not prove that every tick phase composes identically.

**Current status: the retained seeded state-by-state replay passes strictly.
FastSim is cleared for the repaired GPU-generation path; Java remains the
promotion authority while the replay matrix and scripted cohorts are widened.**

Last reviewed: 2026-07-27.

## Current measured Java comparison

The current baseline uses Teacher79 on both sides, Java world 35, 128 mirror
pairs, start distances 4–8, epsilon 0.22, seed 6301, and a 300-tick cap.

- Java: `out/java-current-teacher79-world35b-mirror256.nhrl`
- FastSim: `out/fast-current-teacher79-world35-mirror128-parityinventoryfix.nhrl`
- Comparison: Java episode 1 only (46,700 rows) against FastSim's 44,200 rows

| Distribution | Java | FastSim |
|---|---:|---:|
| no attack | 78.12% | 76.38% |
| stood still | 60.09% | 61.30% |
| any movement action legal | 40.12% | 38.81% |
| legal actions per row | 44.936 | 44.726 |
| median normalized distance | 0.083 | 0.167 |
| supply NONE | 69.16% | 70.22% |
| active prayer NONE / magic / ranged | 41.49 / 26.63 / 31.80% | 40.15 / 31.53 / 28.18% |

The old catastrophic mismatch is closed: FastSim no longer makes movement
legal on almost every tick or attacks on almost every tick. Combat, movement,
and legal-action distributions are now in the same range.

This is still not a pass. The old visible-style sign failure is closed:
episode-1 inputs 86–89 are Java
`0.3849/0.5499/0.5339/-0.1700` and FastSim
`0.3736/0.5539/0.5468/-0.2035`. Opening manta pressure now agrees to less than
0.001 normalized units at tick 1. Later potion, prayer, distance, and outcome
trajectories still differ and have not been cleared by an exact trace.

## Seeded replay result

The retained deterministic Teacher79 replay uses one identical 80-tick action
plan and keyed combat draws in both runtimes. Both sides produce 160 decisions.
After normalizing only run provenance, the strict gate matches every NHRL-v25
field and all 1,745 NHEV-v3 reward records.

See `out/replay-java-clean.nhrl`, `out/replay-fast-clean.nhrl`, and
`out/replay-clean-strict-report.json`.

## Verified against current Java source

### Combat and timing

- Accuracy, defence, effective strength, max-hit truncation, magic defence
  split, prayer reduction, and all current DMM item bonuses.
- The training worker may run every 300 ms, but every gameplay formula uses
  `Server.gameplayTickMs() == 600`.
- Spell and bolt projectile delays match `Projectile.send` and
  `Hit.clientDelayTicks` at every distance 1–13.
- A launch on tick `L` physically changes HP on `L + delay`; all styles use the
  same queue convention. The policy decision for that tick already ran, so HP,
  last-hit state, and direct expected-damage reward become visible on
  `L + delay + 1`.
- Prayer is evaluated at launch, including the one-tick protection-prayer
  switch delay.
- Accurate zero-damage Ice Barrage still freezes.
- Zuriel's staff uses the Kronos-local four-tick Ancient Magicks cycle.
- Confliction Gauntlets' stored accuracy block and magic gear-interference
  penalties are applied.
- Onyx bolts use a 10% per-attack proc, 20% damage boost, and immediate 25%
  lifesteal.
- Granite maul, Voidwaker, VLS, and the current DMM special-control rules are
  covered by engine tests.
- Replay-only deterministic combat draws use the same keyed SplitMix64
  calculation in Java and FastSim.
- Vengeance reflection queues a delayed typeless fixed hit, uses ceiling 75%,
  and does not recursively trigger another reflection.

### State, actions, and observations

- Current schema: NHRL v25, 114 inputs, 86 actions, 11 legal-mask bytes, and
  1,737-byte records.
- Current direct-action channel composition, required weapons, two-handed
  shield handling, optional direct gear, and exact factored exploration
  metadata pass the trainer's own strict loader.
- Opponent prayer/gear/attack information is staged from the prior tick.
- Opening `currentOffence` is empty even though the magic set is worn, matching
  `NhStakerBot` reset behavior.
- Visible-style reliability is recorded only for positive landed hits. Multiple
  hits landing in one tick are retained separately, with Java's
  matches-before-mismatches ordering.
- Potion doses, food counts, free slots, special history, Vengeance trinket
  counts, and the state114 tail inputs use Java's encodings.
- The two-charge Vengeance trinket frees its inventory slot only on the second
  cast. Magic decisions restore Java's one-free-slot invariant by sacrificing
  a manta after a direct unequip consumes the last slot.

### Movement and starts

- Direct movement legality includes lock/freeze gates, destination clipping,
  the pair planning leash, the 13-tile fight-origin boundary, and the
  every-other-tick reposition gate.
- Explicit movement consumes the attack tick; attack-to-chase remains a
  separate persistent route.
- Run energy, two-step running, permanent walk-after-empty behavior, slot-order
  movement, and stand-under recovery are implemented.
- The map binary is exported from the live Kronos cache. Worlds 35–42 contain
  260 Java-allocated lanes for both randomized ranges 1–8 and 4–8.
- `generate.py` fails closed for an unsupported world, distance range, or lane
  radius. It no longer silently falls back to an obstacle-free arena.

### Rewards and rollout metadata

- Nonterminal scalar transition reward remains zero, as in Java v25.
- Reward inputs 20–22 carry the running sparse-reward state.
- An NHEV-v3 sidecar carries causal reward events.
- Roll-prayer labels/reward attach to the prior defender decision; roll-tank
  labels/reward attach to the same-tick gear decision.
- Roll-prayer, roll-tank, offensive-style, and roll-offensive-gear teacher
  fields match Java in the retained strict replay.

## Remaining approximations and missing features

1. **The exact replay matrix is still narrow.** The retained 80-tick trace is
   exact, but more seeds, distances, processing roles, deaths/resets, and rare
   route edges should be captured before treating FastSim as a universal Java
   replacement.
2. **Persistent combat routing is simplified.** Direct steps use cache clipping,
   but the full Java `RouteFinder` search and every boundary interaction are not
   reproduced.
3. **Java's rare processing-order shuffle is absent.** FastSim uses stable
   player-slot order. Hit timing is order-independent in Kronos, but exact
   movement on the one shuffled tick is not represented.
4. **Same-slot landed damage is aggregated for HP, Vengeance, and rolling
   damage-source credit.** Style reliability now keeps every hit separately,
   but damage/source attribution is not yet per-hit.
5. **Inventory identity and slot order are simplified.** Counts, free-slot
   effects, trinket removal, and equipment capacity are represented, but the
   simulator does not carry a complete 28-slot item container.
6. **Granite-maul KO estimate inputs 73–76 are heuristic.** Java uses
   `NhExpectedDamageDistribution`.
7. **New teacher fields still require a Java gate.** The current v25 fields
   match in the retained trace; future teacher/schema additions must fail
   closed until ported and replayed.
8. **The 18 scripted cohort opponents are absent.** Mirror and
   checkpoint-versus-checkpoint generation work; Java remains the promotion
   battery.
9. **Smite and Redemption side effects are absent.** Their action legality
   windows are present, but Smite prayer drain and Redemption healing are not.
10. **Unused families remain absent.** Blood-spell healing, ruby bolts, Dark
    Bow, thrown weapons, and javelins are not in the current DMM action path.
    AGS prayer drain is likewise unused and absent.

## Kronos behaviors that differ from real OSRS

FastSim's deployment target is Kronos, so these are reproduced where used, not
"corrected" toward OSRS:

- **PID/hitsplats:** `Hit.defend` cancels the processing-order timing
  difference, so both roles land after the same logical delay. This is a Kronos
  divergence and should be reported separately if real-OSRS parity matters.
- **Launch-time secondary effects:** Ice freeze and Onyx healing resolve from
  the rolled hit at launch. FastSim reproduces both. Blood-spell healing is
  unused and not implemented. The launch-time semantics are a separate Kronos
  behavior, not a reason to delay them in training data.
- **300 ms training worker:** the faster wall clock changes throughput only.
  `tickMs()` is used for playtime/uptime and display conversions;
  `gameplayTickMs()` owns projectile and gameplay time. No second combat-timing
  path using 300 ms was found.
- **`TargetRoute.allowStep` same-tile TODO:** the currently exercised overlap
  and stand-under behavior is reproduced and tested, but the TODO branch lacks
  an independent seeded Java trace. Treat it as a Kronos routing risk to report,
  not a place to substitute assumed OSRS behavior.

## Acceptance gate

Before calling FastSim ready, replay controlled traces through both runtimes and
compare every tick and every emitted row across:

- distances 1–13 and both processing roles;
- overlapping projectiles and multiple hits sharing a landing tick;
- weapon/prayer switches while hits are airborne;
- all supply combinations, exact inventory capacity, and Vengeance;
- freeze, stand-under, combat chase, clipping, and origin/leash boundaries;
- special restore, VLS setup/control, KO timing, resets, and deaths;
- NHRL labels plus NHEV reward attribution.

The first strict trace passes; the wider matrix has not run. Retain the final
gate evidence, delete only superseded probes, and continue using Java for
promotion decisions and the unported scripted-cohort slice.
