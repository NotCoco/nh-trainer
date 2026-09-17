# DMM attack-speed options — 17 September 2026

The local trainer now has an **Attack speed** menu above the chat controls in DMM mode. Zuriel's Ancient casting and Rapid crossbow attacks can each use four or five ticks, independently, for both fighters. Defaults remain four-tick casting and five-tick Rapid crossbow. Accurate/Longrange crossbow attacks and other weapons retain their existing timing. The settings survive a fight reset within the session; they are not saved across a page reload.

Changing a setting only affects newly launched attacks. An already-running cooldown, food delay, weapon switch, and queued projectile retain their existing state. This is a trainer option; the Java server's default four-tick Zuriel rule was not changed.

## Assessment

The timing implementation passed the focused checks. The modest pressure-matchup screen found no sustained in-range attack lockup and no large drop in outgoing expected damage. It does **not** establish unchanged playing strength: the combined five-tick staff/four-tick crossbow configuration took substantially more incoming expected damage in this small sample, and the mirror screens exposed out-of-range non-progress at both default and alternate speeds.

Keep these as opt-in lab settings. Five-tick staff casting does not itself prevent the policy from recognizing when it can attack. Do not interpret this screen as a recommendation to replace the defaults or as proof of equal high-level performance.

## Small matchup screen

Used the exact DMM fixture selected by `src/ui/App.tsx`: `fixtures/ai/nh-neural-policy-dmm-current.json`, conditioned v10, 114 inputs and 86 actions. SHA-256: `ccb88e7616ff170b7415755beefc25d888f1155ffae9f27914e4716dd2f393cf`. The model and controller were unchanged, and inference was deterministic with exploration off.

There were four pressure fights per setting: a reactive scripted opponent and a predominantly ranged pressure opponent, each with a one-tile/seed-906 opening and an eight-tile/seed-1607 opening. The measured policy's actor role was reversed between openings. Both sides had the DMM inventory and used the actual runtime policy-action, equipment, supply, prayer, projectile, damage, and cooldown paths. Both decision paths read the same completed prior-tick opponent view. The arena was unobstructed.

| Staff / Rapid crossbow | Attacks per 100 ticks | Expected damage out per 100 ticks | Expected damage in per 100 ticks | Wins | Longest consecutive ready, in-range idle run |
| --- | ---: | ---: | ---: | ---: | ---: |
| 4 / 5 — defaults | 15.46 | 106.15 | 92.17 | 1/4 | 5 ticks |
| 5 / 5 | 14.92 | 107.38 | 104.25 | 4/4 | 2 ticks |
| 4 / 4 | 14.99 | 112.32 | 103.38 | 3/4 | 3 ticks |
| 5 / 4 | 14.09 | 103.36 | 126.09 | 2/4 | 3 ticks |

All 16 pressure fights ended in a death before the 1,000-tick limit. Every configuration used magic, ranged, melee, food, brews, and restores. Different speeds change decision histories, random-number consumption, style choices, and fight lengths, so these are screening results rather than isolated causal estimates. Four fights per setting cannot support a reliable win-rate claim; the expected-damage and win columns should be read together.

The idle measure means the shared attack timer and action lock allowed an attack and the opponent was 1–8 tiles away, but no attack launched that tick. It is a broad opportunity measure, not proof that the currently equipped attack was legal or that waiting was a bad decision. Eating, movement, freeze, protection, and equipment decisions still matter. No cooldown configuration was lost during any of the 24 runs, and every observed Zuriel cast and Rapid Zaryte attack had its configured cooldown.

## Mirror caveat

Eight additional fights used the same neural policy on both sides. Non-completion by 1,000 ticks was 1/2 at 4/5, 2/2 at 5/5, 1/2 at 4/4, and 2/2 at 5/4. Those results do not support a blanket “never stops attacking” claim.

A bounded 150-tick diagnostic reproduced the 5/5 case. By tick 100 the fighters were 11 tiles apart, with expired cooldowns and no freeze or action lock. The measured policy repeatedly chose HOLD plus a direct movement action which the runtime rejected as `source-gated`. This is an out-of-range movement/decision failure in the screening setup, not a timer stuck on five ticks. There was also non-progress at the default speeds.

The standalone screen does not reproduce the viewer's full route-following and disengagement/reset orchestration: it records runtime target-route requests but does not execute the viewer's queued route processing. Consequently the mirror stalls are a limitation and a follow-up signal, not verified new bugs in the playable UI. More occurred with five-tick casting in this tiny sample; their frequency and real-client impact remain unresolved. No forced attacks, movement helpers, or policy changes were introduced to hide them.

## Verification

- `npm run typecheck` passed.
- The expanded `scripts/verify-zuriel-cycle.ts` passed 47 deterministic scenarios: all four Ancient spells, both actor roles, every speed pair, staff-to-crossbow carryover, settings changed during a cooldown, other staves, other bows, and Accurate/Longrange crossbows.
- Playwright verified both selectors, defaults, changing their values, DMM-only visibility, and the menu's rendered placement. Browser console: zero errors and warnings.
- A live browser fight at five-tick casting launched ice barrages at ticks 409, 414, 419, 424, 429, and 434, each recording a five-tick attack timer.
- `git diff --check` passed for the touched source and verifier files. Existing unrelated checkout changes were preserved.

The main screen covered 24 runs and 12,800 combat ticks in about 7 minutes 39 seconds on local CPU. No training or deployment was performed. The script and raw results are in `C:\Kronos\tmp\zuriel-five-tick-20260917\evaluate.mjs` and `evaluation.json`; the short mirror diagnostic is `probe.json` and `trace-5-5-mirror-0.json`. UI evidence is `menu-selected.png` in the same directory.
