import {
  Engine, Scene, Color3, Color4, Vector3, FreeCamera, Quaternion,
  HemisphericLight, DirectionalLight, ShadowGenerator,
  MeshBuilder, StandardMaterial, SceneLoader,
  SSAO2RenderingPipeline, DefaultRenderingPipeline,
  ParticleSystem, DynamicTexture,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { buildLevel, LEG_CREEKS } from './level.js';

const WORLD_BG = Color3.FromHexString('#edeef0');
const BIKE_RED = Color3.FromHexString('#e12b2b');
const BLACK = Color3.FromHexString('#17181a');
const G = 12;
const WHEEL_RADIUS = 0.375;
const WASHOUT = 26;            // m/s (~94 km/h): only a reckless, jump-speed entry washes out;
                              // normal fords are a drag/momentum challenge, not a speed gate

// ---------- engine / scene ----------
// MOBILE = touch-first device → gets on-screen controls and a lighter render tier.
// Desktop is untouched (full shadows + SSAO + native resolution).
const MOBILE = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
  || new URLSearchParams(location.search).has('touch');   // ?touch=1 forces the touch layer (testing / manual preference)
const canvas = document.getElementById('c');
const engine = new Engine(canvas, true);
// cap effective resolution on phones (high-DPI screens are the biggest GPU cost)
if (MOBILE) engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.4));
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = Color4.FromColor3(WORLD_BG, 1);
scene.fogMode = Scene.FOGMODE_LINEAR;
scene.fogStart = LEG_CREEKS.fog.start;
scene.fogEnd = LEG_CREEKS.fog.end;
scene.fogColor = WORLD_BG;

const camera = new FreeCamera('cam', new Vector3(-180, 3, 10), scene);
camera.fov = 47 * Math.PI / 180;
camera.maxZ = 500;

new HemisphericLight('hemi', new Vector3(0, 1, 0), scene).intensity = 0.75;
const sun = new DirectionalLight('sun', new Vector3(-18, -40, -26).normalize(), scene);
sun.position = new Vector3(18, 40, 26);
sun.intensity = 1.35;
const shadows = new ShadowGenerator(MOBILE ? 1024 : 2048, sun);
shadows.usePercentageCloserFiltering = true;
shadows.filteringQuality = MOBILE ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
shadows.bias = 0.0008;
shadows.normalBias = 0.03;
shadows.darkness = 0.28;
sun.shadowMinZ = 1;
sun.shadowMaxZ = 70;

// ---------- gradient sky backdrop (fog-independent horizon) ----------
{
  const skyTex = new DynamicTexture('sky', { width: 8, height: 256 }, scene, false);
  const c = skyTex.getContext();
  const grad = c.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#d6dbe0'); grad.addColorStop(0.62, '#e7e9ec'); grad.addColorStop(1.0, '#f0ece6');
  c.fillStyle = grad; c.fillRect(0, 0, 8, 256); skyTex.update();
  const sky = MeshBuilder.CreatePlane('sky', { width: 1800, height: 560 }, scene);
  sky.position.set(0, 55, -280);
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.emissiveTexture = skyTex; skyMat.disableLighting = true; skyMat.fogEnabled = false;
  sky.material = skyMat; sky.isPickable = false;
}

// ---------- build the leg ----------
const L = buildLevel(scene, shadows, LEG_CREEKS);
const { profile, slopeAt, surfaceAt, waterAt, startX, finishX, spin } = L;

// SSAO + FXAA are desktop-only — on phones they cost too much for too little at this palette
if (!MOBILE) {
  new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
  const pipeline = new DefaultRenderingPipeline('default', false, scene, [camera]);
  pipeline.fxaaEnabled = true;
}

// ---------- bike model ----------
const bikeMats = {
  body: flatMat('bikeBody', BIKE_RED, 0.25),
  tire: flatMat('tire', BLACK, 0.05),
  rider: flatMat('rider', BLACK, 0.15),
};
function flatMat(name, color, spec = 0) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color; m.specularColor = new Color3(spec, spec, spec);
  return m;
}
const meshes = (await SceneLoader.ImportMeshAsync(null, '/', 'rider25.glb', scene)).meshes;
let wheelF = null, wheelR = null, model = null;
for (const m of meshes) {
  if (m.getTotalVertices && m.getTotalVertices() > 0) {
    m.material = /wheel/i.test(m.name) ? bikeMats.tire : /rider/i.test(m.name) ? bikeMats.rider : bikeMats.body;
    m.receiveShadows = true; shadows.addShadowCaster(m);
  }
  if (/wheelF/i.test(m.name)) wheelF = m;
  if (/wheelR/i.test(m.name)) wheelR = m;
  if (m.name === '__root__') model = m;
}
document.getElementById('loading')?.remove();

