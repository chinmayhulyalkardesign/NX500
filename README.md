# NX500 — Pass Attack

A browser-based 2.5D Trials / hill-climb time-attack game built around a Honda NX500, in a strict
**Superhot** art style (pale monochrome world; red reserved only for the hero bike, hazards,
checkpoints, the finish, and a low-time clock). The narrative arc runs **Pune → Konkan coast → Goa**;
the first built leg is **"Creeks & Backwaters"** — water crossings, fords, a gap jump, and checkpoints,
all against a countdown clock.

Built with **Babylon.js** + **Vite**.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL — the **2.5D game is the root page**. (The earlier 3D prototype is at `/prototype.html`.)

## Controls

| Key | Action |
| --- | --- |
| **W** | throttle |
| **S** | brake |
| **Space** | jump / hop |
| **A / D** | rotate in the air |
| **R** | restart |

**On mobile / touch devices** the game auto-switches to on-screen controls (rotate to landscape): a red
**GAS** button and **BRK** on the right, **JUMP** + lean **◀ ▶** on the left, and a **⟳** restart. It also
drops to a lighter render tier (reduced resolution, no SSAO, smaller shadows) to hold framerate. Append
`?touch=1` to the URL to force the touch layer on any device.

The bike rolls in from the far horizon during a 3-2-1 countdown and reaches the start line exactly at
**GO**; after GO it creeps forward with a pulsating **W** prompt until you throttle. Each level is a
**Time Attack** — beat the clock, grab checkpoint time bonuses, and clear the water gaps.

## Layout

- `index.html` + `src/game25/` — the 2.5D Pass Attack game, served at the root (`main25.js` = state
  machine, physics, camera, HUD; `level.js` = data-driven level geometry, surfaces, and props)
- `prototype.html` + `src/game/` — an earlier 3D expedition prototype ("First Light, Alibaug")
- `public/` — runtime assets (`.glb` models)
- `tools/` — mesh conversion / preprocessing scripts

## Attribution

See `ATTRIBUTION_CC-BY-4.0.txt` for model attribution.
