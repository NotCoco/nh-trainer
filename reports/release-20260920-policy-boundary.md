# September 20 release: preserve the live NH and DMM decisions

The release baseline is the production deployment, not the older local
`riskfighting` HEAD (`3d886cc`). Vercel reports that `nh-train.com` serves
`b1518c6e91c93b9da64f746690b5c7d154680309` through CLI deployment
`dpl_CwYyuzU37idE3EW76rec1G2bFX8h`. The project has no connected Git repository;
pushing either branch alone does not deploy it.

The production index and runtime JavaScript matched the retained September 18
build byte for byte. That bundle already contains the NH legacy decoder, reward
input normalization, movement behavior, and DMM loadout synchronization present
in this checkout. Reverting those changes to `3d886cc` would change live behavior.

## Decision preservation

- NH stake: the same 90-input model and `nh-deployed-legacy` decoder.
- DMM: the same 114-input model and `current-action-vector` decoder.
- The policy, conditioned policy, action/feature contracts, runtime opponent,
  duel, and setup preset sources match the production baseline.
- A deterministic comparison against the September 18 source produced identical
  actions and complete rankings for 16 NH contexts and 12 DMM contexts, including
  distance, freeze, and attack-cooldown variations, with exploration off.
- The final scrubbed build's NH chunks, DMM model, and test model match the live
  assets byte for byte. Source model metadata differs from public files only
  through the existing build scrub; compare the public artifacts directly.

| Public asset | SHA-256, unchanged from production |
| --- | --- |
| `nh-neural-policy-hard.json.part-001` | `9f36b19455b6c224b8e022b2fee8f2aef4fa7e2645a141fea756195ec01147f0` |
| `nh-neural-policy-hard.json.part-002` | `566f0cf95880818430a724ebb150f54cfa902577c7a8a7147485ec7efae37e75` |
| `nh-neural-policy-hard.json.part-003` | `cb7fb5fbed25750f8241fe32cd62c14cf45655941ed2bf8556fe3ef08f7fef67` |
| `nh-neural-policy-dmm-current.json` | `e7668f5cb49d5c4af1da030bd11c78dbc00685025a8e19b32a96eb07e191aab0` |
| `nh-neural-policy-test.json` | `f2f06c5e29e19335b1e152286332aef0e7e7723d4413b329afc35fe20da66dea` |

## Release scope and validation

The new gameplay changes are the approved Risk Fight v4 model, travelling
projectile rendering, randomized starting PID, and the clickable mirrored PID
indicator. The September 20 update card describes these changes. Existing main
branch metadata, redirects, and other deployed site assets are retained.

Risk Fight parameter SHA-256:
`3947c914e100e45e52a7dc31c4bef129c9bf91310a365c2e4a2140f4ab438da2`.
Checkpoint SHA-256:
`dc0a51df97ba0cd7dc7990716036d06c40bd7e050c8053c3605ca84444ad9acf`.
The existing September 20 requalification report covers 768 fights, with a
72.66% win rate against the previous live model (69.4–75.8% interval). Its
gameplay source hashes still match after release integration; no training or
requalification was repeated for this release.

The integrated `npm run build:web` passed, including TypeScript and public-build
scrubbing (377 files). The supplied passing projectile, PID, and Risk Fight
verification results were retained. The two reported pre-existing failures were
not fixed or rerun: the DMM Masori assertion in `verify-runtime-player-combat.mjs`
and missing gfx 1574 mesh coverage in `verify-spotanim-animation.mjs`.