// ---------- particles: dust + splash ----------
function dotTex(name) {
  const t = new DynamicTexture(name, 64, scene, false);
  const c = t.getContext();
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64); t.update();
  return t;
}
const dust = new ParticleSystem('dust', MOBILE ? 220 : 400, scene);
dust.particleTexture = dotTex('dustTex');
dust.emitter = new Vector3(startX, 0, 0);
dust.minEmitBox = new Vector3(-0.12, 0, -0.12); dust.maxEmitBox = new Vector3(0.12, 0.08, 0.12);
dust.color1 = new Color4(0.72, 0.74, 0.77, 0.75); dust.color2 = new Color4(0.60, 0.62, 0.66, 0.55);
dust.colorDead = new Color4(0.78, 0.80, 0.83, 0);
dust.minSize = 0.18; dust.maxSize = 0.8; dust.minLifeTime = 0.3; dust.maxLifeTime = 0.7;
dust.emitRate = 0; dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;
dust.gravity = new Vector3(0, 1.0, 0);
dust.direction1 = new Vector3(-2.0, 0.5, -0.3); dust.direction2 = new Vector3(-0.6, 1.4, 0.3);
dust.minEmitPower = 0.5; dust.maxEmitPower = 1.6; dust.updateSpeed = 0.02;
dust.start();

const splash = new ParticleSystem('splash', MOBILE ? 320 : 600, scene);
splash.particleTexture = dotTex('splashTex');
splash.emitter = new Vector3(startX, 0, 0);
splash.minEmitBox = new Vector3(-0.4, 0, -0.4); splash.maxEmitBox = new Vector3(0.4, 0.1, 0.4);
// cooler, denser droplets read as water spray against the warm-pale ground
splash.color1 = new Color4(0.78, 0.83, 0.90, 0.95); splash.color2 = new Color4(0.64, 0.70, 0.80, 0.85);
splash.colorDead = new Color4(0.75, 0.80, 0.88, 0);
splash.minSize = 0.28; splash.maxSize = 1.0; splash.minLifeTime = 0.35; splash.maxLifeTime = 0.75;
splash.emitRate = 0; splash.blendMode = ParticleSystem.BLENDMODE_STANDARD;
splash.gravity = new Vector3(0, -7, 0);
splash.direction1 = new Vector3(-1.8, 4, -0.7); splash.direction2 = new Vector3(1.8, 6.5, 0.7);
splash.minEmitPower = 2.2; splash.maxEmitPower = 5.0; splash.updateSpeed = 0.02;
splash.start();
function doSplash(x, y) { splash.emitter.copyFromFloats(x, y + 0.15, 0); splash.manualEmitCount = 160; }

// ---------- bike physics ----------
const bike = {
  x: startX, y: profile(startX), v: 0, vx: 0, vy: 0,
  grounded: true, pitch: 0, wheelAngle: 0, bump: 0, inFord: false,
  reset() {
    this.x = startX; this.y = profile(startX); this.v = 0; this.vx = 0; this.vy = 0;
    this.grounded = true; this.pitch = slopeAt(startX); this.bump = 0; this.inFord = false;
  },
};
bike.reset();

let lastCP = startX;
function respawn(reason) {
  doSplash(bike.x, bike.y);
  bike.x = lastCP; bike.y = profile(lastCP); bike.v = 0; bike.vx = 0; bike.vy = 0;
  bike.grounded = true; bike.pitch = slopeAt(lastCP); bike.bump = 0; bike.inFord = false;
  showFlash(reason, 1100, '#ff2e2e');
}

