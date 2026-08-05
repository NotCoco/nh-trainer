# What actually decides an NH fight

Everything the simulator needs to know, and where each number came from.

This is the reference document. If the Kronos server changes, this is the file
to re-check first, because every constant below is duplicated in code somewhere
in `fastsim/`.

---

## The shape of a fight

Two players, 99 in every combat stat, both on the DMM loadout. They start a few
tiles apart. Each game tick is 0.6 seconds. A fight ends when one dies or when
the tick cap is reached (the project standard is 1200 ticks).

Three fighting styles, and switching between them is most of the game:

| Style | Weapon | Speed | Reach |
|---|---|---|---|
| Magic | Zuriel's staff, autocasting Ice Barrage | 5 ticks | 10 tiles |
| Ranged | Zaryte crossbow on rapid | 5 ticks (6 base, rapid takes one off) | 8 tiles |
| Melee | Vesta's longsword, aggressive | 5 ticks | 1 tile |

Reach comes from `PlayerCombat.java:495`: a spell always reaches 10; anything
else uses the weapon's own range capped at 10. Rapid shaving a tick is
`PlayerCombat.java:858`.

---

## How one attack resolves

Two dice, exactly as the server rolls them.

### Die one: does it land

Both sides compute a roll, and the attacker's roll is compared against the
defender's.

**Attacker's roll** = effective attack × (attack bonus + 64)

Effective attack starts at the relevant level, multiplied by the offensive
prayer boost, plus a style bonus, plus 8.

**Defender's roll** = effective defence × (defence bonus + 64)

Effective defence is the defence level times its prayer boost, plus 8.

**Chance to hit:**

```
if attack > defence:  1 - (defence + 2) / (2 × (attack + 1))
else:                 attack / (2 × (defence + 1))
```

All of this is `CombatUtils.hitChance` and the two `get*Bonus` methods.

### Die two: how hard

If it landed, damage is a uniform roll from 0 to the max hit, inclusive.

**Melee and ranged max hit:**

```
(int)(1.3 + effectiveStrength/10 + bonus/80 + effectiveStrength×bonus/640)
```

Note the truncation, and note that effective strength applies `ceil` to
level × prayer *before* adding the style bonus. Both matter at the margins.

**Magic max hit** is the spell's own maximum scaled by the magic damage bonus:

```
30 × (1 + magicDamageBonus/100)
```

30 is Ice Barrage's base (`IceBarrage.java`), and Zuriel's staff also gives
the spell a 10% accuracy boost in `beforeHit`.

### The prayer step — and *when* it happens

If the defender has the matching overhead up, the damage is multiplied by
**0.6**. Not blocked — reduced. `PlayerCombat.postDefend`.

The timing of that check is the single most important detail in this document.

**The prayer is checked when the attack is thrown, not when it lands.**

`Entity.hit(...)` calls `Hit.defend(target)` the moment the attack is made.
`defend()` rolls the damage, rolls accuracy, and then fires the target's
`postDefend` listener — which is `PlayerCombat.postDefend`, where
`hit.damage *= 0.60` lives. By the time the hit is queued, the number is
already final. Only the health-bar update waits for the projectile.

So a defender who waits to see the projectile and *then* switches overhead has
already lost that exchange. The overhead has to be up before the attacker
commits. That is exactly why this project is about **predicting** the
opponent's style rather than reacting to it — reacting is not merely hard here,
it is mechanically impossible.

One further rule, from `nhStakerDefencePrayerSwitchTooFreshForHit`: a switch
made on the very tick the attack is rolled has not taken effect yet, and the
previous overhead is used instead. That is the one-tick prayer switch delay, so
the prayer must have been set at least one tick before the attack.

Opponent state and protection prayer are both staged one tick behind, matching
the web trainer and the Java server's one-tick protection visibility. A prayer
chosen on tick `N` first protects a roll on `N+1`; the attacker first observes
that prayer at decision `N+1`, too late to read the prayer that protects the
roll it is currently making. The attacker reads the prayer as of the prior
completed tick, never the tick it rolls its own hit.

---

## How long a hit takes to arrive

Not a constant. It depends on distance, and it is what gives the defender time
to react at all.

