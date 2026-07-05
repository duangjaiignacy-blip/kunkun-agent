# Lumo IP Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Rocky/Lumo selector to the existing app settings and synchronize it between the panel and desktop pet windows.

**Architecture:** Introduce a small `ipPreference` module that wraps localStorage and the existing cross-window bus. Replace the hard-coded `IP_CONFIG.tiger` in real Tauri windows with selected `IP_CONFIG[ipKey]`. Keep backend protocol unchanged.

**Tech Stack:** React, Tauri, localStorage, existing BroadcastChannel/Tauri event bus, Vite build, Cargo check, Python unittest.

---

### Task 1: Preference Boundary

**Files:**
- Create: `app/src/lib/ipPreference.js`

- [ ] Create `normalizeIpKey`, `getPreferredIpKey`, `setPreferredIpKey`, and `listenPreferredIp`.
- [ ] Use `localStorage` key `kunkun-ip-key`.
- [ ] Broadcast changes with `busEmit({ ip: key })`.
- [ ] Treat invalid values as `tiger`.

### Task 2: Window Wiring

**Files:**
- Modify: `app/src/windows/PetWindow.jsx`
- Modify: `app/src/windows/PanelWindow.jsx`

- [ ] Initialize each window from `getPreferredIpKey()`.
- [ ] Listen for `ip` events from the bus.
- [ ] Pass selected `IP_CONFIG[ipKey]` into `DeskPet` and `ChatLive`.
- [ ] Add `ipc.theme` to the real window wrapper so token overrides apply.

### Task 3: Settings Selector

**Files:**
- Modify: `app/src/components/ChatLive.jsx`
- Modify: `app/src/theme/app.css`

- [ ] Add `ipKey` and `onIpChange` props to `ChatLive`.
- [ ] Add a "形象" setting row with Rocky and Lumo segmented buttons.
- [ ] Replace hard-coded "Rocky" UI copy with `ipc.name`.
- [ ] Add Lumo-specific theme polish for the workbench layout.

### Task 4: Verification and Packaging

**Files:**
- Verify only unless build output changes.

- [ ] Run `npm run build` in `app`.
- [ ] Run `cargo check --locked` in `app/src-tauri`.
- [ ] Run `python3 -m unittest tests/test_regressions.py`.
- [ ] Rebuild and reinstall `/Applications/kunkun.app` if all checks pass.
