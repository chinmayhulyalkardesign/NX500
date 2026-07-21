import { Color3, MeshBuilder, StandardMaterial, VertexBuffer, Vector3 } from '@babylonjs/core';

// ---------- First Light, Alibaug: warm dawn coastal palette ----------
export const WORLD_BG = Color3.FromHexString('#f0ebe4');   // warm pale haze
const GROUND = Color3.FromHexString('#dbd5cb');            // warm dune-grey
const ROAD = Color3.FromHexString('#c1bdb6');
const SAND = Color3.FromHexString('#e2dccf');              // shoreline sand
const SEA = Color3.FromHexString('#a9b4c2');               // cool sea (reads against warm haze)
const ROCK = Color3.FromHexString('#cfcabf');
const PALM = Color3.FromHexString('#bfb9ad');
const WHITE = Color3.FromHexString('#eae5db');
const BLACK = Color3.FromHexString('#17181a');
const MARKER_RED = Color3.FromHexString('#ff2e2e');

export const WORLD_HALF = 168;
export const ROAD_HALF_WIDTH = 3.2;
const SEA_LEVEL = -0.55;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z) {
  let h =
    2.2 * Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.038) +
    1.4 * Math.sin(x * 0.11 + z * 0.07) +
    0.6 * Math.sin(x * 0.23 - z * 0.19);
  const d = Math.hypot(x, z);
  const far = smoothstep(d, 30, 130);
  h *= 0.35 + 1.9 * far;
  h += 7.0 * far * Math.sin(x * 0.021 + 0.5) * Math.sin(z * 0.017 + 1.2);
  const roadK = smoothstep(Math.abs(z), 4.0, 18.0);
  h *= roadK;
  h += (1 - roadK) * 0.015 * Math.sin(x * 1.3);
  // coastline on the +z side: land descends into the sea
  const coast = smoothstep(z, 11, 40);
  h = h * (1 - coast) + (SEA_LEVEL - 1.6) * coast;
  return h;
}

export function surfaceAt(x, z) {
  if (Math.abs(z) < ROAD_HALF_WIDTH) {
    return { name: 'tarmac', grip: 1.0, accel: 7.5, top: 46, drag: 0.35, bump: 0 };
  }
  return { name: 'dirt', grip: 0.62, accel: 5.0, top: 29, drag: 1.1, bump: 0.018 };
}

export function flatMat(scene, name, color, spec = 0) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(spec, spec, spec);
  return m;
}