```
distance = max(|dx|, |dy|)
duration = durationStart + durationIncrement × max(0, distance − 1)
raw      = delay + duration
ticks    = max(1, (raw × cycleRate) ÷ tickMs)        [integer division]
```

| | delay | start | increment | cycle rate |
|---|---|---|---|---|
| Ice Barrage | 51 | 56 | 10 | 19 |
| Dragon bolts | 41 | 51 | 5 | 16 |
| Melee | — | — | — | lands next tick |

### The 300ms trap — and it is the opposite of what it looks like

`Server.java` has **two** tick lengths, and mixing them up is the single worst
error this rig has had.

```java
public static int tickMs() {          // real-time gap between ticks
    return (int) Server.worker.getPeriod();     // 300 under training, 600 live
}

public static int gameplayTickMs() {  // the LOGICAL tick
    return (int) DEFAULT_TICK_MS;               // hardcoded 600, always
}
```

`Hit.clientDelayTicks` divides by `gameplayTickMs()`. Every other use of
`tickMs()` in the entire server is display text — uptime, playtime, bestiary
strings. **No game logic reads the 300.**

So the training profile plays the same logical ticks twice as fast in wall-clock
time. It does not change what happens inside a tick. A barrage at distance 10 is
6 ticks in training exactly as it is live.

| Distance | Barrage | Bolt |
|---|---|---|
| 1 | 3 | 2 |
| 5 | 4 | 2 |
| 10 | 6 | 3 |

This file previously claimed the opposite and the rig divided by 300, doubling
every projectile flight in the game. `test_the_gameplay_tick_is_always_six_hundred`
now guards it.

### PID — and why it does not shift hitsplats on this server

In real OSRS, processing order within a tick (PID) decides whether a hitsplat
lands on the expected tick or a tick later. **Kronos explicitly cancels that
out.** The relevant line is `Hit.defend`:

```java
if (ticks > 0 && target.processed)
    ticks--;
```

`CoreWorker` walks the player list, setting `processed = true` just before each
player's `process()`, and `Player.process()` runs `processHits()` first — which
is where a queued hit's countdown ticks down.

Work through both orderings:

| | at launch | later that tick | net |
|---|---|---|---|
| Attacker processed **first** | target not yet processed → no decrement | target's `processHits()` runs, one countdown step | one step used |
| Attacker processed **second** | target already processed → `ticks--` | target already ran, no further step | one step used |

Both paths consume exactly one step on the launch tick, so the hit lands on the
same tick either way. The `ticks--` is a compensation, not an advantage.

There are two distinct phases to keep separate. A launch on tick `L` physically
changes HP on `L + delay`, but `AIPlayer.checkLogout` has already run the NH
decision for that tick before `Player.processHits`. The changed HP, last-hit
features, and direct expected-damage reward are therefore visible to the policy
on `L + delay + 1`. Supplies, prayer, and gear selected on the impact tick run
before the damage; movement and attacks run after it, so a fighter may eat
before the hit but cannot swing after that hit kills them.

Worked through concretely, two players one tile apart both swinging melee on
the same tick: the first player's hit gets no adjustment but is counted down
when the second player takes their turn; the second player's hit is adjusted at
launch instead. Both land on the following tick. Neither is ahead.

### PID swaps — there *is* a rule, and it is an odd one

Kronos does shuffle the order. `CoreWorker.index()` ends with:

```java
if(--scrambleTicks <= 0) {
    scrambleTicks = Random.get(40, 60);
    players.scramble();
    npcs.scramble();
}
```

`Random.get(40, 60)` is inclusive, so a shuffle happens every **40 to 60 ticks**,
re-rolled each time. `EntityList.scramble()` is a proper Fisher-Yates shuffle of
the iteration order.

The catch is what happens on all the *other* ticks. `index()` runs every single
tick, and the first thing it does is rebuild the order from scratch:

```java
players.resetCount();
for(Player player : players.entityList)
    if(player != null) players.index(player);
```

That refills the order in ascending player-index sequence. So the shuffle only
survives for the one tick it happens on — the next tick puts everything back to
"lowest player index goes first". Effectively the order is fixed almost always,
with a single scrambled tick roughly once a minute at live cadence.