const JUMP = 5.7;   // m/s: a natural hop (~1.3 m). fast bikes jump FAR, not high — bridges the gap with a forgiving window
function stepBike(dt, input) {
  const surf = surfaceAt(bike.x);
  const wz = waterAt(bike.x);
  // Space hop: launch off the ground, keeping forward momentum (then A/D rotate in air)
  if (jumpRequested && bike.grounded) {
    const s = slopeAt(bike.x), cosA = 1 / Math.sqrt(1 + s * s);
    bike.grounded = false;
    bike.vy = JUMP + Math.max(0, s) * bike.v * 0.3;   // a touch more pop off an up-slope
    bike.vx = bike.v * cosA;
    bike.y += 0.04;
  }
  jumpRequested = false;
  if (bike.grounded) {
    const s = slopeAt(bike.x);
    const cosA = 1 / Math.sqrt(1 + s * s), sinA = s * cosA;
    let a = (input.throttle ? surf.accel : 0) * Math.max(0, 1 - bike.v / surf.top);
    a -= (input.brake ? 13 : 0) * Math.sign(bike.v || 1);
    a -= G * sinA;
    a -= surf.drag * 0.12 * bike.v;
    // low-grip climb traction: steep + slick + slow = wheelspin
    if (s > 0.08 && surf.grip < 0.85) a -= s * (1 - surf.grip) * 7 * (1 - Math.min(1, bike.v / 9));
    bike.v += a * dt;
    if (bike.v < 0 && !input.brake && s < 0.02) bike.v = 0;
    bike.x += bike.v * cosA * dt;

    const gy = profile(bike.x), prevY = bike.y; bike.y = gy;
    if ((prevY - gy) / dt > 6.5 && bike.v > 11 && !(wz && wz.type === 'gap')) {
      // natural launch off crests/edges — capped so it never moon-jumps.
      bike.grounded = false; bike.vx = bike.v * cosA;
      bike.vy = Math.min(4.0, Math.max(bike.v * -sinA * 0.45, 0)) + 0.8;
      bike.y = prevY;
    } else {
      // at a GAP the auto-launch is suppressed — you drive off the flat lip and
      // sink unless you Space-jump at exactly the right moment. Timed jump required.
      bike.pitch += (Math.atan2(s, 1) - bike.pitch) * Math.min(1, dt * 9);
    }
    const bt = (surf.bump > 0 && bike.v > 4) ? surf.bump * Math.sin(bike.x * 4.5) : 0;
    bike.bump += (bt - bike.bump) * Math.min(1, dt * 12);

    if (wz && wz.type === 'ford') {
      if (!bike.inFord) { bike.inFord = true; doSplash(bike.x, wz.waterY); if (bike.v > WASHOUT) { respawn('WASHED OUT'); return; } }
    } else bike.inFord = false;
    if (wz && wz.type === 'gap' && bike.y < wz.waterY) { respawn('DROWNED'); return; }
  } else {
    const rot = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    bike.pitch += rot * 2.6 * dt;
    bike.vy -= G * dt;
    bike.x += bike.vx * dt; bike.y += bike.vy * dt;
    if (wz && bike.y < wz.waterY) { respawn('DROWNED'); return; }
    const gy = profile(bike.x);
    if (bike.y <= gy) {
      bike.y = gy; bike.grounded = true;
      const s = slopeAt(bike.x), sa = Math.atan2(s, 1);
      bike.v = Math.max(0, bike.vx * Math.cos(sa) + bike.vy * Math.sin(sa));
      const mis = Math.abs(bike.pitch - sa), gscrub = 1 - (1 - surf.grip) * 0.3;
      if (mis > 0.55) bike.v *= 0.55 * gscrub; else if (mis > 0.28) bike.v *= 0.85 * gscrub;
      bike.pitch = sa; bike.inFord = false;
    }
  }
  if (bike.x < startX - APPROACH_D - 2) { bike.x = startX - APPROACH_D - 2; bike.v = Math.max(0, bike.v); }
  bike.wheelAngle -= (bike.v / WHEEL_RADIUS) * dt;
}

// ---------- start sequence ----------
// The bike rolls in from far down the track and DECELERATES smoothly, arriving at the start
// line (the gantry, at startX) at exactly CREEP speed the instant the countdown hits GO. Because
// it lands at CREEP and the post-GO wait continues at CREEP, velocity is continuous → no jerk.
const CREEP = 2.6;                     // m/s (~9 km/h) idle roll — the post-GO "creep until throttle" speed
const ROLLIN_T = 3.0;                  // countdown / cinematic roll-in duration (3-2-1)
const APPROACH_D = 32;                 // metres of visible roll-in from the far horizon toward the line
// decel profile solved so distance covered over ROLLIN_T equals APPROACH_D and end speed == CREEP:
const V0 = 2 * APPROACH_D / ROLLIN_T - CREEP;   // ≈18.7 m/s entry speed → eases down to CREEP at GO

// cinematic roll-in: position is a deterministic function of the countdown so it lands on the
// line exactly at GO. Velocity eases (smoothstep) from V0 to CREEP with zero acceleration at GO.
function rollinBike(dt) {
  const p = Math.min(1, Math.max(0, (ROLLIN_T - countT) / ROLLIN_T));   // 0 at "3" → 1 at GO
  const S = p * p * p - 0.5 * p * p * p * p;                            // ∫ smoothstep
  const sm = p * p * (3 - 2 * p);
  bike.x = (startX - APPROACH_D) + ROLLIN_T * (CREEP * p + (V0 - CREEP) * (p - S));
  bike.v = CREEP + (V0 - CREEP) * (1 - sm);
  bike.grounded = true; bike.bump = 0;
  bike.y = profile(bike.x); bike.pitch = slopeAt(bike.x);
  bike.wheelAngle -= (bike.v / WHEEL_RADIUS) * dt;
}

// post-GO wait: constant creep forward until the player throttles (keeps the creep-until-throttle feel)
function creepBike(dt) {
  bike.v = CREEP;
  bike.x += CREEP * dt;
  bike.grounded = true; bike.bump = 0;
  bike.y = profile(bike.x); bike.pitch = slopeAt(bike.x);
  bike.wheelAngle -= (CREEP / WHEEL_RADIUS) * dt;
}

// render sync: the mesh follows an interpolated position so motion stays smooth
// regardless of how many fixed physics steps a given render frame consumed.
function syncModel(x, y, pitch, bump, wheel) {
  model.position.set(x, y + 0.02 + bump, 0);
  model.rotationQuaternion = Quaternion.RotationYawPitchRoll(0, 0, pitch);
  if (wheelF) wheelF.rotation.z = wheel;
  if (wheelR) wheelR.rotation.z = wheel;
}

