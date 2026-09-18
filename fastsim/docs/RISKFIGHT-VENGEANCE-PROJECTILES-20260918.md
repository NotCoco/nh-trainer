# Risk Fight projectile and Vengeance review — 18 September 2026

## Normal Webweaver projectile

Live attacks already emitted `webweaver_arrow` / graphics 1574. The cache model
was present, but the renderer loaded effects only from demo and replay events.
Neither list contained this arrow. The projectile registry also lacked its row.
Registered projectiles now load before play, including the normal Webweaver arrow.
The Java asset exporter preserves that registry entry on subsequent exports.

The renderer also stretched the arrow's visible flight over the combat hit delay,
starting immediately. Normal Webweaver arrows now follow the Java client's 20 ms
clock: no model before cycle 41, then the packet trajectory through its inclusive
end cycle. The model advances before drawing, as in the Java client. At distance
one this is an 820 ms release delay and 220 ms visible flight; at distance eight,
820 ms release and 920 ms flight. Other projectile IDs retain their existing path.
The packet anchor is the received player-update boundary, `processed tick + 1`,
matching the existing actor-update clock instead of starting one tick too early.

Primary local evidence:

- `RangedWeapon.WEBWEAVER_BOW` uses `Projectile.arrow(1574)`, also used by Craw's bow.
- `Projectile.arrow`: heights 40/36, release 41, end `51 + 5 * max(0, distance - 1)`, curve 15, offset 11.
- `PacketSender.sendProjectile` sends the release and end cycle offsets separately.
- Java client `GrandExchangeOfferTotalQuantityComparator`, `DynamicObject` and `GameShell` provide the packet lifecycle, inclusive visibility and 20 ms clock.

The [OSRS Wiki Webweaver page](https://oldschool.runescape.wiki/w/Webweaver_bow)
confirms the bow's three-tick Rapid attack speed and generated ammunition.
The trainer retains its requested inactive-looking practice bow and normal shot.

Combat arrival remains the existing Java-derived convention: two game ticks at
distances one through five, three at six through nine. This renderer correction
does not change those combat rules or assert stock OSRS hit/PID equivalence. The
Wiki's generic hit-delay table describes a different processing-order convention.

## Vengeance training

Runtime inference has no scripted opening Vengeance cast and no cast reward.
However, the bootstrap demonstrator previously prioritized casting whenever it
was legal. It now demonstrates casting against a visible arrow due next tick
when its own arrow or near melee follow-up can land with the reflection. This
uses public observations, without rolled future damage or private opponent state.

The training bridge adds credit only for actual Vengeance and direct attack
damage against the same opponent on the same tick. Misses, casting, recoil-only
damage, another tick's attack and overkill do not inflate that credit. The bonus
is capped at half the triggering net damage penalty after reflection/recoil,
and at eight reward units per fighter per fight. The existing damage ledger
remains capped at 32, total shaping at 40, and terminal win/loss at +100/-100.
The public observation schema and its original damage-ledger inputs are unchanged.

New diagnostics separately count casts, reflected damage, stacked damage and
stack credit. Changed demonstrations or higher reward totals alone are not
evidence that a model has become a stronger fighter.

## Evidence

- Live captures and the projectile timing checks are retained under
  `.codex-tmp/webweaver-projectile-20260918`.
- Reward checks cover isolated Vengeance, a real same-tick stack, a miss,
  off-tick damage, recoil, overkill and casting without reflection.
- CUDA training artifacts are retained under
  `fastsim/out/riskfight/20260918-vengeance-stacks-v2`.
- A separate deterministic comparison against the current localhost v2 model
  uses new seed clusters, both roles/PID assignments, distances 1/5/9, and three
  held-out scripted opponents. Full records are retained in
  `fastsim/out/riskfight/20260918-vengeance-current-reference`.

## Training decision

The CUDA run used the RTX 4060 Ti, 128 demonstration fights and four PPO updates
of 96 fights each, taking 803.7 seconds including validation and evaluation.
The warm-start and updates two through four failed the original validation gate;
update one was the selected continuation. It scored 85.94% against the old v1
reference in 288 held-out fights, which did not establish an improvement over
the current localhost v2 model.

The additional current-model checks produced:

| Candidate | Comparison | Wins / losses / draws | Score | Paired-seed 95% interval |
| --- | --- | --- | --- | --- |
| PPO update one | 288 new held-out fights against current v2 | 152 / 128 / 8 | 54.17% | 47.74–60.42% |
| Timing-focused warm-start | 144 validation fights against current v2 | 65 / 76 / 3 | 46.18% | 36.46–56.95% |

Against the three held-out scripts, the continuation/current-model scores were
73.96/65.10%, 51.56/56.77%, and 52.60/52.08%. All paired improvement intervals
included zero. Neither candidate justified replacing the current model.

Vengeance also did not show a demonstrated improvement: in the direct held-out
comparison the continuation averaged 12.74 stacked damage versus 13.72 for the
current model. Controlled observation probes were unchanged: both chose Vengeance
in 14/18 situations without incoming/outgoing arrows, and 15/18 with arrows due
next tick. These probes are not full-fight strength evidence, but they prevent
claiming that the brief run taught expert Vengeance timing.

The current checkpoint and weights remain selected. The reward and demonstration
corrections are available for subsequent training; there is no runtime cast ban,
forced delay, tactical fallback or replacement with an unproven candidate.

The unchanged current checkpoint was also requalified against the present source
in `fastsim/out/riskfight/20260918-current-source-qualification`: 239 wins, 40 losses
and nine simultaneous KOs in 288 paired fights against the frozen v1 reference,
84.55% score, paired interval 78.99–89.58%, with no illegal actions or timeouts.
The three varied-opponent comparisons also passed. The browser JSON refreshes
qualification/source metadata only; its checkpoint and parameter hashes remain
`230f43873177b54d3df4ef1f53d157027d94d2122c722589e6efe4408b74b994`
and `4e10156884eabd7b19d76ecbe4df8ccfeae025c5781a95784ada6f012377267a`.
Original training provenance remains separate from the current qualification.

Final `npm run typecheck`, `verify:projectile-lifecycle` and
`verify:riskfight-browser-candidate` checks pass. The latter includes the new
Vengeance reward regressions. The initial source-hash guard had correctly
flagged gameplay edits made since the earlier qualification; current-source
evaluation resolved that without weakening the guard or changing the weights.

No stable NH or DMM policy is trained or replaced by this work.
