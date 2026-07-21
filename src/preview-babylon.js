import {
  Engine, Scene, Color3, Color4, Vector3, ArcRotateCamera,
  HemisphericLight, DirectionalLight, ShadowGenerator,
  MeshBuilder, StandardMaterial, VertexBuffer,
  SceneLoader, SSAO2RenderingPipeline, DefaultRenderingPipeline,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

const WORLD_BG = Color3.FromHexString('#edeef0');
const GROUND = Color3.FromHexString('#d9dbde');
const ROAD = Color3.FromHexString('#bdc1c7');
const ROCK = Color3.FromHexString('#cfd2d6');
const BIKE_RED = Color3.FromHexString('#e12b2b');
const RIDER_RED = Color3.FromHexString('#b02323');
const BLACK = Color3.FromHexString('#17181a');
const MARKER_RED = Color3.FromHexString('#ff2e2e');

const canvas = document.getElementById('c');
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = Color4.FromColor3(WORLD_BG, 1);
scene.fogMode = Scene.FOGMODE_LINEAR;
scene.fogStart = 45;
scene.fogEnd = 190;
scene.fogColor = WORLD_BG;

const camera = new ArcRotateCamera('cam', 0.743, 1.463, 8.3, new Vector3(0.3, 1.0, 0), scene);
camera.fov = 45 * Math.PI / 180;
camera.lowerRadiusLimit = 1.5;
camera.upperRadiusLimit = 60;
camera.wheelPrecision = 30;
camera.attachControl(canvas, true);

new HemisphericLight('hemi', new Vector3(0, 1, 0), scene).intensity = 0.75;
const sun = new DirectionalLight('sun', new Vector3(-25, -42, -18).normalize(), scene);
sun.position = new Vector3(25, 42, 18);
sun.intensity = 1.35;
const shadows = new ShadowGenerator(4096, sun);
shadows.usePercentageCloserFiltering = true;
shadows.bias = 0.0006;
shadows.normalBias = 0.02;

function flatMat(name, color, spec = 0) {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(spec, spec, spec);
  return m;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(1337);

function smoothstep(x, a, b) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function terrainHeight(x, z) {
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
  h += (1 - roadK) * 0.04 * Math.sin(x * 1.3);
  return h;
}

// ---------- terrain ----------
{
  const ground = MeshBuilder.CreateGround('ground', { width: 340, height: 340, subdivisions: 150, updatable: true }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < pos.length; i += 3) pos[i + 1] = terrainHeight(pos[i], pos[i + 2]);
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  ground.convertToFlatShadedMesh();
  const p = ground.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((p.length / 3) * 4);
  for (let f = 0; f < p.length / 3; f += 3) {
    const zAvg = (p[f * 3 + 2] + p[(f + 1) * 3 + 2] + p[(f + 2) * 3 + 2]) / 3;
    const t = smoothstep(Math.abs(zAvg), 2.6, 5.0);
    const jitter = 1 + (rng() - 0.5) * 0.055;
    const r = (ROAD.r + (GROUND.r - ROAD.r) * t) * jitter;
    const g = (ROAD.g + (GROUND.g - ROAD.g) * t) * jitter;
    const b = (ROAD.b + (GROUND.b - ROAD.b) * t) * jitter;
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 4] = r; colors[(f + v) * 4 + 1] = g;
      colors[(f + v) * 4 + 2] = b; colors[(f + v) * 4 + 3] = 1;
    }
  }
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  ground.material = flatMat('groundMat', Color3.White());
  ground.receiveShadows = true;
}

// ---------- props ----------
const rockMat = flatMat('rock', ROCK);
for (let i = 0; i < 30; i++) {
  const r = 0.4 + rng() * 1.4;
  const rock = MeshBuilder.CreatePolyhedron('rock' + i, { type: 3, size: r * 0.6 }, scene);
  const x = -60 + rng() * 180;
  const z = (8 + rng() * 55) * (rng() > 0.5 ? 1 : -1);
  rock.position.set(x, terrainHeight(x, z) + r * 0.35, z);
  rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
  rock.material = rockMat;
  rock.receiveShadows = true;
  shadows.addShadowCaster(rock);
}

const markerMat = flatMat('marker', MARKER_RED);
for (let x = -36; x <= 96; x += 9) {
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateBox('post', { width: 0.09, height: 0.55, depth: 0.09 }, scene);
    post.position.set(x, terrainHeight(x, side * 3.6) + 0.27, side * 3.6);
    post.material = markerMat;
    shadows.addShadowCaster(post);
  }
}

const blackMat = flatMat('black', BLACK);
for (const side of [-1, 1]) {
  const post = MeshBuilder.CreateBox('gate', { width: 0.12, height: 2.6, depth: 0.12 }, scene);
  post.position.set(-16, 1.3, side * 3.8);
  post.material = blackMat;
  shadows.addShadowCaster(post);
}
{
  const banner = MeshBuilder.CreateBox('banner', { width: 0.06, height: 0.35, depth: 7.72 }, scene);
  banner.position.set(-16, 2.45, 0);
  banner.material = markerMat;
  shadows.addShadowCaster(banner);
}

// ---------- bike + rider: Meshy AI "Highway Blazer" (wheels + rider split) ----------
const blazerMat = flatMat('blazer', BIKE_RED, 0.3);
const tireMat = flatMat('tire', BLACK, 0.1);
const riderBlackMat = flatMat('riderBlack', BLACK, 0.15);
const wheels = { front: null, rear: null };
SceneLoader.ImportMeshAsync(null, '/', 'blazer.glb', scene).then((result) => {
  for (const m of result.meshes) {
    if (m.getTotalVertices && m.getTotalVertices() > 0) {
      m.material = /wheel/i.test(m.name) ? tireMat
        : /rider/i.test(m.name) ? riderBlackMat : blazerMat;
      m.receiveShadows = true;
      shadows.addShadowCaster(m);
    }
    if (/wheelF/i.test(m.name)) wheels.front = m;
    if (/wheelR/i.test(m.name)) wheels.rear = m;
    if (m.name === '__root__') m.position.y = 0.02;
  }
  document.getElementById('loading')?.remove();
});
const rider = null;

// ---------- post effects: Babylon's built-in SSAO + FXAA ----------
new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 1.0, blurRatio: 1.0 }, [camera]);
const pipeline = new DefaultRenderingPipeline('default', false, scene, [camera]);
pipeline.fxaaEnabled = true;

window.__nx = { scene, camera, engine, rider, wheels };
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