// ---------- input ----------
const input = { throttle: false, brake: false, left: false, right: false };
let jumpRequested = false;
const KEYMAP = { w: 'throttle', arrowup: 'throttle', s: 'brake', arrowdown: 'brake', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.key.toLowerCase()];
  if (k) { input[k] = true; e.preventDefault(); }   // take-off (stage → racing) is handled in frame() so a held W launches at GO too
  if (e.key === ' ') { jumpRequested = true; e.preventDefault(); }   // Space = hop the bike
  if (e.key.toLowerCase() === 'r') resetMission();
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key.toLowerCase()]; if (k) input[k] = false; });

// ---------- HUD ----------
const hud = {
  time: document.getElementById('time'), speed: document.getElementById('speed'),
  state: document.getElementById('state'), dist: document.getElementById('dist'), msg: document.getElementById('msg'),
};
const hintEl = document.getElementById('hint');
let titleEl = null;
function showTitle(title, subtitle) {
  if (!titleEl) {
    titleEl = document.createElement('div');
    titleEl.style.cssText = `position:fixed;left:50%;top:16px;transform:translateX(-50%);font-family:monospace;text-align:center;z-index:6;pointer-events:none;transition:opacity 0.8s ease;`;
    document.body.appendChild(titleEl);
  }
  titleEl.innerHTML = `<div style="font-size:22px;font-weight:600;letter-spacing:0.14em;color:#17181a">${title}</div><div style="font-size:11px;letter-spacing:0.24em;color:#8a8d92;margin-top:6px">${subtitle}</div>`;
  titleEl.style.opacity = '1';
  clearTimeout(titleEl._t);
  titleEl._t = setTimeout(() => { titleEl.style.opacity = '0'; }, 4200);
}
let flashEl = null;
function showFlash(text, ms, color) {
  if (!flashEl) {
    flashEl = document.createElement('div');
    flashEl.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);font-family:monospace;font-size:18px;font-weight:600;letter-spacing:0.12em;z-index:6;pointer-events:none;';
    document.body.appendChild(flashEl);
  }
  flashEl.textContent = text; flashEl.style.color = color || '#17181a'; flashEl.style.opacity = '1';
  clearTimeout(flashEl._t); flashEl._t = setTimeout(() => { flashEl.style.transition = 'opacity 0.4s'; flashEl.style.opacity = '0'; }, ms);
  flashEl.style.transition = 'none';
}

// "SPACE" prompt shown as you approach the gap lip
const jumpPrompt = document.createElement('div');
jumpPrompt.style.cssText = 'position:fixed;left:50%;top:24%;transform:translateX(-50%);font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.15em;color:#ff2e2e;z-index:6;pointer-events:none;opacity:0;transition:opacity 0.12s;';
jumpPrompt.textContent = '▲ SPACE ▲';
document.body.appendChild(jumpPrompt);
const gapZones = L.waterZones.filter((w) => w.type === 'gap');

// pulsating "W" throttle prompt for the rolling start (hidden once the player throttles)
const pulseStyle = document.createElement('style');
pulseStyle.textContent = '@keyframes nxpulse{0%,100%{opacity:0.45;transform:translateX(-50%) scale(0.94)}50%{opacity:1;transform:translateX(-50%) scale(1.06)}}';
document.head.appendChild(pulseStyle);
const throttlePrompt = document.createElement('div');
throttlePrompt.style.cssText = 'position:fixed;left:50%;top:63%;transform:translateX(-50%);font-family:monospace;font-weight:700;letter-spacing:0.14em;text-align:center;z-index:6;pointer-events:none;opacity:0;';
throttlePrompt.innerHTML = '<div style="font-size:34px">▲ W ▲</div><div style="font-size:14px;letter-spacing:0.26em;margin-top:4px">THROTTLE</div>';
document.body.appendChild(throttlePrompt);

// big 3-2-1-GO start countdown
const bigCount = document.createElement('div');
bigCount.style.cssText = 'position:fixed;left:50%;top:28%;transform:translate(-50%,-50%);font-family:monospace;font-weight:700;font-size:clamp(80px,16vw,180px);line-height:1;color:#17181a;z-index:7;pointer-events:none;';
document.body.appendChild(bigCount);
let lastCount = '';
function setCount(txt) {
  if (txt === lastCount) return;
  lastCount = txt;
  bigCount.textContent = txt;
  bigCount.style.color = txt === 'GO' ? '#ff2e2e' : '#17181a';
  bigCount.animate(
    [{ transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0.15 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }],
    { duration: 260, easing: 'ease-out' });
}

// fade-to-black overlay for the finish outro (sits above the scene/HUD, below the results text)
const blackout = document.createElement('div');
blackout.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:8;pointer-events:none;transition:opacity 0.1s linear;';
document.body.appendChild(blackout);

