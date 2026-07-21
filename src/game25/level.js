import {
  Color3, Vector3, MeshBuilder, StandardMaterial, VertexBuffer, TransformNode,
  Matrix, Quaternion,
} from '@babylonjs/core';

// ---------- Superhot monochrome palette (no hue; red only for hero/hazard/goal) ----------
const GROUND = Color3.FromHexString('#d5d8db');
const WATER = Color3.FromHexString('#b7bcc2');
const ROCK = Color3.FromHexString('#cfd2d6');
const HILL = [Color3.FromHexString('#c3c8ce'), Color3.FromHexString('#d3d7db'), Color3.FromHexString('#e1e4e6')];
const TREE = Color3.FromHexString('#c3c8cd');
const POLE = Color3.FromHexString('#c8ccd1');
const FG = Color3.FromHexString('#b7bcc3');
const WOOD = Color3.FromHexString('#bdbfc2');
const BLACK = Color3.FromHexString('#17181a');
const RED = Color3.FromHexString('#ff2e2e');

// ---------- surface types: grip (climb/landing), drag (momentum sap), bump (chatter), accel, top ----------
export const SURFACES = {
  tarmac: { grip: 1.0, drag: 0.35, bump: 0.0, accel: 7.5, top: 38, shade: 1.0 },
  gravel: { grip: 0.72, drag: 0.7, bump: 0.045, accel: 6.6, top: 34, shade: 0.95 },
  broken: { grip: 0.85, drag: 0.6, bump: 0.11, accel: 7.0, top: 34, shade: 0.92 },
  sand: { grip: 0.55, drag: 1.7, bump: 0.02, accel: 5.4, top: 27, shade: 1.03 },
  mud: { grip: 0.42, drag: 1.25, bump: 0.03, accel: 5.0, top: 25, shade: 0.86 },
  wood: { grip: 0.9, drag: 0.4, bump: 0.02, accel: 7.2, top: 36, shade: 0.9 },
  water: { grip: 0.5, drag: 4.0, bump: 0.0, accel: 3.0, top: 22, shade: 0.8 },
};

// ---------- the water-crossing leg (Konkan creeks & backwaters) ----------
export const LEG_CREEKS = {
  name: 'CREEKS & BACKWATERS',
  subtitle: 'KONKAN COAST · TIME ATTACK',
  timeLimit: 17,          // starting countdown (seconds) — very tight; checkpoints add only +3
  fog: { start: 95, end: 340 },
  segments: [
    { type: 'flat', len: 22, surface: 'tarmac' },        // start pad / run-up
    { type: 'rollers', len: 34, surface: 'gravel', amp: 0.7 },
    { type: 'climb', len: 20, surface: 'gravel', rise: 2.4 },
    { type: 'descent', len: 20, surface: 'gravel', drop: 3.4 },   // down to the creek
    { type: 'ford', len: 15, dip: 0.5 },                 // shallow creek — carry momentum to climb out
    { type: 'checkpoint', bonus: 3 },
    { type: 'climb', len: 24, surface: 'gravel', rise: 3.8 },     // the climb-out (the momentum puzzle)
    { type: 'flat', len: 16, surface: 'tarmac' },
    { type: 'rollers', len: 26, surface: 'sand', amp: 0.6 },      // beach sand — drag
    { type: 'flat', len: 18, surface: 'gravel' },                 // gravel run-up (flat lip — no ramp)
    { type: 'gap', len: 12, pit: 3.4 },                  // THE gap — smaller & more forgiving; Space-jump at the red line
    { type: 'checkpoint', bonus: 3 },                   // landing zone
    { type: 'flat', len: 16, surface: 'gravel' },
    { type: 'flat', len: 22, surface: 'gravel' },        // gravel road (was the plank bridge)
    { type: 'climb', len: 18, surface: 'gravel', rise: 2.8 },
    { type: 'descent', len: 16, surface: 'broken', drop: 2.4 },   // broken road down
    { type: 'ford', len: 13, dip: 0.45 },                // second creek
    { type: 'checkpoint', bonus: 3 },
    { type: 'climb', len: 20, surface: 'gravel', rise: 3.0 },
    { type: 'flat', len: 28, surface: 'tarmac' },        // run to the line
    { type: 'finish' },
  ],
};

