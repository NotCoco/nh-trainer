# AI Runtime Overview

NH Trainer is built around a browser fight runtime and a trained opponent policy.

## Runtime Loop

The fight runs on fixed game ticks. Player inputs are queued, resolved on ticks, and then reflected visually in the client. Combat state, movement, supplies, prayers, equipment, special energy, and cooldowns all flow through the same runtime state so the bot and the player are acting inside one consistent fight model.

## Bot Policy

The opponent policy is loaded from checkpoint files in `fixtures/ai`. The runtime converts the current fight state into a compact observation, scores available actions, and maps the selected action back into concrete gameplay intents.

The main action areas are:

- attack style and target choice
- gear choices, either through the deployed-composite controller for the rollback/playable DMM hard artifact or through direct item/slot labels for current v5 DMM training
- protection prayers
- movement and standing-under decisions
- food and potion usage
- special-attack timing

Hard setup variants are separate checkpoints/fixtures. A longer-trained checkpoint should apply pressure more consistently, but each variant still has to use the runtime rules and input/output bridge it was trained for. Do not silently adapt one model surface into another.

The DMM deployed-composite hard path is the 92-input, 21,906-action browser-deployed model surface. Java practice should load that model with `dmm_deployed_composite` decode, exploration off, and fallback disabled. Its schema is the routing contract: explicit `schema.actionIds`, all mapped actions inside the deployed legacy action range, the deployed DMM inventory surface, generic deployed special intents, and no current direct-action fallback.

The deployed-composite Java verifier/probe should be used for controller repairs. The static verifier decodes every mapped action ID against the browser decoder and checks the DMM inventory/spec/trinket surface plus fail-closed model loading. The probe is intentionally stronger than a startup check: it requires a live deployed-hard autoduel with real decisions, prayer changes, attack requests, style and weapon variety, runtime facing-target checks, a delayed-prayer sample that ignores same-tick live threat, and no feature-input outliers or stale controller markers against the model's trained surface.

Current/new DMM training is the same-tick action-vector path. Those models must carry explicit `schema.actionIds` for the current bridge, including combat/spec, prayer, supply, movement, and direct item/slot gear actions. The combat/spec/defence/movement/supply channel labels use dedicated non-overlapping action IDs after the direct-gear action range. They should fail closed if the schema does not match instead of falling back to older compact controllers.

Training rollouts are one row per decision/tick. Current version-8 `.nhrl` rows carry one same-tick action-label vector so GPU training can learn multiple item equips/unequips on a single real tick without adding fake transition rows. Version 8 also carries the exact Java delayed-visible threat defence target for observed-threat prayer training/probes.

## Local Profile

The trainer uses browser-local profile storage for player preferences and setup data. This keeps each visitor's settings separate without requiring accounts.

Stored profile data includes:

- client size and position
- F-key mappings and key remapping
- inventory and equipment setup
- attack styles
- auto-retaliate
- XP-drop settings
- selected bot difficulty

## Project Layout

- `src/sim`: game tick state, movement, combat, supplies, prayers, equipment, and NH duel logic.
- `src/sim/nh`: policy observations, action mapping, gear profiles, and duel helpers.
- `src/bot`: policy loading and scoring.
- `src/ui`: browser client, fight controls, overlays, and local profile UI.
- `fixtures/ai`: trained policy checkpoints used by the browser build.
- `fixtures/assets`: item, equipment, animation, sprite, and model data used by the runtime.

## Development Notes

Public-facing work should describe the trainer and the AI clearly. Internal implementation notes should stay out of the README unless they help a player or contributor understand the bot, the fight runtime, or deployment.