// ---------- Time Attack mission ----------
const MEDAL = { gold: 22, silver: 24 };   // finish elapsed seconds (clock budget ≈ 26s, so finishing at all is tight)
const BEST_KEY = 'nx_creeks_best';
let started, finished, ended, elapsed, bonusEarned, timeLeft, finalTime, passed, resultShown;
let raceState, finishT, countT;
function resetMission() {
  bike.reset();
  bike.x = startX - APPROACH_D; bike.v = V0;   // spawn far down the track; roll-in decelerates to the line by GO
  lastCP = startX;
  // snap camera + interpolation to the FAR establishing pose the cinematic roll-in tracks in from
  acc = 0; renderX = bike.x; renderY = profile(bike.x);
  camFocusY = profile(bike.x); camRoll = 0;
  camPos.copyFromFloats(bike.x - 0.5, camFocusY + 6, 20);
  started = false; finished = false; ended = false; resultShown = false;
  elapsed = 0; bonusEarned = 0; timeLeft = LEG_CREEKS.timeLimit; finalTime = 0;
  passed = new Set();
  hud.msg.style.display = 'none';
  for (const el of [hud.time, hud.speed, hud.state, hud.dist]) if (el) el.style.display = '';
  if (hintEl) hintEl.style.display = MOBILE ? 'none' : '';   // keep the keyboard hint hidden on touch across restarts
  raceState = 'rollin'; countT = ROLLIN_T; lastCount = ''; jumpRequested = false; finishT = 0;
  bigCount.style.display = 'block'; setCount('3');
  for (const lamp of L.startLamps) lamp.material = L.lampOffMat;
  throttlePrompt.style.opacity = '0'; throttlePrompt.style.animation = 'none';
  blackout.style.opacity = '0';
  showTitle(LEG_CREEKS.name, LEG_CREEKS.subtitle);
}
// initial resetMission() is deferred until after the camera/loop state is declared (see below)

function fmt(t) { const m = Math.floor(Math.max(0, t) / 60), s = Math.max(0, t) - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }
function medalFor(t) { return t <= MEDAL.gold ? 'GOLD' : t <= MEDAL.silver ? 'SILVER' : 'BRONZE'; }

function updateMission(dt) {
  // cinematic countdown roll-in: the bike creeps toward the line while the gantry lights
  // fill 3-2-1 and the camera dollies in; the clock is frozen until GO.
  if (raceState === 'rollin') {
    countT -= dt;
    const lit = countT > 2 ? 1 : countT > 1 ? 2 : countT > 0 ? 3 : 0;   // F1 light gantry fills
    for (let i = 0; i < L.startLamps.length; i++) L.startLamps[i].material = i < lit ? L.lampOnMat : L.lampOffMat;
    if (countT > 2) setCount('3');
    else if (countT > 1) setCount('2');
    else if (countT > 0) setCount('1');
    else {
      // GO: lights out, clock is armed, hand over to the pulsating-W creep (creep-until-throttle)
      raceState = 'stage';
      setCount('GO');
      for (const lamp of L.startLamps) lamp.material = L.lampOffMat;
      setTimeout(() => { bigCount.style.display = 'none'; }, 550);
    }
    hud.time.textContent = fmt(LEG_CREEKS.timeLimit);
    hud.time.style.color = '#17181a';
    hud.dist.textContent = 'get ready';
    hud.speed.textContent = `${Math.round(bike.v * 3.6)} km/h`;
    hud.state.textContent = 'get ready';
    return;
  }

  // clock starts once the bike crosses the start line (at GO, or whenever the creep drifts across)
  if (!started && bike.x >= startX) started = true;

  if (started && !ended) {
    elapsed += dt;
    for (const c of L.checkpoints) {
      if (!passed.has(c.x) && bike.x >= c.x) { passed.add(c.x); lastCP = c.x; bonusEarned += c.bonus; showFlash(`CHECKPOINT  +${c.bonus}s`, 1200, '#17181a'); }
    }
    timeLeft = LEG_CREEKS.timeLimit + bonusEarned - elapsed;
    if (bike.x >= finishX) {
      ended = true; finished = true; finalTime = elapsed; raceState = 'finish'; finishT = 0;
      const prev = parseFloat(localStorage.getItem(BEST_KEY) || 'Infinity');
      const isBest = finalTime < prev; if (isBest) localStorage.setItem(BEST_KEY, finalTime.toFixed(2));
      const medal = medalFor(finalTime);
      hud.msg.textContent = `${medal}   ${fmt(finalTime)}\nbest ${fmt(Math.min(finalTime, prev))}${isBest ? '  ★ new' : ''}\n\nR to ride again`;
    } else if (timeLeft <= 0) {
      ended = true; timeLeft = 0; raceState = 'timeup';
      hud.msg.textContent = `TIME UP\nyou ran out of time\n\nR to retry`;
      hud.msg.style.display = 'block';
    }
  }

  // finish outro: crane out (~2.6s), fade to black (2.6→4.6s), then only the result + restart on black
  if (raceState === 'finish') {
    blackout.style.opacity = String(Math.min(1, Math.max(0, (finishT - 2.6) / 2)));
    if (finishT > 4.6 && !resultShown) {
      resultShown = true;
      for (const el of [hud.time, hud.speed, hud.state, hud.dist, hintEl]) if (el) el.style.display = 'none';
      hud.msg.style.display = 'block';
    }
    return;   // freeze the HUD readout during the outro
  }

  // HUD
  const low = timeLeft < 8 && started;
  hud.time.textContent = fmt(timeLeft);
  hud.time.style.color = raceState === 'timeup' ? '#ff2e2e' : low ? '#ff2e2e' : '#17181a';
  hud.time.style.opacity = low && !ended ? (0.55 + 0.45 * Math.abs(Math.sin(elapsed * 6))) : '1';
  hud.dist.textContent = raceState === 'stage' && !started ? 'go on W' : `elapsed ${elapsed.toFixed(1)}s`;
  hud.speed.textContent = `${Math.round(bike.v * 3.6)} km/h`;
  const sname = Object.entries(surfNames).find(([, s]) => s === surfaceAt(bike.x))?.[0];
  hud.state.textContent = raceState === 'stage' ? 'get ready' : (bike.grounded ? (waterAt(bike.x) ? 'water' : (sname || 'road')) : 'air');
}
import { SURFACES } from './level.js';
const surfNames = SURFACES;

