# AI Runtime Overview

NH Trainer is built around a browser fight runtime and a trained opponent policy.

## Runtime Loop

The fight runs on fixed game ticks. Player inputs are queued, resolved on ticks, and then reflected visually in the client. Combat state, movement, supplies, prayers, equipment, special energy, and cooldowns all flow through the same runtime state so the bot and the player are acting inside one consistent fight model.

## Bot Policy

The opponent policy is loaded from checkpoint files in `fixtures/ai`. The runtime converts the current fight state into a compact observation, scores available actions, and maps the selected action back into concrete gameplay intents.

The main action areas are:

- attack style and target choice
- gear profile changes
- protection prayers
- movement and standing-under decisions
- food and potion usage
- special-attack timing

Difficulty modes are separate checkpoints. A longer-trained checkpoint should apply pressure more consistently, but each mode still uses the same runtime rules and input/output bridge.

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