None of this is modelled here, and it does not need to be: the countdown
compensation above means order does not move hitsplats, and the prayer rule
below means it does not move protection either.

### The prayer read is order-independent too

The other thing PID could plausibly change is *which* overhead the attacker
rolls against, since the defender may have switched prayers earlier in the same
tick. `PlayerCombat.nhStakerEffectiveProtectionStyleCode` removes that:

```java
if (nhStakerDefencePrayerSwitchTooFreshForHit(switchTick, hit)
        && currentStyle == activeStyle && previousStyle != currentStyle)
    return previousStyle;
```

with `NH_STAKER_DEFENCE_PRAYER_EFFECTIVE_DELAY_TICKS = 1`. A prayer switched on
the same tick as the roll does not count, so:

- attacker first — defender has not switched yet, roll uses last tick's overhead
- attacker second — defender may have switched, but the switch is "too fresh",
  so the roll falls back to the previous overhead: last tick's overhead again

Same answer either way.

### What order *does* still decide

`Player.process()` runs `processHits()` **before** combat, and
`PlayerCombat.canAttack` returns false when `isDead()`. So damage arriving at
the top of a tick can take that tick's attack away from whoever it kills — and
a dead target cannot be attacked either.

That is symmetric between the two fighters (both take their damage before they
act), so it is not a first-mover advantage. But it does mean a fighter who is
killed at the start of a tick must not get a swing in. This simulator enforces
that; without it, close fights resolve wrong.

FastSim now processes explicit and persistent movement in player-slot order,
with one walk step and an optional run step using cache-derived clipping.
Combat intent is planned before movement, `TargetRoute`-style chase is then
applied, and both attacks resolve from the resulting positions.

That reproduces the exercised attack-in-range, chase, overlap, and stand-under
paths, but it is still not the full sequential Java `RouteFinder`. An exact
boundary where the second player sees the first player's new tile has not been
cleared by a seeded Java trace, and Java's rare one-tick processing-order
shuffle is absent. Both remain listed in `PARITY.md`.

---

## The magic defence rule

This is the one most likely to be got wrong, and it has real strategic weight.

Against a magic attack, the defender's roll is **not** their defence stat. It is:

```
30% of effective defence  +  70% of effective magic level
```

Then multiplied by the magic defence bonus of their gear.

The practical consequence, and one the user has already flagged as a bot
weakness: standing in Torva legs while being barraged is expensive, because
Torva has *negative* magic defence. Swapping to mage gear during a window where
the opponent cannot attack is free defence. The bot currently fails to do this.

---

## Freezing

Ice Barrage freezes on a successful hit for **20 ticks** (`IceBarrage.afterHit`
calls `hold(hit, target, 20, true)`).

A frozen player cannot move at all. They can still attack, eat, pray and swap
gear. After the freeze ends there is a short immunity window before another can
land, otherwise a mage could permafreeze.

Freezing is what converts a mage hit into a whole sequence: freeze, step out of
melee range, and keep hitting from distance while the opponent cannot close.

---

## Prayer

Five options in the prayer channel:

| | |
|---|---|
| Protect from Magic | blocks 40% of magic damage |
| Protect from Missiles | blocks 40% of ranged damage |
| Protect from Melee | blocks 40% of melee damage |
| Smite | drains the opponent's prayer when you hit |
| Redemption | heals when you drop low |

Only one overhead can be on. It drains prayer points continuously, and when
prayer runs out the overhead drops on its own.

The bot also runs the offensive prayer matching its style, chosen automatically
rather than as a separate action:

| Style | Prayer | Boosts |
|---|---|---|
| Magic | Augury | magic +25%, defence +25% |
| Ranged | Rigour | ranged attack +20%, ranged strength +23%, defence +25% |
| Melee | Piety | attack +20%, strength +23%, defence +25% |

Values from `Prayer.java`. Selection logic at `NhStakerSelfPlayManager.java:4834`.

---

## Why prayer has to be *predicted*, not reacted to

This is a design rule of the project, not a limitation to be engineered away.

