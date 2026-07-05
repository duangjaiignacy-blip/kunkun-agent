# Lumo IP Switch Design

## Goal

Add Lumo as a first-class selectable mascot in the existing kunkun desktop app while preserving Rocky as the default option.

## Scope

- Add a persistent local preference for the active IP: `tiger` or `lizard`.
- Add an IP selector to the existing settings drawer.
- Make the real Tauri pet window and panel window read the same preference.
- Broadcast IP changes across windows using the existing `bus` channel.
- Apply Lumo's existing `theme-lizard`, assets, copy, and tool poses when selected.

## Non-Goals

- Do not create a second standalone app.
- Do not change the Python agent protocol or backend model behavior.
- Do not generate new Lumo poses in this pass.
- Do not remove Rocky.

## Architecture

Create `app/src/lib/ipPreference.js` as the single boundary for reading, writing, normalizing, and broadcasting the active IP. `PanelWindow` owns the selected IP state for the panel and passes a change handler into `ChatLive`. `PetWindow` owns the selected IP state for the pet and listens to cross-window bus events.

The selected IP key maps to `IP_CONFIG[key]`. Existing components already accept `ipc`, so most behavior remains unchanged once windows pass the selected config instead of hard-coded `IP_CONFIG.tiger`.

## UX

The settings drawer gets a "形象" segmented control with Rocky and Lumo. When the user switches to Lumo, the panel immediately changes copy, colors, avatar, empty state, tool cards, and composer copy. The desktop pet receives the same event and changes to Lumo without restarting.

## Verification

- `npm run build`
- `cargo check --locked`
- `python3 -m unittest tests/test_regressions.py`
- Browser/Tauri visual check of the settings switch