// ---------- camera (Trials-style) ----------
const camPos = new Vector3(startX - 0.5, 3, 10);
let camRoll = 0, camFocusY = profile(startX);
function updateCamera(dt) {
  if (raceState === 'rollin') {
    // cinematic roll-in: the camera TRACKS the bike as it comes in from the far horizon, from a
    // pulled-back/high vista that tightens down to EXACTLY the chase rest pose by GO — so when
    // control hands over (and later when W is pressed) there is no camera jump whatsoever.
    const p = Math.min(1, Math.max(0, (ROLLIN_T - countT) / ROLLIN_T));   // 0 at "3" → 1 at GO
    const e = p * p * (3 - 2 * p);
    // rest pose == the racing chase pose at CREEP speed (s01 = CREEP/32) so the handoff is exact
    const dist = 20 - (20 - 9.74375) * e;        // 20 (far) → 9.744 (chase rest)
    const height = 6 - (6 - 2.34063) * e;        // 6 (high) → 2.341
    const lookAhead = 4 - (4 - 2.01125) * e;     // 4 (look toward the incoming gantry) → 2.011
    const gy = profile(renderX);
    camFocusY = gy; camRoll = 0;
    camPos.copyFromFloats(renderX - 0.5, gy + height, dist);   // direct track (no lag) — keeps camPos in sync for 'stage'
    camera.position.copyFrom(camPos);
    camera.setTarget(new Vector3(renderX + lookAhead, gy + 0.9, 0));
    camera.rotation.z = 0;
    camera.fov = (50 - (50 - 47.40625) * e) * Math.PI / 180;   // slightly wider vista → 47.41 rest
    return;
  }
  if (raceState === 'finish') {
    // outro: keep the bike framed (tight x-follow) while the view cranes up & back — it shrinks into the vista
    const t = Math.min(1, finishT / 4.6), e = t * t * (3 - 2 * t);
    const gy = Math.max(renderY, profile(renderX));
    camFocusY += (gy - camFocusY) * Math.min(1, dt * 4);
    const dist = 9.5 + 23 * e, height = 2.3 + 7 * e, lead = 2 + 10 * e;
    camPos.x += ((renderX - 2) - camPos.x) * (1 - Math.exp(-dt * 7));    // tight — bike stays in frame
    camPos.y += ((camFocusY + height) - camPos.y) * (1 - Math.exp(-dt * 3));
    camPos.z += (dist - camPos.z) * (1 - Math.exp(-dt * 3));
    camera.position.copyFrom(camPos);
    camera.setTarget(new Vector3(renderX + lead, camFocusY + 1, 0));
    camera.rotation.z = 0;
    camera.fov = (47 + 7 * e) * Math.PI / 180;
    return;
  }
  // chase. During staging the anchor is pinned at the start line until the bike reaches it,
  // so the bike creeps IN from the left edge and the handoff to the moving chase is seamless
  // (anchor === renderX the instant it crosses, so nothing jumps when W is pressed).
  const anchorX = raceState === 'stage' ? Math.max(startX, renderX) : renderX;
  const s01 = Math.min(1, bike.v / 32);
  const dist = 9.5 + s01 * 3, height = 2.3 + s01 * 0.5;
  const focusTarget = Math.max(renderY, profile(anchorX));
  camFocusY += (focusTarget - camFocusY) * Math.min(1, dt * 6);
  camPos.copyFrom(Vector3.Lerp(camPos, new Vector3(anchorX - 0.5, camFocusY + height, dist), 1 - Math.exp(-dt * 6)));
  camera.position.copyFrom(camPos);
  const lookAhead = 1.8 + s01 * 2.6;
  camera.setTarget(new Vector3(anchorX + lookAhead, camFocusY + 0.9, 0));
  const airRoll = bike.grounded ? 0 : Math.max(-0.13, Math.min(0.13, -bike.vy * 0.008));
  camRoll += ((-bike.pitch * 0.16 + airRoll) - camRoll) * (1 - Math.exp(-dt * 3.5));
  camera.rotation.z = camRoll;
  camera.fov = (47 + s01 * 5) * Math.PI / 180;
}

