import {
  Engine, Scene, Color3, Color4, Vector3, FreeCamera,
  HemisphericLight, DirectionalLight, ShadowGenerator,
  SSAO2RenderingPipeline, DefaultRenderingPipeline,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WORLD_BG, buildWorld, flatMat } from './terrain.js';
import { Bike } from './bike.js';

const BIKE_RED = Color3.FromHexString('#e12b2b');
const BLACK = Color3.FromHexString('#17181a');

const canvas = document.getElementById('c');
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = Color4.FromColor3(WORLD_BG, 1);
scene.fogMode = Scene.FOGMODE_LINEAR;
scene.fogStart = 60;
scene.fogEnd = 240;
scene.fogColor = WORLD_BG;

const camera = new FreeCamera('cam', new Vector3(-156, 3, 4), scene);
camera.fov = 50 * Math.PI / 180;
camera.maxZ = 400;

const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
hemi.intensity = 0.7;
hemi.diffuse = Color3.FromHexString('#fdf3e6');            // warm sky
hemi.groundColor = Color3.FromHexString('#d8cfc2');        // warm bounce
// low dawn sun raking across the coast for long shadows
const sun = new DirectionalLight('sun', new Vector3(-30, -20, -20).normalize(), scene);
sun.position = new Vector3(30, 20, 20);
sun.intensity = 1.4;
sun.diffuse = Color3.FromHexString('#fff0dc');             // golden first light
const shadows = new ShadowGenerator(2048, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = 0.0006;
shadows.normalBias = 0.02;

const { finishX, lighthouse } = buildWorld(scene, shadows);

new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
const pipeline = new DefaultRenderingPipeline('default', false, scene, [camera]);
pipeline.fxaaEnabled = true;

// ---------- input ----------
const input = { throttle: false, brake: false, left: false, right: false };
const KEYMAP = {
  w: 'throttle', arrowup: 'throttle',
  s: 'brake', arrowdown: 'brake', ' ': 'brake',
  a: 'left', arrowleft: 'left',
  d: 'right', arrowright: 'right',
};
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (k) { input[k] = true; e.preventDefault(); }
  if (e.key.toLowerCase() === 'r') resetMission();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (k) input[k] = false;
});

// ---------- bike ----------
const bike = new Bike(scene, shadows);
const mats = {
  body: flatMat(scene, 'blazer', BIKE_RED, 0.25),
  tire: flatMat(scene, 'tire', BLACK, 0.05),
  rider: flatMat(scene, 'rider', BLACK, 0.15),
};
await bike.load(mats);
document.getElementById('loading')?.remove();

// ---------- dawn cycle: the sky rises from pre-dawn dusk to full day.
// p = 0 at the start line, p = 1 when the sun has fully risen (the deadline). ----------
const SUNRISE_SECONDS = 30;   // the sun fully clears the horizon after this long
const DAWN = {
  bg:   [Color3.FromHexString('#c7bfb8'), Color3.FromHexString('#f0ebe4')],
  sun:  [Color3.FromHexString('#ff7a34'), Color3.FromHexString('#fff0dc')],
  sunI: [0.55, 1.45],
  hemiI: [0.4, 0.72],
  fogStart: [30, 60],
  fogEnd: [130, 240],
  // sun direction: grazing on the horizon -> higher in the sky
  dir: [new Vector3(-0.96, -0.12, -0.26).normalize(), new Vector3(-0.55, -0.72, -0.42).normalize()],
};
function lerpC(a, b, t) { return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t); }
function lerpN(a, b, t) { return a + (b - a) * t; }

function updateDawn(p, tSec) {
  const bg = lerpC(DAWN.bg[0], DAWN.bg[1], p);
  scene.clearColor = Color4.FromColor3(bg, 1);
  scene.fogColor = bg;
  scene.fogStart = lerpN(DAWN.fogStart[0], DAWN.fogStart[1], p);
  scene.fogEnd = lerpN(DAWN.fogEnd[0], DAWN.fogEnd[1], p);
  sun.diffuse = lerpC(DAWN.sun[0], DAWN.sun[1], p);
  sun.intensity = lerpN(DAWN.sunI[0], DAWN.sunI[1], p);
  hemi.intensity = lerpN(DAWN.hemiI[0], DAWN.hemiI[1], p);
  const dir = Vector3.Lerp(DAWN.dir[0], DAWN.dir[1], p).normalize();
  sun.direction = dir;
  sun.position.set(bike.x - dir.x * 55, 55, bike.z - dir.z * 55);
  // beacon: bright and pulsing before dawn, fades out as the sun takes over
  const glow = (1 - p) * (0.55 + 0.45 * Math.sin(tSec * 5));
  lighthouse.beacon.material.emissiveColor.copyFromFloats(1 * glow, 0.18 * glow, 0.18 * glow);
}

// ---------- mission title card ----------
function showTitle(title, subtitle) {
  const card = document.createElement('div');
  card.style.cssText = `position:fixed; left:50%; top:34%; transform:translate(-50%,-50%);
    font-family:monospace; text-align:center; z-index:6; pointer-events:none;
    transition:opacity 1s ease; opacity:1;`;
  card.innerHTML = `<div style="font-size:34px;font-weight:600;letter-spacing:0.14em;color:#17181a">${title}</div>
    <div style="font-size:13px;letter-spacing:0.24em;color:#8a8177;margin-top:10px">${subtitle}</div>`;
  document.body.appendChild(card);
  setTimeout(() => { card.style.opacity = '0'; }, 2600);
  setTimeout(() => card.remove(), 3800);
}