The information a fighter gets about their opponent is **held back by one
tick**. They cannot see the incoming attack style on the tick it is thrown and
pray it in time. They have to read tendencies, attack timing, and gear history,
and pray for what they think is coming.

Reasons this is deliberate:

- A real NHer cannot same-tick react. A bot that could would be an aimbot, not
  a good player.
- The opponents are adversarial. They can see the overhead prayer and adapt,
  and they **feint** — pull a crossbow and then cast magic on the next tick.
- Because opponents adapt, always praying one style gets punished. There is a
  game-theory ceiling on how often prayer can possibly match.

So **100% prayer match is impossible on purpose**, and prayer match rate is a
diagnostic number only. It is never a training target and never a promotion
gate. The objective is damage differential: damage dealt while reducing damage
taken.

Any input added to this simulator must pass one test: *could a human NHer
plausibly know this at that moment?* Past styles, timing, distance, visible
gear — fine. The style of the attack currently being thrown — not fine.

---

## Supplies

Eating costs attack time, which is what makes it a real decision rather than
free health.

| Action | Effect |
|---|---|
| Safe eat | one food, +22 hp, 3 tick attack delay |
| Double / triple eat | combo eating, more healing, more time lost |
| Brew | +16 hp but drains combat stats ~10% |
| Restore | +30 prayer, and tops combat stats back up |
| Vengeance trinket | reflects 75% of the next hit back, then a cooldown |

The stat drain on brews is why they are not simply better food, and the
vengeance trinket is why a big spec into a fresh veng is a losing trade.

**Known bug in the server, reported by the user:** the vengeance trinket
wrongly delays the next attack. That is a real mechanics bug on the Java side,
not something to reproduce here.

---

## Special attacks

They are not variations on a theme. The differences are the entire reason a
player picks one over another.

| Special | Energy | What it actually does |
|---|---|---|
| Granite maul | 500 | one extra ordinary hit, immediately, no bonuses at all |
| Granite maul double | 1000 | two of them |
| Armadyl godsword | 500 | +37.5% damage and **double accuracy** |
| Voidwaker | 500 | **ignores defence entirely** — always lands — for 50–150% of max |
| Vesta's longsword | 250 | 20–120% of max, rolled against **stab** defence with the defender's defence cut by **75%** |

Two consequences worth knowing:

- **The granite maul's value is speed, not power.** It has no damage or accuracy
  bonus whatsoever. It is the knockout tool purely because it lands instantly,
  off the attack timer — a maul double into someone who prayed wrong is how most
  fights end.
- **The Voidwaker is thrown as a *magic* hit** (`AttackStyle.MAGIC` in
  `Voidwaker.java`). So protect-from-magic reduces it, not protect-from-melee —
  even though it comes from a melee weapon at melee range.

All are melee-range and land the next tick. Energy regenerates 10% every 50
ticks. Costs are `getDrainAmount() × 10`.

---

## Movement

Movement is one tile per tick in each axis. The movement channel offers:

- stay put
- stand under (step onto the opponent's tile, which blocks melee)
- 24 fixed offsets in a 5×5 box around the current position

Standing under is the core defensive melee move. Stepping out after a freeze is
the core offensive mage move. Both are in the channel; the bot has to learn when.

---

## Where each number lives

| Thing | Source |
|---|---|
| Accuracy, max hit, defence rolls | `model/combat/CombatUtils.java` |
| Ice Barrage max hit, freeze length | `model/skills/magic/spells/ancient/IceBarrage.java` |
| Attack speeds, weapon reach | `data/items/weapon_types.json` |
| Reach cap and rapid | `model/entity/player/PlayerCombat.java:495,858` |
| Prayer boosts | `model/entity/player/Prayer.java` |
| DMM gear bonuses | `model/data/impl/items/DmmRuntimeItems.java` |
| Which gear is in which set | `model/entity/player/ai/NhStakerLoadout.java` |
| The 114 inputs, in order | `NhStakerSelfPlayManager.encodeInput` |
| The 86 actions and their channels | measured from real `.nhrl` support masks |
| Rollout file layout | `tools/nh-gpu-trainer/nh_rollout.py` |