scene.onBeforeRenderObservable.add(() => sun.position.set(renderX + 18, 40, 26));

// ---------- loop ----------
const NO_INPUT = { throttle: false, brake: true, left: false, right: false };
const FULL = { throttle: true, brake: false, left: false, right: false };     // finish outro: auto-ride off
const PHYS_DT = 1 / 120;
let acc = 0;
let renderX = startX - APPROACH_D, renderY = 0;    // interpolated render position (mesh + camera track this)
function frame(dt) {
  updateMission(dt);                                // advance countdown / race state / HUD first
  if (raceState === 'stage' && input.throttle) raceState = 'racing';   // hit or hold W → take off (works through GO)
  if (raceState === 'finish') finishT += dt;
  const racing = raceState === 'racing';            // player has control
  const riding = racing || raceState === 'finish';  // bike moving under power (fx active)
  if (raceState === 'rollin' || raceState === 'stage') {
    if (raceState === 'rollin') rollinBike(dt);     // decelerating cinematic roll-in from the far horizon
    else creepBike(dt);                             // post-GO constant creep until the player throttles
    renderX = bike.x; renderY = bike.y;
    syncModel(bike.x, bike.y, bike.pitch, 0, bike.wheelAngle);
  } else {
    if (!racing) jumpRequested = false;             // no hopping after the end
    const drive = raceState === 'finish' ? FULL : racing ? input : NO_INPUT;
    acc += dt;
    // fixed-timestep integration with render interpolation: the mesh is drawn between the
    // last two physics states by the leftover-accumulator fraction, so it never stutters
    // when a frame runs 2 vs 3 substeps.
    let pX = bike.x, pY = bike.y, pP = bike.pitch, pB = bike.bump, pW = bike.wheelAngle, stepped = false;
    while (acc >= PHYS_DT) {
      pX = bike.x; pY = bike.y; pP = bike.pitch; pB = bike.bump; pW = bike.wheelAngle;
      stepBike(PHYS_DT, drive);
      acc -= PHYS_DT;
      stepped = true;
    }
    let rX = bike.x, rY = bike.y, rP = bike.pitch, rB = bike.bump, rW = bike.wheelAngle;
    if (stepped && Math.abs(bike.x - pX) < 3) {      // skip interp on respawn teleports
      const a = acc / PHYS_DT;
      rX = pX + (bike.x - pX) * a; rY = pY + (bike.y - pY) * a;
      rP = pP + (bike.pitch - pP) * a; rB = pB + (bike.bump - pB) * a; rW = pW + (bike.wheelAngle - pW) * a;
    }
    renderX = rX; renderY = rY;
    syncModel(rX, rY, rP, rB, rW);
  }
  for (const h of spin) h.rotation.z += dt * 0.55;
  const surf = surfaceAt(bike.x);
  const loose = surf.bump > 0.02 || surf.drag > 1 || surf.grip < 0.75 ? 1 : 0.25;
  dust.emitter.copyFromFloats(bike.x - 0.45, bike.y + 0.12, 0);
  dust.emitRate = (riding && bike.grounded && bike.v > 4 && !bike.inFord) ? Math.min(220, bike.v * 9 * loose) : 0;
  const wzs = waterAt(bike.x);
  if (riding && wzs && wzs.type === 'ford' && bike.grounded && bike.v > 2) {
    splash.emitter.copyFromFloats(bike.x + 0.35, wzs.waterY + 0.1, 0);
    splash.emitRate = Math.min(340, bike.v * 22);
  } else {
    splash.emitRate = 0;
  }
  speedLines.style.opacity = riding ? String(Math.max(0, Math.min(0.26, (bike.v - 11) / 20))) : '0';
  let nearGap = false;
  for (const gp of gapZones) if (bike.x > gp.x0 - 9 && bike.x < gp.x0 + 1 && bike.grounded) nearGap = true;
  jumpPrompt.style.opacity = (racing && nearGap) ? '1' : '0';
  // pulsating "W" throttle prompt: flashes through the whole post-GO creep until the player takes off
  const showW = raceState === 'stage';
  if (showW) {
    if (throttlePrompt.style.animation === 'none' || !throttlePrompt.style.animation) {
      throttlePrompt.style.animation = 'nxpulse 0.7s ease-in-out infinite';
    }
    throttlePrompt.style.opacity = '1';
    throttlePrompt.style.color = '#ff2e2e';   // hero red — the one call to action
  } else {
    throttlePrompt.style.opacity = '0';
    throttlePrompt.style.animation = 'none';
  }
  updateCamera(dt);
  scene.render();
}
resetMission();   // now that camPos / renderX / acc are declared, arm the opening state
engine.runRenderLoop(() => frame(Math.min(engine.getDeltaTime() / 1000, 0.05)));
window.addEventListener('resize', () => engine.resize());

