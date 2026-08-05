# KronosFastSim

Generate NH training data without starting the server.

> This folder is the GPU fight engine for the NH Trainer project. It lives inside
> the `nh-trainer` repo under `fastsim/`. It was developed against the Kronos
> server/trainer layout (`fastsim/paths.py` points at the original working tree),
> so running it outside that layout requires adjusting those paths. The Elo
> league that selects the deployed DMM model runs from `tools/evaluate_elo_league.py`.

---

## The point of this folder

Training data for the NH bot has been made by booting the whole Kronos server
and letting bots fight inside it. That works, but almost none of the time is
spent on the actual fighting. It goes on networking, the world, player updates,
spawning, and the thousand other things a game server does — none of which
changes a single hit.

This folder runs only the fighting.

It targets the same combat maths, 114 inputs, 86 actions, NHRL-v25 rows, and
NHEV-v3 reward events without the server wrapped around them. The existing
trainer can read the files unchanged. The retained seeded replay gate passes;
see `docs/PARITY.md` for the wider behavior that is still being validated.

---

## How the work is split

Two very different jobs, given to the hardware that suits each one.

### The CPU runs the fight rules

Did the hit land. Is he in range. Did the freeze land. Is he still eating. Can
he even reach. This is all "if this, then that", and it goes different ways for
different fights. CPUs are built for exactly this. GPUs are terrible at it — on
a GPU, when some fights go one way and some go the other, every fight is made
to sit through both paths.

So the fight rules never touch the GPU.

### The GPU runs the bot's thinking

The trained model is 114 numbers in, 86 scores out, through a fixed chain of
multiply-and-add. There are no decisions inside it at all — the same arithmetic
every tick, for every bot, forever. Only the numbers going in differ.

That is the one thing a GPU is genuinely good at: the identical calculation on
thousands of rows at once. So all the bots' thinking happens in a single call.

### The loop

```
CPU reads the fight  ->  GPU scores the options for every bot at once
      ^                                    |
      |                                    v
CPU applies the game rules  <-  CPU picks a legal action per channel
```

---

## What it does so far

The current source-backed engine writes complete v25 rows, teacher labels, and
causal NHEV events. On this machine, the final retained Teacher79 benchmark
used 512 fights per worker, 30 ticks, and seeds 0-2 in both orders. The
simulation-only optimum is four workers at a six-run median of 36,936 usable
decisions per second. Full NHRL+NHEV generation is fastest with three workers
at 29,430 usable rows per second steady, or 16,914 per second including
one-shot worker startup.

Four workers are best when no files are written; writer contention makes three
workers best for actual dataset generation. `generate.py` reports usable
decisions separately from fixed simulator slots so completed lanes no longer
inflate the headline rate.
For long jobs, use multiple episodes per lane to reduce the inactive tail; a
300-tick occupancy check improved from 17,732/s with one episode per lane to
21,485/s with two 150-tick episodes per lane.

Older headline numbers above 250,000 decisions per second came from a much
simpler engine before movement, reward, inventory, and composition parity work.
They are not representative of the current generator.

---

## Using it

The seeded strict replay gate now passes for the retained 80-tick Teacher79
trace. Generate a self-play dataset with a checkpoint, written straight into
the folder the trainer already reads:

```bash
python generate.py --fights 4096 --policy checkpoints/solana2-dmm-v25-teacher84-....pt --out auto
```

Speed check only, nothing written:

```bash
python generate.py --fights 4096 --benchmark
```

One checkpoint against another, for head-to-head or snapshot opponents:

```bash
python generate.py --fights 2000 --policy champion.pt --opponent challenger.pt --out auto
```

Generate current NHRL rows against a deterministic cohort opponent. Fixed
scripts require exploration off so their promised attack pattern cannot be
randomly replaced:

```bash
python generate.py --fights 2000 --policy champion.pt --opponent-script fixed-melee --opponent-script-defence smite --epsilon 0 --out auto
python generate.py --fights 2000 --policy champion.pt --opponent-script vls-pressure --opponent-script-defence smite --epsilon 0 --out auto
```

