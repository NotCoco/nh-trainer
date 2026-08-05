# What the trainer eats

The output format has to be indistinguishable from what the Java server writes,
because `train_selfplay_rl.py` reads it without knowing who produced it.
Behavioral parity remains a separate open gate in `PARITY.md`.

---

## The file

One `.nhrl` file per shard. Big-endian binary — the Java writes with
`DataOutputStream`. A short header, then a stream of fixed-size records, one per
decision per fighter.

**Current live schema, read from current Java rollouts and cross-checked against
the `schema` dict in retained state114 checkpoints:**

| | |
|---|---|
| Schema version | 25 |
| Inputs per row | 114 |
| Feature size | 163 |
| Actions | 86 |
| Legal mask | 11 bytes (88 bits, 86 used) |
| Record size | 1737 bytes |

> **Watch this.** Older rollouts still sitting in `data/ai/rollouts` are version
> 14–16 with **111** inputs. That is a retired layout. Anything generated
> against it is useless to the current trainer. `fastsim/schema.py` asserts the
> record comes out at exactly 1737 bytes so a schema drift fails loudly instead
> of producing a corpus nobody can use.

---

## One row = one fighter, one tick

Both sides of every fight produce a row every tick while alive. The exact count
depends on deaths, resets, and the configured tick cap.

### What each row carries

**Identity and timing** — row id, decision tick, transition tick, episode id,
which bot, which target.

**The observation** — `input` (114 floats) is the state the decision was made
from, `next_input` (114 floats) is the state the *next* decision is made from,
one full tick later. The pair is what makes it a transition rather than just a
snapshot.

That distinction is worth being precise about: `next_input` is not the state
immediately after this tick's actions resolve. It is the state at the next
decision. A projectile launched on `L` physically changes HP on `L + delay`,
but that tick's NH decision already ran before `Player.processHits`; the changed
HP, last-hit fields, and direct expected-damage reward therefore first appear
in the decision observation on `L + delay + 1`. Checked against real Java
rollouts — `next_input(T)` equals
`input(T+1)` on 100% of consecutive same-bot pairs. The engine therefore builds
each observation once and uses it for both roles, which is also half the work.

**The action** — up to 16 same-tick labels plus the five older Java subhead
labels: attack, spec, defence, movement, and supply. The same-tick labels also
carry required combat weapons and direct per-slot gear actions.

**The legal mask** — which of the 86 actions were available. The trainer uses
this to avoid learning from moves that were never on the table.

**Reward** — Java v25 keeps nonterminal scalar transition reward at zero.
Running sparse reward state is visible in inputs 20–22, while the adjacent
`.nhev` v3 file carries timestamped causal reward events and contributor
weights. Terminal kill/death reward remains in the transition row.

**Exploration bookkeeping** — the largest and fussiest part of the record, and
the part most likely to be got subtly wrong. Details below.

**Teacher labels** — FastSim writes the mechanically derived roll-prayer and
roll-tank labels at the same decision ownership as Java. Scripted offensive
style and roll-offensive-gear labels remain `-1`.

---

## The exploration bookkeeping

The trainer computes importance ratios from these numbers, so an error here
does not crash anything — it quietly biases the gradient. `nh_rollout.py`
validates it to 1e-12, and this rig is built to satisfy that check by
construction rather than by patching afterwards.

The rule is one die for the whole decision, not one per channel:

```
eligible channels = those with at least one legal alternative to greedy
k                 = how many are eligible

with probability epsilon, exactly ONE eligible channel is explored:
    which channel   - uniform among the eligible ones
    which action    - uniform among that channel's alternatives
```

Which makes the recorded probability for each channel:

| Situation | Probability |
|---|---|
| Not eligible | 1 |
| Eligible, kept the greedy action | 1 − epsilon/k |
| Eligible, explored | epsilon / k / (number of alternatives) |

Plus the invariants the loader enforces: at most one channel may deviate per
row; a deviation must belong to the channel that was attempted; a channel's
recorded support must contain its own greedy action; the eleven gear channels
must record "virtual none" (-1) and no support.

`behavior_log_probability` is the sum of the four channels' log probabilities —
the joint over the chosen action vector, which is what the trainer's ratio
expects.

Measured on generated data: configured epsilon 0.22, observed trigger rate
0.2202.

---

## The 86 actions

Five channels, one action chosen from each per tick. Boundaries were measured
by decoding the `causal_unit_sampling_support_masks` in real rollouts, which
record for every channel exactly which action ids belong to it.

| Channel | Ids | Count | What it decides |
|---|---|---|---|
| combat | 0–17 | 18 | attack with a style, fire a special, or neither |
| defence | 18–22 | 5 | which overhead prayer |
| movement | 23–48 | 26 | stay, stand under, or one of 24 offsets |
| supply | 49–56 | 8 | eat, brew, restore, vengeance trinket |
| gear | 57–85 | 29 | direct per-slot equipment swaps |

The gear ids overlap across slots — slot *i* owns ids 57+*i* and 76+*i* — which
is why the ranges above look odd. That is what the data says.

---

## The 114 inputs

The order is fixed by `NhStakerSelfPlayManager.encodeInput` and must never be
rearranged: every trained checkpoint was fitted to this exact ordering, so one
swapped slot invalidates all of them. `fastsim/schema.py` lists all 114 with
their index constants and normalisers.

Rough grouping:

| Slots | Contents |
|---|---|
| 0–33 | distance, both HPs, prayer, supplies, readiness flags, freezes, movement deltas |
| 34–48 | five 3-wide one-hot style blocks (self, current, scripted, opponent likely, opponent gear) |
| 49–58 | overhead prayers as bits, weapon ids as sin/cos pairs |
| 59–72 | opponent spec estimate, stat ratios and deficits, melee reach both ways |
| 73–89 | granite maul knockout estimates, defence scores and gains, opponent weaknesses, style-read stats |
| 90–109 | vengeance trinket state, specials used, last and previous spec kind, inventory, shield |
| 110–113 | opponent attack age, own attack delay, spec control, VLS setup pending |

---

## What this rig does not produce

Stated plainly so nobody discovers it the hard way:

**Current direct-action teacher fields are emitted.** Roll-prayer, roll-tank,
offensive-style, and roll-offensive-gear fields match Java in the retained
strict replay. Keep Java as the authority when adding a new teacher field or
schema version.

**Scripted cohort opponents are not implemented.** The 18-cohort battery
(ONE_TICK_FAKER, MAGE_HEAVY, STAND_UNDER_FREEZE and the rest) lives in the Java
and is the project's promotion gate. This rig currently does mirror self-play
and checkpoint-versus-checkpoint. Cohorts are the obvious next thing to add,
and the engine has the hooks for it — an opponent is just something that
produces scores, so a scripted one drops into the same slot as a checkpoint.

**The exact seeded replay gate passes for the retained Teacher79 trace.** It
matches all 160 normalized NHRL decisions and all 1,745 NHEV reward records.
This clears the repaired path for GPU data generation; Java remains the
promotion authority while more seeds, distances, roles, resets, and rare route
edges are added to the replay matrix.
