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

Then open the printed local URL and go to **`/side.html`** for the 2.5D game.

## Controls

| Key | Action |
| --- | --- |
| **W** | throttle |
| **S** | brake |
| **Space** | jump / hop |
| **A / D** | rotate in the air |
| **R** | restart |

The bike rolls in from the far horizon during a 3-2-1 countdown and reaches the start line exactly at
**GO**; after GO it creeps forward with a pulsating **W** prompt until you throttle. Each level is a
**Time Attack** — beat the clock, grab checkpoint time bonuses, and clear the water gaps.

## Layout

- `side.html` + `src/game25/` — the 2.5D Pass Attack game (`main25.js` = state machine, physics,
  camera, HUD; `level.js` = data-driven level geometry, surfaces, and props)
- `index.html` + `src/game/` — an earlier 3D expedition prototype ("First Light, Alibaug")
- `public/` — runtime assets (`.glb` models)
- `tools/` — mesh conversion / preprocessing scripts

## Attribution

See `ATTRIBUTION_CC-BY-4.0.txt` for model attribution.