export function buildWorld(scene, shadows) {
  const rng = mulberry32(1337);

  // ---------- terrain ----------
  const ground = MeshBuilder.CreateGround('ground', { width: 340, height: 340, subdivisions: 160, updatable: true }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = terrainHeight(pos[i], pos[i + 2]);
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.convertToFlatShadedMesh();
  const p = ground.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((p.length / 3) * 4);
  const cc = new Color3();
  for (let f = 0; f < p.length / 3; f += 3) {
    const zAvg = (p[f * 3 + 2] + p[(f + 1) * 3 + 2] + p[(f + 2) * 3 + 2]) / 3;
    const yAvg = (p[f * 3 + 1] + p[(f + 1) * 3 + 1] + p[(f + 2) * 3 + 1]) / 3;
    const tRoad = smoothstep(Math.abs(zAvg), 2.6, 5.0);
    cc.copyFrom(ROAD).scale(1); // temp
    // road -> ground
    let r = ROAD.r + (GROUND.r - ROAD.r) * tRoad;
    let g = ROAD.g + (GROUND.g - ROAD.g) * tRoad;
    let b = ROAD.b + (GROUND.b - ROAD.b) * tRoad;
    // blend to sand near the waterline
    const tSand = smoothstep(yAvg, SEA_LEVEL + 1.2, SEA_LEVEL + 0.1) * smoothstep(zAvg, 8, 16);
    r = r + (SAND.r - r) * tSand;
    g = g + (SAND.g - g) * tSand;
    b = b + (SAND.b - b) * tSand;
    const jitter = 1 + (rng() - 0.5) * 0.05;
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 4] = r * jitter;
      colors[(f + v) * 4 + 1] = g * jitter;
      colors[(f + v) * 4 + 2] = b * jitter;
      colors[(f + v) * 4 + 3] = 1;
    }
  }
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  ground.material = flatMat(scene, 'groundMat', Color3.White());
  ground.receiveShadows = true;

  // ---------- the sea ----------
  const sea = MeshBuilder.CreateGround('sea', { width: 900, height: 520, subdivisions: 1 }, scene);
  sea.position.set(0, SEA_LEVEL, 210);
  const seaMat = flatMat(scene, 'seaMat', SEA, 0.15);
  seaMat.alpha = 1;
  sea.material = seaMat;

  // faceted swell near the shore so the water reads as water, not a flat sheet.
  // lifted clearly above the flat sea plane so the two never z-fight.
  const swell = MeshBuilder.CreateGround('swell', { width: 420, height: 110, subdivisions: 150, updatable: true }, scene);
  swell.position.set(0, SEA_LEVEL + 0.22, 62);
  const sp = swell.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < sp.length; i += 3) {
    sp[i + 1] = 0.10 * Math.sin(sp[i] * 0.35) * Math.cos((sp[i + 2] + 30) * 0.28);
  }
  swell.updateVerticesData(VertexBuffer.PositionKind, sp);
  swell.convertToFlatShadedMesh();
  swell.material = flatMat(scene, 'swellMat', SEA.scale(0.96), 0.18);

  // ---------- props ----------
  const rockMat = flatMat(scene, 'rock', ROCK);
  const palmMat = flatMat(scene, 'palm', PALM);
  const whiteMat = flatMat(scene, 'white', WHITE);
  const blackMat = flatMat(scene, 'black', BLACK);
  const markerMat = flatMat(scene, 'marker', MARKER_RED);

  // scattered rocks on the land side
  for (let i = 0; i < 22; i++) {
    const r = 0.4 + rng() * 1.3;
    const rock = MeshBuilder.CreatePolyhedron('rock' + i, { type: 3, size: r * 0.6 }, scene);
    const x = -150 + rng() * 300;
    const z = -(8 + rng() * 45);                 // land side only
    rock.position.set(x, terrainHeight(x, z) + r * 0.3, z);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.material = rockMat;
    rock.receiveShadows = true;
    shadows.addShadowCaster(rock);
  }

  // coconut palms along the shore side
  function palm(x, z, lean) {
    const g = new Vector3(x, terrainHeight(x, z), z);
    const trunk = MeshBuilder.CreateCylinder('trunk', { height: 3.4, diameterTop: 0.16, diameterBottom: 0.28, tessellation: 6 }, scene);
    trunk.position.set(x, g.y + 1.7, z);
    trunk.rotation.z = lean;
    trunk.material = palmMat;
    shadows.addShadowCaster(trunk);
    const topY = g.y + 3.35;
    for (let k = 0; k < 6; k++) {
      const frond = MeshBuilder.CreateBox('frond', { width: 1.7, height: 0.05, depth: 0.34 }, scene);
      const a = (k / 6) * Math.PI * 2;
      frond.position.set(x + Math.cos(a) * 0.7 - lean * 1.5, topY - 0.1, z + Math.sin(a) * 0.7);
      frond.rotation.y = a;
      frond.rotation.z = -0.35;
      frond.material = palmMat;
      shadows.addShadowCaster(frond);
    }
  }
  for (let x = -140; x <= 130; x += 26) {
    palm(x + (rng() - 0.5) * 6, 8.5 + rng() * 1.5, (rng() - 0.5) * 0.3);
  }

  // lighthouse landmark on the point — the mission destination
  const beaconMat = flatMat(scene, 'beacon', MARKER_RED, 0.2);
  beaconMat.emissiveColor = MARKER_RED.clone();
  function lighthouse(x, z) {
    const y = terrainHeight(x, z);
    const tower = MeshBuilder.CreateCylinder('lh', { height: 11, diameterTop: 1.2, diameterBottom: 2.2, tessellation: 14 }, scene);
    tower.position.set(x, y + 5.5, z);
    tower.material = whiteMat;
    shadows.addShadowCaster(tower);
    const band = MeshBuilder.CreateCylinder('lhBand', { height: 1.6, diameter: 1.5, tessellation: 14 }, scene);
    band.position.set(x, y + 8.0, z);
    band.material = blackMat;
    shadows.addShadowCaster(band);
    const lantern = MeshBuilder.CreateCylinder('lhLantern', { height: 1.3, diameter: 1.3, tessellation: 10 }, scene);
    lantern.position.set(x, y + 10.4, z);
    lantern.material = beaconMat;            // pulsing red beacon = the goal, lit at dawn
    shadows.addShadowCaster(lantern);
    const cap = MeshBuilder.CreateCylinder('lhCap', { height: 0.8, diameterTop: 0, diameterBottom: 1.6, tessellation: 10 }, scene);
    cap.position.set(x, y + 11.4, z);
    cap.material = blackMat;
    shadows.addShadowCaster(cap);
    return lantern;
  }
  const LH_X = 152, LH_Z = 9;
  const beacon = lighthouse(LH_X, LH_Z);

  // fishing boats hauled up on the sand
  function boat(x, z, rot) {
    const y = terrainHeight(x, z);
    const hull = MeshBuilder.CreateCylinder('hull', { height: 3.4, diameterTop: 1.0, diameterBottom: 0, tessellation: 4 }, scene);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = rot;
    hull.scaling.set(1, 1, 0.5);
    hull.position.set(x, y + 0.35, z);
    hull.material = whiteMat;
    shadows.addShadowCaster(hull);
    const stripe = MeshBuilder.CreateBox('stripe', { width: 3.0, height: 0.14, depth: 0.9 }, scene);
    stripe.rotation.y = rot;
    stripe.position.set(x, y + 0.55, z);
    stripe.material = markerMat;
    shadows.addShadowCaster(stripe);
  }
  boat(-40, 9.5, 0.4);
  boat(60, 10, -0.3);

  // ---------- road edge markers ----------
  for (let x = -160; x <= 160; x += 9) {
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateBox('post', { width: 0.09, height: 0.55, depth: 0.09 }, scene);
      post.position.set(x, terrainHeight(x, side * 3.6) + 0.27, side * 3.6);
      post.material = markerMat;
      shadows.addShadowCaster(post);
    }
  }

  return { finishX: 146, lighthouse: { x: LH_X, z: LH_Z, beacon } };
}