// ---------- sunrise progress bar (the diegetic clock) ----------
const sunbar = document.createElement('div');
sunbar.style.cssText = `position:fixed; left:50%; top:20px; transform:translateX(-50%);
  width:min(46vw,360px); z-index:5; font-family:monospace; text-align:center; pointer-events:none;`;
sunbar.innerHTML =
  `<div id="sunlabel" style="font-size:11px;letter-spacing:0.2em;color:#8a8177;margin-bottom:5px">☀ SUNRISE</div>
   <div style="height:5px;background:rgba(23,24,26,0.12);border-radius:3px;overflow:hidden">
     <div id="sunfill" style="height:100%;width:0%;background:#ff8a3d;transition:width 0.1s linear"></div>
   </div>`;
document.body.appendChild(sunbar);
const sunfill = sunbar.querySelector('#sunfill');
const sunlabel = sunbar.querySelector('#sunlabel');

// ---------- mission state ----------
const hud = {
  time: document.getElementById('time'),
  speed: document.getElementById('speed'),
  surface: document.getElementById('surface'),
  gates: document.getElementById('gates'),
  msg: document.getElementById('msg'),
};
// grade on arrival: how much of the dawn was left when you reached the lighthouse
const BEST_KEY = 'nx_alibaug_best';
function medalFor(t) {
  if (t <= 14) return 'GOLD';        // reach it while it's still barely dawn
  if (t <= 20) return 'SILVER';
  if (t < SUNRISE_SECONDS) return 'BRONZE';  // beat the sunrise at all
  return null;                        // sun already up — missed first light
}

let started, finished, t0, finalTime, finalP;

function resetMission() {
  bike.reset();
  started = false;
  finished = false;
  finalTime = 0;
  finalP = 0;
  hud.msg.style.display = 'none';
  camera.position.set(bike.x - 6, 3, bike.z + 4);
  showTitle('FIRST LIGHT', 'REACH THE LIGHTHOUSE BEFORE SUNRISE');
}
resetMission();

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function updateMission(now) {
  if (!started && bike.speed > 0.5) { started = true; t0 = now; }
  const t = started && !finished ? (now - t0) / 1000 : finished ? finalTime : 0;
  const p = finished ? finalP : Math.min(1, t / SUNRISE_SECONDS);

  // drive the sky
  updateDawn(p, now / 1000);

  if (started && !finished && bike.x >= finishX) {
    finished = true;
    finalTime = t;
    finalP = p;
    const medal = medalFor(finalTime);
    const prev = parseFloat(localStorage.getItem(BEST_KEY) || 'Infinity');
    const isBest = medal && finalTime < prev;
    if (isBest) localStorage.setItem(BEST_KEY, finalTime.toFixed(2));
    const best = Math.min(finalTime, prev);
    if (medal) {
      hud.msg.textContent =
        `${medal} — FIRST LIGHT CAUGHT\n${fmt(finalTime)}\n` +
        `best ${fmt(best)}${isBest ? '  ★ new' : ''}\n\nR to ride again`;
    } else {
      hud.msg.textContent =
        `THE SUN'S UP\nyou reached the point in ${fmt(finalTime)},\nbut first light was gone\n\nR to chase it`;
    }
    hud.msg.style.display = 'block';
  }

  // HUD
  hud.time.textContent = fmt(t);
  hud.speed.textContent = `${bike.kmh} km/h`;
  hud.surface.textContent = bike.surface.name + (bike.grounded ? '' : ' · air');
  const dist = Math.max(0, Math.round(finishX - bike.x));
  hud.gates.textContent = finished ? 'lighthouse reached' : `→ lighthouse ${dist} m`;
  // sunrise bar
  sunfill.style.width = `${(p * 100).toFixed(0)}%`;
  if (p >= 1 && !finished) {
    sunfill.style.background = '#ff2e2e';
    sunlabel.textContent = '☀ SUN UP';
    sunlabel.style.color = '#c02020';
  } else {
    sunfill.style.background = '#ff8a3d';
    sunlabel.textContent = '☀ SUNRISE';
    sunlabel.style.color = '#8a8177';
  }
}

// ---------- chase camera: its yaw lags the bike's, so the bike visibly
// banks and rotates into the corner before the camera swings after it ----------
const camTarget = new Vector3(bike.x, 1, bike.z);
let camYaw = 0;
function updateCamera(dt) {
  let d = bike.velHeading - camYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  camYaw += d * Math.min(1, dt * 3.2);
  const fx = Math.cos(camYaw), fz = -Math.sin(camYaw);
  const desired = new Vector3(bike.x - fx * 5.6, bike.y + 2.1, bike.z - fz * 5.6);
  const kPos = 1 - Math.exp(-dt * 6);
  camera.position = Vector3.Lerp(camera.position, desired, kPos);
  const tgt = new Vector3(bike.x + fx * 2.0, bike.y + 1.0, bike.z + fz * 2.0);
  const kTgt = 1 - Math.exp(-dt * 10);
  camTarget.copyFrom(Vector3.Lerp(camTarget, tgt, kTgt));
  camera.setTarget(camTarget);
}

// ---------- fixed-timestep loop ----------
const NO_INPUT = { throttle: false, brake: true, left: false, right: false };
const PHYS_DT = 1 / 120;
let acc = 0;
engine.runRenderLoop(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
  acc += dt;
  while (acc >= PHYS_DT) {
    bike.update(PHYS_DT, finished ? NO_INPUT : input);
    acc -= PHYS_DT;
  }
  updateCamera(dt);
  updateMission(performance.now());
  scene.render();
});
window.addEventListener('resize', () => engine.resize());

window.__nx = { scene, camera, engine, bike, input };
