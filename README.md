# NH Trainer

Browser-based NH practice with a trained AI opponent.

## What It Is

NH Trainer gives players a private practice partner for NH fights. The opponent is a trained policy, not a scripted rotation: it reacts to the fight state and chooses gear, prayers, movement, supplies, attacks, and special attacks through the same game loop the player uses.

The project is still a work in progress. The goal is to make useful NH practice available in the browser while continuing to improve the bot, the fight flow, and the client feel.

## AI Opponent

- The bot is trained through self-play on mirror NH fights.
- It observes fight state such as position, freeze timers, attack cooldowns, prayers, equipment, supplies, health, special energy, and recent combat events.
- It outputs gameplay intents for gear changes, protection prayers, movement, attacks, eating, drinking, and special-attack timing.
- Difficulty modes are model checkpoints. Easy is an earlier checkpoint, Medium is the main stable checkpoint, and Hard is trained longer for stronger pressure and cleaner decision making.
- The bot is not meant to be omniscient. It should act from the information available in the fight state, with reaction timing kept fair for practice.

## Player Settings

The browser stores local profile settings such as client size, F-key mappings, inventory setup, equipment setup, attack styles, auto-retaliate, XP-drop settings, and selected difficulty. Different visitors keep their own settings in their own browser storage.

## Running Locally

```powershell
npm install
npm run dev
```

For a production web build:

```powershell
npm run build:web
npm run preview
```

## Deployment

The project is set up for Vercel. The deployment config builds the static web client from `dist`.

```powershell
npm run build:web
```

## License

The project code is available under the MIT License. This license does not apply to third-party game assets, cache-derived assets, trademarks, or other material that the project may reference for compatibility.

## Current Focus

- Keep the fight loop responsive and tick-accurate.
- Improve the trained opponent across the Easy, Medium, and Hard checkpoints.
- Add useful post-fight feedback without turning the client into a workbench.
- Keep browser settings stable across updates.