const DX = 0.5;
function smooth(t) { return t * t * (3 - 2 * t); }

function computeLevel(leg) {
  const startX = -180;
  const heights = [], surfAt = [];
  const waterZones = [], checkpoints = [], marks = { palms: [], boats: [], bridges: [] };
  let x = startX, baseY = 0, finishX = null;
  const emit = (y, surf) => { heights.push(y); surfAt.push(surf); x += DX; };

  for (const s of leg.segments) {
    const n = s.len ? Math.round(s.len / DX) : 0;
    const surf = s.surface || 'tarmac';
    if (s.type === 'checkpoint') { checkpoints.push({ x, bonus: s.bonus ?? 10 }); continue; }
    if (s.type === 'finish') { finishX = x; continue; }
    if (s.type === 'flat') { for (let i = 0; i < n; i++) emit(baseY, surf); }
    else if (s.type === 'rollers') { const a = s.amp ?? 0.7; for (let i = 0; i < n; i++) emit(baseY + a * Math.sin(i * DX * 0.5), surf); }
    else if (s.type === 'climb') { const r = s.rise; for (let i = 0; i < n; i++) emit(baseY + r * smooth(i / n), surf); baseY += r; }
    else if (s.type === 'descent') { const r = -(s.drop ?? 3); for (let i = 0; i < n; i++) emit(baseY + r * smooth(i / n), surf); baseY += r; }
    else if (s.type === 'ramp') { const r = s.rise ?? 2; for (let i = 0; i < n; i++) { const t = i / n; emit(baseY + r * t * t, surf); } baseY += r; }
    else if (s.type === 'bridge') { const x0 = x; for (let i = 0; i < n; i++) emit(baseY, 'wood'); marks.bridges.push({ x0, x1: x, y: baseY }); }
    else if (s.type === 'ford') {
      const x0 = x, dip = s.dip ?? 0.4;
      for (let i = 0; i < n; i++) { const t = i / n; emit(baseY - dip * Math.sin(Math.PI * t), 'water'); }
      waterZones.push({ x0, x1: x, type: 'ford', waterY: baseY - 0.1, surfaceY: baseY });
      marks.palms.push({ x0: x0 - 4, x1: x + 4 });
    }
    else if (s.type === 'gap') {
      const x0 = x, pit = s.pit ?? 3, lip = 2, edge = 3;
      const floor = Math.max(1, n - 2 * lip - 2 * edge);
      for (let i = 0; i < lip; i++) emit(baseY, surf);
      for (let i = 0; i < edge; i++) emit(baseY - pit * ((i + 1) / edge), 'water');
      for (let i = 0; i < floor; i++) emit(baseY - pit, 'water');
      for (let i = 0; i < edge; i++) emit(baseY - pit * (1 - (i + 1) / edge), surf);
      for (let i = 0; i < lip; i++) emit(baseY, surf);
      waterZones.push({ x0, x1: x, type: 'gap', waterY: baseY - pit + 0.35, surfaceY: baseY });
      marks.palms.push({ x0: x0 - 3, x1: x + 3 });
    }
  }

  const H = Float32Array.from(heights);
  const N = H.length;
  const profile = (qx) => {
    const fi = (qx - startX) / DX;
    if (fi <= 0) return H[0] ?? 0;
    if (fi >= N - 1) return H[N - 1] ?? 0;
    const i = Math.floor(fi), f = fi - i;
    return H[i] * (1 - f) + H[i + 1] * f;
  };
  const slopeAt = (qx) => (profile(qx + 0.35) - profile(qx - 0.35)) / 0.7;
  const surfaceAt = (qx) => {
    const i = Math.round((qx - startX) / DX);
    return SURFACES[surfAt[Math.max(0, Math.min(surfAt.length - 1, i))]] || SURFACES.tarmac;
  };
  const waterAt = (qx) => waterZones.find((w) => qx >= w.x0 && qx <= w.x1) || null;

  return { startX, finishX, profile, slopeAt, surfaceAt, waterAt, waterZones, checkpoints, marks, surfKeys: surfAt };
}