The available cohorts are `fixed-magic`, `fixed-ranged`, `fixed-melee`, and
`vls-pressure`. Scripted rows are marked with the existing `cohort` source-pair
code rather than mislabeled as mirror or ancestral-snapshot data.

Spread full dataset generation across the measured three-worker optimum:

```bash
python generate.py --fights 2048 --workers 3 --policy champion.pt --out auto
```

The default start range is 1–8 on cache-derived world 35 lanes. Worlds 35–42
support both 1–8 and 4–8. Unsupported world/range/radius combinations stop
instead of silently using an obstacle-free fallback.

For a long generation command, `--episodes-per-lane 2` or higher refills a
lane after its fight ends and amortizes worker startup. It multiplies the total
fight count, so account for it when choosing `--fights`.

---

## Checking it still agrees with the server

These checks validate mechanics and file integrity. The seeded Java/FastSim
gate is `tools/replay_gate.py`; the retained strict trace matches every
normalized NHRL-v25 field and every NHEV-v3 record. Java remains the promotion
authority while the replay matrix is widened and scripted cohorts are ported.

Compare an already captured deterministic pair:

```bash
python tools/replay_gate.py compare --java out/java-replay.nhrl --fast out/fast-replay.nhrl --profile strict --report out/replay-report.json
```

**The format test** writes a rollout here and reads it back with the trainer's
own loader, including strict exploration and reward-event checks:

```bash
python tests/test_nhrl_roundtrip.py
```

**The maths test** checks the combat formulas, projectile flight times and
special attacks against numbers worked out by hand from the Java, not against
our own previous output:

```bash
python tests/test_combat_parity.py
```

**The prayer timing test** drives the real engine and checks that the damage
number is locked in when the attack is thrown, not when it lands — the mechanic
the whole project depends on:

```bash
python tests/test_prayer_timing.py
```

**The gear check** re-reads the server's own item data and diffs all 20 items
against what the simulator uses:

```bash
python tools/verify_gear_table.py
```

---

## Read this before trusting the numbers

This is a **reimplementation**. The risk is not that it crashes — it is that it
quietly disagrees with the real server, and the bot ends up trained on a game
that is not the one it gets deployed into. You would not see that in the
training curves. You would only see it when it plays worse than the numbers
promised.

`docs/PARITY.md` lists exactly which mechanics were copied from the Java source,
which were measured from real rollout files, and which are still approximations.
Read it before using this for a training run that matters.

---

## Layout

```
fastsim/
  schema.py        the 114 inputs and 86 actions, and where each constant came from
  gear.py          the DMM loadout and its bonuses
  combat.py        accuracy, max hit, defence rolls - translated from CombatUtils.java
  state.py         every fight in the batch, as columns of numbers
  observation.py   state -> the 114 numbers the model reads
  actions.py       what is legal, and how one action per channel gets picked
  policy.py        the GPU call - loads the trainer's own .pt checkpoints
  engine.py        the tick loop: the fight rules
  nhrl_writer.py   writes .nhrl files the existing trainer reads unchanged
  paths.py         where the server and trainer live
docs/
  FIGHT-MECHANICS.md   what actually decides an NH fight, and the numbers behind it
  TRAINING-DATA.md     what the trainer eats, field by field
  PARITY.md            verified / measured / approximated - read before trusting output
tools/
  verify_gear_table.py  re-reads the server's item data and diffs it against gear.py
tests/
generate.py        the command line entry point
```

---

## A detail worth knowing

The **training** runtime profile runs ticks every 300ms of real time instead of
600ms — but that is throughput only. The *logical* tick is always 600ms:
`Server.gameplayTickMs()` is hardcoded to it, and that is what all combat maths
divides by. The 300 appears nowhere except uptime and playtime strings.

So a barrage at distance 10 takes 6 ticks in training exactly as it does live.
Running the simulation faster must never change a tick count — full explanation
and table in `docs/FIGHT-MECHANICS.md`.