// ---------- speed lines ----------
const speedLines = document.createElement('div');
speedLines.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity 0.15s linear;';
const slStyle = document.createElement('style');
slStyle.textContent = '@keyframes nxstreak{from{transform:translateX(72vw)}to{transform:translateX(-104vw)}}';
document.head.appendChild(slStyle);
for (let i = 0; i < 8; i++) {
  const ln = document.createElement('div');
  const top = i % 2 === 0 ? (5 + Math.random() * 22) : (74 + Math.random() * 20);
  ln.style.cssText = `position:absolute;top:${top}%;left:0;width:${14 + Math.random() * 16}%;height:${1 + Math.round(Math.random())}px;background:linear-gradient(90deg,rgba(120,128,140,0.7),rgba(120,128,140,0));animation:nxstreak ${0.4 + Math.random() * 0.4}s linear infinite;animation-delay:${-Math.random()}s;`;
  speedLines.appendChild(ln);
}
document.body.appendChild(speedLines);

window.__nx = {
  scene, camera, engine, bike, input, L,
  advance: (sec) => { const n = Math.round(sec / PHYS_DT); for (let i = 0; i < n; i++) frame(PHYS_DT); },
  state: () => ({ elapsed, timeLeft, bonusEarned, finished, ended, x: bike.x }),
};

// ---------- touch controls (mobile) — drive the SAME input object / flags as the keyboard ----------
// Placed at the end so every referenced binding (hud, input, jumpRequested, resetMission, ended) exists.
// Minimal layout: JUMP (left) · THROTTLE/GAS (right) · ⟳ restart (bottom-center).
// Pointer events → multi-touch (gas + jump) works; mouse still fine on hybrid devices.
if (MOBILE) {
  const style = document.createElement('style');
  style.textContent = `
    #touch { position:fixed; inset:0; z-index:7; pointer-events:none;
      font-family:monospace; touch-action:none; user-select:none; -webkit-user-select:none; }
    #touch .btn { position:absolute; pointer-events:auto; touch-action:none;
      display:flex; align-items:center; justify-content:center; text-align:center; line-height:1;
      border-radius:50%; border:2px solid rgba(23,24,26,0.5); background:rgba(237,238,240,0.32);
      color:#17181a; font-weight:700; letter-spacing:0.06em; backdrop-filter:blur(2px);
      transition:transform 0.06s, background 0.06s; }
    #touch .btn.pressed { transform:scale(0.92); background:rgba(23,24,26,0.22); }
    #touch .lg { width:19vmin; height:19vmin; font-size:4.4vmin; }
    #touch .go  { border-color:#ff2e2e; color:#ff2e2e; }   /* throttle = the hero call-to-action */
    #touch #tThrottle { right:calc(env(safe-area-inset-right,0px) + 4vmin); bottom:9vmin; }
    #touch #tJump     { left:calc(env(safe-area-inset-left,0px) + 4vmin);  bottom:9vmin; }
    #touch #tRestart  { bottom:calc(env(safe-area-inset-bottom,0px) + 3vmin); left:calc(50% - 4.5vmin);
      width:9vmin; height:9vmin; font-size:5vmin; }
    /* the ⟳ glyph carries its own top-heavy metrics — nudge it to sit dead-centre in the circle */
    #touch #tRestart span { display:block; line-height:1; transform:translateY(-2%); }`;
  document.head.appendChild(style);

  const pad = document.createElement('div');
  pad.id = 'touch';
  pad.innerHTML =
    `<div class="btn lg go" id="tThrottle">W<br>GAS</div>
     <div class="btn lg" id="tJump">JUMP</div>
     <div class="btn" id="tRestart"><span>&#8635;</span></div>`;
  document.body.appendChild(pad);

  const hold = (id, on, off) => {
    const el = pad.querySelector(id);
    const down = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('pressed'); on(); };
    const up = (e) => { e.preventDefault(); el.classList.remove('pressed'); off(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  hold('#tThrottle', () => { input.throttle = true; }, () => { input.throttle = false; });
  hold('#tJump', () => { jumpRequested = true; }, () => {});
  pad.querySelector('#tRestart').addEventListener('pointerdown', (e) => { e.preventDefault(); resetMission(); });
  // tapping the results card also restarts on touch; hide the keyboard hint too
  hud.msg.style.pointerEvents = 'auto';
  hud.msg.addEventListener('pointerdown', (e) => { if (ended) { e.preventDefault(); resetMission(); } });
  if (hintEl) hintEl.style.display = 'none';
}