// ---------- geometry ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function smoothstep(x, a, b) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

export function buildLevel(scene, shadows, leg) {
  const L = computeLevel(leg);
  const { startX, finishX, profile, surfaceAt, waterZones, checkpoints, marks } = L;
  const rng = mulberry32(2025);
  const flat = (name, color, spec = 0) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color; m.specularColor = new Color3(spec, spec, spec);
    return m;
  };
  const spin = [];

  // ---------- ribbon (surfaced, value-shaded) ----------
  const spanX = finishX - startX + 400;   // generous aprons (200m each side): ground runs well past the finish for the outro ride-off
  const midX = (startX + finishX) / 2;
  const ribbon = MeshBuilder.CreateGround('ribbon', {
    width: spanX, height: 64, subdivisionsX: Math.round(spanX / 0.6), subdivisionsY: 8, updatable: true,
  }, scene);
  ribbon.position.x = midX;
  const pos = ribbon.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = profile(pos[i] + midX);
  ribbon.updateVerticesData(VertexBuffer.PositionKind, pos);
  ribbon.convertToFlatShadedMesh();
  const p = ribbon.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((p.length / 3) * 4);
  for (let f = 0; f < p.length / 3; f += 3) {
    const wx = (p[f * 3] + p[(f + 1) * 3] + p[(f + 2) * 3]) / 3 + midX;
    const shade = surfaceAt(wx).shade;
    const jit = shade * (1 + (rng() - 0.5) * 0.05);
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 4] = GROUND.r * jit;
      colors[(f + v) * 4 + 1] = GROUND.g * jit;
      colors[(f + v) * 4 + 2] = GROUND.b * jit;
      colors[(f + v) * 4 + 3] = 1;
    }
  }
  ribbon.setVerticesData(VertexBuffer.ColorKind, colors);
  ribbon.material = flat('ribbonMat', Color3.White());
  ribbon.receiveShadows = true;

  // ---------- scatter small rocks over gravel / broken sections (reads as gravel road) ----------
  {
    const pebble = MeshBuilder.CreatePolyhedron('pebble', { type: 1, size: 1 }, scene);
    pebble.material = flat('pebbleMat', Color3.FromHexString('#a4a9af'));
    const buf = [];
    for (let gx = startX; gx <= finishX; gx += 0.7) {
      const s = surfaceAt(gx);
      if (s !== SURFACES.gravel && s !== SURFACES.broken) continue;
      const count = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const r = 0.04 + rng() * 0.09;
        const m = Matrix.Compose(
          new Vector3(r, r * 0.65, r),
          Quaternion.FromEulerAngles(rng() * 3, rng() * 3, rng() * 3),
          new Vector3(gx + (rng() - 0.5) * 0.9, profile(gx) + r * 0.3, (rng() - 0.5) * 6.6),
        );
        for (let e = 0; e < 16; e++) buf.push(m.m[e]);
      }
    }
    pebble.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
    pebble.thinInstanceRefreshBoundingInfo();
    pebble.receiveShadows = true;
  }

  // ---------- sky backdrop (fog-independent horizon) is created in main; here: parallax ridges ----------
  const ridge = (zPos, amp, base, col, phase) => {
    // fine tessellation → a smooth rolling skyline instead of a blocky one
    const m = MeshBuilder.CreateGround('ridge' + zPos, { width: spanX + 200, height: 190, subdivisionsX: 240, subdivisionsY: 24, updatable: true }, scene);
    const hp = m.getVerticesData(VertexBuffer.PositionKind);
    for (let i = 0; i < hp.length; i += 3) {
      const gx = hp[i], gz = hp[i + 2];
      const depth = smoothstep(-gz, 8, 92);
      hp[i + 1] = depth * (amp * Math.sin(gx * 0.018 + phase) * Math.sin(gz * 0.015 + phase * 1.3) + base) - 0.5;
    }
    m.updateVerticesData(VertexBuffer.PositionKind, hp);
    m.convertToFlatShadedMesh();
    m.position.set(midX, 0, zPos);
    m.material = flat('ridgeMat' + zPos, col);
  };
  ridge(-150, 15, 10, HILL[2], 3.1);
  ridge(-104, 11, 7, HILL[1], 1.7);
  ridge(-60, 8, 5, HILL[0], 0.6);

  // taller mountain band behind the start so the establishing shot has layered peaks
  {
    const m = MeshBuilder.CreateGround('startMountains', { width: 420, height: 170, subdivisionsX: 200, subdivisionsY: 20, updatable: true }, scene);
    const hp = m.getVerticesData(VertexBuffer.PositionKind);
    for (let i = 0; i < hp.length; i += 3) {
      const gx = hp[i], gz = hp[i + 2];
      const depth = smoothstep(-gz, 6, 80);
      hp[i + 1] = depth * (15 * Math.sin(gx * 0.021 + 0.7) * Math.sin(gz * 0.016 + 1.1) + 13) - 0.5;
    }
    m.updateVerticesData(VertexBuffer.PositionKind, hp);
    m.convertToFlatShadedMesh();
    m.position.set(startX - 25, 0, -128);
    m.material = flat('startMountainsMat', HILL[1]);
  }

  // ---------- repeating distant silhouettes: a treeline/steeple band that fills the
  // whole horizon (start apron → well past the finish) so the skyline is never blank ----------
  const hxMin = startX - 120, hxMax = finishX + 180;
  {
    // faceted distant conifers, thin-instanced across the full span at horizon depth
    const cone = MeshBuilder.CreateCylinder('hzTree', { height: 1, diameterTop: 0, diameterBottom: 0.6, tessellation: 5 }, scene);
    cone.material = flat('hzTreeMat', HILL[0].scale(0.94));   // just darker than the ridge behind → reads as a treeline
    const buf = [];
    for (let gx = hxMin; gx <= hxMax; gx += 4.5) {
      const clump = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < clump; k++) {
        const s = 2.2 + rng() * 3.4;                          // tall enough to break the ridgeline
        const zz = -40 - rng() * 26;                          // sits in front of the far ridges
        const m = Matrix.Compose(
          new Vector3(s * 0.7, s, s * 0.7),
          Quaternion.FromEulerAngles(0, rng() * 3, 0),
          new Vector3(gx + (rng() - 0.5) * 4, s * 0.5 - 0.5, zz),
        );
        for (let e = 0; e < 16; e++) buf.push(m.m[e]);
      }
    }
    cone.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
    cone.thinInstanceRefreshBoundingInfo();
  }
  {
    // sparse taller spires (village steeples / lone palms) punctuating the treeline
    const spire = MeshBuilder.CreateCylinder('hzSpire', { height: 1, diameterTop: 0.05, diameterBottom: 0.35, tessellation: 5 }, scene);
    spire.material = flat('hzSpireMat', HILL[0].scale(0.88));
    const buf = [];
    for (let gx = hxMin; gx <= hxMax; gx += 26) {
      const s = 6 + rng() * 4;
      const zz = -44 - rng() * 20;
      const m = Matrix.Compose(
        new Vector3(s * 0.18, s, s * 0.18),
        Quaternion.Identity(),
        new Vector3(gx + (rng() - 0.5) * 10, s * 0.5 - 0.5, zz),
      );
      for (let e = 0; e < 16; e++) buf.push(m.m[e]);
    }
    spire.thinInstanceSetBuffer('matrix', new Float32Array(buf), 16, true);
    spire.thinInstanceRefreshBoundingInfo();
  }

  // ---------- water planes + red hazard posts ----------
  const waterMat = flat('water', WATER, 0.0);   // matte — no specular white glare
  const redMat = flat('red', RED);
  const blackMat = flat('black', BLACK);
  for (const w of waterZones) {
    const len = w.x1 - w.x0;
    const plane = MeshBuilder.CreateGround('waterPlane', { width: len + 1.5, height: 30, subdivisions: Math.max(2, Math.round(len)), updatable: true }, scene);
    plane.position.set((w.x0 + w.x1) / 2, w.waterY, 0);
    const wp = plane.getVerticesData(VertexBuffer.PositionKind);
    for (let i = 0; i < wp.length; i += 3) wp[i + 1] = 0.06 * Math.sin(wp[i] * 0.5) * Math.cos(wp[i + 2] * 0.35);
    plane.updateVerticesData(VertexBuffer.PositionKind, wp);
    plane.convertToFlatShadedMesh();
    plane.material = waterMat;
    // red hazard posts at both banks
    for (const bx of [w.x0, w.x1]) {
      for (const bz of [-2.4, 2.4]) {
        const post = MeshBuilder.CreateBox('hazard', { width: 0.12, height: 0.9, depth: 0.12 }, scene);
        post.position.set(bx, w.surfaceY + 0.45, bz);
        post.material = redMat;
        shadows.addShadowCaster(post);
      }
    }
    // gap: a red takeoff line across the road at the lip — press Space here
    if (w.type === 'gap') {
      const line = MeshBuilder.CreateBox('takeoff', { width: 0.4, height: 0.08, depth: 5.4 }, scene);
      line.position.set(w.x0, w.surfaceY + 0.06, 0);
      line.material = redMat;
      shadows.addShadowCaster(line);
    }
  }

  // ---------- plank bridges ----------
  const woodMat = flat('wood', WOOD, 0.05);
  for (const b of marks.bridges) {
    const deck = MeshBuilder.CreateBox('deck', { width: b.x1 - b.x0, height: 0.18, depth: 3.0 }, scene);
    deck.position.set((b.x0 + b.x1) / 2, b.y + 0.02, 0);
    deck.material = woodMat;
    deck.receiveShadows = true;
    shadows.addShadowCaster(deck);
    for (let px = b.x0 + 1; px < b.x1; px += 3) {
      for (const pz of [-1.5, 1.5]) {
        const rail = MeshBuilder.CreateBox('rail', { width: 0.12, height: 0.7, depth: 0.12 }, scene);
        rail.position.set(px, b.y + 0.4, pz);
        rail.material = woodMat;
        shadows.addShadowCaster(rail);
      }
    }
  }

  // ---------- checkpoints (red flag arches) + finish ----------
  const checkMarkers = [];
  const arch = (ax, red) => {
    for (const z of [-2.6, 2.6]) {
      const post = MeshBuilder.CreateBox('archPost', { width: 0.13, height: 3.2, depth: 0.13 }, scene);
      post.position.set(ax, profile(ax) + 1.6, z);
      post.material = blackMat;
      shadows.addShadowCaster(post);
    }
    const beam = MeshBuilder.CreateBox('archBeam', { width: 0.14, height: 0.32, depth: 5.4 }, scene);
    beam.position.set(ax, profile(ax) + 3.15, 0);
    beam.material = red ? redMat : blackMat;
    shadows.addShadowCaster(beam);
    return beam;
  };
  for (const c of checkpoints) checkMarkers.push({ x: c.x, mesh: arch(c.x, true) });
  arch(finishX, true);
  // finish: a second stacked red beam to distinguish it
  const fb = MeshBuilder.CreateBox('finishBeam2', { width: 0.14, height: 0.32, depth: 5.4 }, scene);
  fb.position.set(finishX, profile(finishX) + 2.6, 0);
  fb.material = redMat;
  shadows.addShadowCaster(fb);

  // ---------- start gantry (F1 lights) sits ON the start line — the bike crosses it exactly at GO ----------
  const SA = startX;
  arch(SA, false);
  const lampOffMat = flat('lampOff', Color3.FromHexString('#26282c'));
  const lampOnMat = flat('lampOn', RED, 0.2);
  lampOnMat.emissiveColor = RED.scale(0.55);
  const startLamps = [];
  for (let i = -1; i <= 1; i++) {
    const lamp = MeshBuilder.CreateBox('lamp', { width: 0.32, height: 0.32, depth: 0.9 }, scene);
    lamp.position.set(SA, profile(SA) + 3.15 + 0.32, i * 1.6);
    lamp.material = lampOffMat;
    shadows.addShadowCaster(lamp);
    startLamps.push(lamp);
  }

  // ---------- coastal props: faceted palms, boats, foreground, poles, turbines ----------
  const treeMat = flat('tree', TREE);
  const palm = (px, pz, s) => {
    const y = profile(px);
    const trunk = MeshBuilder.CreateCylinder('palmT', { height: 3.2 * s, diameterTop: 0.14 * s, diameterBottom: 0.24 * s, tessellation: 5 }, scene);
    trunk.position.set(px, y + 1.6 * s, pz);
    trunk.rotation.z = (rng() - 0.5) * 0.3;
    trunk.material = treeMat;
    shadows.addShadowCaster(trunk);
    for (let k = 0; k < 6; k++) {
      const frond = MeshBuilder.CreateBox('frond', { width: 1.7 * s, height: 0.05, depth: 0.32 * s }, scene);
      const a = (k / 6) * Math.PI * 2;
      frond.position.set(px + Math.cos(a) * 0.7 * s, y + 3.15 * s, pz + Math.sin(a) * 0.7 * s);
      frond.rotation.y = a; frond.rotation.z = -0.35;
      frond.material = treeMat;
      shadows.addShadowCaster(frond);
    }
  };
  for (const m of marks.palms) {
    palm(m.x0 - 2 + rng() * 2, -8 - rng() * 6, 0.9 + rng() * 0.6);
    palm(m.x1 + 1 + rng() * 2, -9 - rng() * 5, 0.9 + rng() * 0.6);
  }
  // faceted tree builder (used by the leg scatter and the start grove)
  const miniTree = (gx, z, s) => {
    const y = profile(gx);
    const trunk = MeshBuilder.CreateCylinder('tt', { height: 1.3 * s, diameterTop: 0.12 * s, diameterBottom: 0.2 * s, tessellation: 5 }, scene);
    trunk.position.set(gx, y + 0.65 * s, z); trunk.material = treeMat; shadows.addShadowCaster(trunk);
    const c1 = MeshBuilder.CreatePolyhedron('tc', { type: 3, size: 0.7 * s }, scene);
    c1.position.set(gx, y + 1.6 * s, z); c1.rotation.y = rng() * 3; c1.material = treeMat; shadows.addShadowCaster(c1);
    return c1;
  };
  // dense grove flanking the approach & start arch — parallax richness for the roll-in
  for (let i = 0; i < 18; i++) {
    const gx = startX - 48 + rng() * 62;
    miniTree(gx, -6 - rng() * 22, 0.7 + rng() * 1.1);
  }
  // boulders around the start shoulders
  for (let i = 0; i < 8; i++) {
    const r = 0.5 + rng() * 1.1;
    const rock = MeshBuilder.CreatePolyhedron('startRock', { type: 3, size: r * 0.6 }, scene);
    const gx = startX - 42 + rng() * 52;
    rock.position.set(gx, profile(gx) + r * 0.22, -4 - rng() * 11);
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.material = flat('startRockMat' + i, ROCK);
    rock.receiveShadows = true;
    shadows.addShadowCaster(rock);
  }
  // scattered faceted trees along the whole leg (and out past the finish for the ride-off)
  for (let i = 0; i < 30; i++) {
    const gx = startX + 10 + rng() * (finishX - startX + 150);
    const s = 0.8 + rng() * 1.0, y = profile(gx), z = -10 - rng() * 16;
    const trunk = MeshBuilder.CreateCylinder('tt', { height: 1.3 * s, diameterTop: 0.12 * s, diameterBottom: 0.2 * s, tessellation: 5 }, scene);
    trunk.position.set(gx, y + 0.65 * s, z); trunk.material = treeMat; shadows.addShadowCaster(trunk);
    const c1 = MeshBuilder.CreatePolyhedron('tc', { type: 3, size: 0.7 * s }, scene);
    c1.position.set(gx, y + 1.6 * s, z); c1.rotation.y = rng() * 3; c1.material = treeMat; shadows.addShadowCaster(c1);
  }
  // fishing boats near water zones
  const boatMat = flat('boat', HILL[1]);
  for (const w of waterZones) {
    const bx = (w.x0 + w.x1) / 2 + (rng() - 0.5) * 4;
    const hull = MeshBuilder.CreateCylinder('hull', { height: 3.0, diameterTop: 0.9, diameterBottom: 0, tessellation: 4 }, scene);
    hull.rotation.z = Math.PI / 2; hull.rotation.y = rng();
    hull.scaling.set(1, 1, 0.5);
    hull.position.set(bx, w.waterY + 0.3, -7 - rng() * 4);
    hull.material = boatMat;
    shadows.addShadowCaster(hull);
  }

  // utility poles + wire
  const poleMat = flat('pole', POLE);
  const wireSeg = (a, b) => {
    const d = b.subtract(a), len = d.length();
    const wm = MeshBuilder.CreateBox('wire', { width: 0.035, height: 0.035, depth: len }, scene);
    wm.position.copyFrom(a.add(b).scale(0.5)); wm.lookAt(b); wm.material = poleMat;
  };
  let prevTop = null;
  for (let gx = startX - 44; gx <= finishX + 168; gx += 24) {   // wires lead the eye in, and carry on past the finish for the ride-off
    const y = profile(gx);
    const pole = MeshBuilder.CreateCylinder('pole', { height: 4.2, diameter: 0.15, tessellation: 5 }, scene);
    pole.position.set(gx, y + 2.1, -4.6); pole.material = poleMat; shadows.addShadowCaster(pole);
    const arm = MeshBuilder.CreateBox('arm', { width: 1.0, height: 0.12, depth: 0.12 }, scene);
    arm.position.set(gx, y + 3.9, -4.6); arm.material = poleMat;
    const top = new Vector3(gx, y + 3.85, -4.6);
    if (prevTop) { const mid = prevTop.add(top).scale(0.5); mid.y -= 0.7; wireSeg(prevTop, mid); wireSeg(mid, top); }
    prevTop = top;
  }

  // wind turbines (distant, animated)
  const turbMat = flat('turb', HILL[1]);
  const turbine = (tx, tz, s) => {
    const tower = MeshBuilder.CreateCylinder('twr', { height: 9 * s, diameterTop: 0.16 * s, diameterBottom: 0.34 * s, tessellation: 6 }, scene);
    tower.position.set(tx, 4.1 * s, tz); tower.material = turbMat; shadows.addShadowCaster(tower);
    const hub = new TransformNode('hub', scene); hub.position.set(tx, 8.6 * s, tz);
    for (let b = 0; b < 3; b++) {
      const a = b * 2.094;
      const blade = MeshBuilder.CreateBox('bl', { width: 0.2 * s, height: 3.4 * s, depth: 0.07 * s }, scene);
      blade.position.set(Math.sin(a) * 1.7 * s, Math.cos(a) * 1.7 * s, 0); blade.rotation.z = -a;
      blade.material = turbMat; blade.parent = hub;
    }
    spin.push(hub);
  };
  turbine(startX + 60, -66, 1.5); turbine(midX + 20, -80, 1.8); turbine(finishX - 30, -68, 1.4);
  turbine(startX - 36, -72, 1.7); turbine(startX - 4, -88, 2.0);   // skyline behind the start
  turbine(finishX + 45, -70, 1.6); turbine(finishX + 120, -84, 1.9);   // skyline the outro rides toward

  // sparse foreground silhouettes (in front of camera)
  const fgMat = flat('fg', FG);
  for (let i = 0; i < 20; i++) {
    const r = 0.28 + rng() * 0.5;
    const t = MeshBuilder.CreatePolyhedron('fg', { type: 3, size: r * 0.6 }, scene);
    const gx = startX + rng() * (finishX - startX + 150);
    t.position.set(gx, profile(gx) + r * 0.2, 3 + rng() * 3.5);
    t.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    t.material = fgMat;
    shadows.addShadowCaster(t);
  }

  return {
    ...L, spin, checkMarkers, startLamps, lampOnMat, lampOffMat,
    name: leg.name, subtitle: leg.subtitle, timeLimit: leg.timeLimit, fog: leg.fog,
  };
}
