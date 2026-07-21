import * as pc from 'playcanvas';

const hex = (h) => new pc.Color().fromString(h);
const WORLD_BG = hex('#edeef0');
const GROUND = hex('#d9dbde');
const ROAD = hex('#bdc1c7');
const ROCK = hex('#cfd2d6');
const BIKE_RED = hex('#e12b2b');
const RIDER_RED = hex('#b02323');
const BLACK = hex('#17181a');
const MARKER_RED = hex('#ff2e2e');

const canvas = document.getElementById('c');
const app = new pc.Application(canvas, {
  graphicsDeviceOptions: { antialias: true },
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.scene.clusteredLightingEnabled = false;
app.start();

app.scene.ambientLight = new pc.Color(0.42, 0.43, 0.44);
const fog = app.scene.fog;
if (fog && typeof fog === 'object') {
  fog.type = pc.FOG_LINEAR;
  fog.color = WORLD_BG;
  fog.start = 45;
  fog.end = 190;
} else {
  app.scene.fog = pc.FOG_LINEAR;
  app.scene.fogColor = WORLD_BG;
  app.scene.fogStart = 45;
  app.scene.fogEnd = 190;
}

const camera = new pc.Entity('camera');
camera.addComponent('camera', { clearColor: WORLD_BG, fov: 45, farClip: 400 });
camera.camera.gammaCorrection = pc.GAMMA_SRGB;
camera.camera.toneMapping = pc.TONEMAP_LINEAR;
camera.setPosition(6.4, 1.9, 5.6);
camera.lookAt(0.3, 1.0, 0);
app.root.addChild(camera);

const sun = new pc.Entity('sun');
sun.addComponent('light', {
  type: 'directional', color: pc.Color.WHITE, intensity: 0.7,
  castShadows: true, shadowResolution: 4096, shadowDistance: 70,
  normalOffsetBias: 0.05, shadowType: pc.SHADOW_PCF5_32F,
});
// beam along -Y rotated by (elevation, yaw): matches sun at (25, 42, 18)
sun.setEulerAngles(40.7, 54.2, 0);
app.root.addChild(sun);

function flatMat(color, gloss = 0.25) {
  const m = new pc.StandardMaterial();
  m.diffuse = color;
  m.specular = new pc.Color(0.03, 0.03, 0.03);
  m.gloss = gloss;
  m.update();
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

// ---------- terrain: non-indexed flat-shaded grid with vertex colors ----------
{
  const N = 150, SIZE = 340, HALF = SIZE / 2, STEP = SIZE / N;
  const positions = [], normals = [], colors = [];
  const va = new pc.Vec3(), vb = new pc.Vec3(), nrm = new pc.Vec3();
  const pushTri = (ax, az, bx, bz, cx, cz) => {
    const ay = terrainHeight(ax, az), by = terrainHeight(bx, bz), cy = terrainHeight(cx, cz);
    va.set(bx - ax, by - ay, bz - az);
    vb.set(cx - ax, cy - ay, cz - az);
    nrm.cross(va, vb).normalize();
    const zAvg = (az + bz + cz) / 3;
    const t = smoothstep(Math.abs(zAvg), 2.6, 5.0);
    const jitter = 1 + (rng() - 0.5) * 0.055;
    const r = (ROAD.r + (GROUND.r - ROAD.r) * t) * jitter;
    const g = (ROAD.g + (GROUND.g - ROAD.g) * t) * jitter;
    const b = (ROAD.b + (GROUND.b - ROAD.b) * t) * jitter;
    for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
      positions.push(x, y, z);
      normals.push(nrm.x, nrm.y, nrm.z);
      colors.push(r, g, b, 1);
    }
  };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x0 = -HALF + i * STEP, x1 = x0 + STEP;
      const z0 = -HALF + j * STEP, z1 = z0 + STEP;
      pushTri(x0, z0, x0, z1, x1, z1);
      pushTri(x0, z0, x1, z1, x1, z0);
    }
  }
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setColors(colors);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  const mat = new pc.StandardMaterial();
  mat.diffuse = pc.Color.WHITE;
  mat.diffuseVertexColor = true;
  mat.specular = new pc.Color(0, 0, 0);
  mat.update();
  const e = new pc.Entity('terrain');
  e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)] });
  e.render.castShadows = false;
  app.root.addChild(e);
}

// ---------- icosahedron rocks ----------
function icosahedronMesh(size) {
  const p = (1 + Math.sqrt(5)) / 2;
  const V = [
    [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
    [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
    [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1],
  ].map((v) => new pc.Vec3(...v).normalize().mulScalar(size));
  const F = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const positions = [], normals = [];
  const e1 = new pc.Vec3(), e2 = new pc.Vec3(), n = new pc.Vec3();
  for (const [a, b, c] of F) {
    e1.sub2(V[b], V[a]); e2.sub2(V[c], V[a]);
    n.cross(e1, e2).normalize();
    for (const idx of [a, b, c]) {
      positions.push(V[idx].x, V[idx].y, V[idx].z);
      normals.push(n.x, n.y, n.z);
    }
  }
  const mesh = new pc.Mesh(app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

const rockMat = flatMat(ROCK, 0.1);
for (let i = 0; i < 30; i++) {
  const r = 0.4 + rng() * 1.4;
  const e = new pc.Entity('rock');
  e.addComponent('render', { meshInstances: [new pc.MeshInstance(icosahedronMesh(r), rockMat)] });
  const x = -60 + rng() * 180;
  const z = (8 + rng() * 55) * (rng() > 0.5 ? 1 : -1);
  e.setPosition(x, terrainHeight(x, z) + r * 0.35, z);
  e.setEulerAngles(rng() * 180, rng() * 180, rng() * 180);
  e.render.castShadows = true;
  app.root.addChild(e);
}

// ---------- boxes: posts, gate, rider ----------
function box(mat, w, h, d) {
  const e = new pc.Entity('box');
  e.addComponent('render', { type: 'box' });
  e.setLocalScale(w, h, d);
  e.render.meshInstances[0].material = mat;
  e.render.castShadows = true;
  app.root.addChild(e);
  return e;
}

const markerMat = flatMat(MARKER_RED);
for (let x = -36; x <= 96; x += 9) {
  for (const side of [-1, 1]) {
    box(markerMat, 0.09, 0.55, 0.09).setPosition(x, terrainHeight(x, side * 3.6) + 0.27, side * 3.6);
  }
}
const blackMat = flatMat(BLACK);
for (const side of [-1, 1]) {
  box(blackMat, 0.12, 2.6, 0.12).setPosition(-16, 1.3, side * 3.8);
}
box(markerMat, 0.06, 0.35, 7.72).setPosition(-16, 2.45, 0);

const riderMat = flatMat(RIDER_RED);
function limb(from, to, w, d = w) {
  const dir = new pc.Vec3().sub2(to, from);
  const len = dir.length();
  const e = box(riderMat, w, d, len);
  e.setPosition(new pc.Vec3().add2(from, dir.mulScalar(0.5)));
  e.lookAt(to.x, to.y, to.z);
  return e;
}
{
  const V = (x, y, z) => new pc.Vec3(x, y, z);
  const A = {
    footL: V(-0.23, 0.48, 0.19), footR: V(-0.23, 0.48, -0.19),
    kneeL: V(-0.02, 0.86, 0.20), kneeR: V(-0.02, 0.86, -0.20),
    hip: V(-0.24, 1.24, 0), neck: V(0.02, 1.55, 0),
    shoulderL: V(0.02, 1.50, 0.21), shoulderR: V(0.02, 1.50, -0.21),
    elbowL: V(0.13, 1.31, 0.33), elbowR: V(0.13, 1.31, -0.33),
    handL: V(0.19, 1.11, 0.36), handR: V(0.19, 1.11, -0.36),
    head: V(0.10, 1.70, 0),
  };
  limb(A.footL, A.kneeL, 0.09); limb(A.footR, A.kneeR, 0.09);
  limb(A.kneeL, V(A.hip.x, A.hip.y, 0.12), 0.11); limb(A.kneeR, V(A.hip.x, A.hip.y, -0.12), 0.11);
  limb(A.hip, A.neck, 0.30, 0.20);
  limb(A.shoulderL, A.elbowL, 0.08); limb(A.shoulderR, A.elbowR, 0.08);
  limb(A.elbowL, A.handL, 0.07); limb(A.elbowR, A.handR, 0.07);
  for (const f of [A.footL, A.footR]) {
    box(riderMat, 0.24, 0.09, 0.10).setPosition(f.x + 0.05, f.y - 0.02, f.z);
  }
  const helmet = new pc.Entity('helmet');
  helmet.addComponent('render', { meshInstances: [new pc.MeshInstance(icosahedronMesh(0.14), riderMat)] });
  helmet.setPosition(A.head.x, A.head.y, A.head.z);
  helmet.render.castShadows = true;
  app.root.addChild(helmet);
}

// ---------- bike ----------
const bikeRedMat = flatMat(BIKE_RED, 0.45);
const tireMat = flatMat(BLACK, 0.1);
app.assets.loadFromUrl('/nx500.glb', 'container', (err, asset) => {
  if (err) { console.error(err); return; }
  const entity = asset.resource.instantiateRenderEntity();
  entity.setPosition(0, 0.02, 0);
  app.root.addChild(entity);
  for (const r of entity.findComponents('render')) {
    r.castShadows = true;
    for (const mi of r.meshInstances) {
      mi.material = /wheel/i.test(mi.material?.name || '') ? tireMat : bikeRedMat;
    }
  }
  document.getElementById('loading')?.remove();
});

// contact shadow approximation (PC directional shadow map not cooperating in this quick port)
{
  const blobMat = new pc.StandardMaterial();
  blobMat.diffuse = new pc.Color(0, 0, 0);
  blobMat.emissive = new pc.Color(0, 0, 0);
  blobMat.blendType = pc.BLEND_NORMAL;
  blobMat.opacity = 0.16;
  blobMat.useLighting = false;
  blobMat.depthWrite = false;
  blobMat.update();
  const blob = new pc.Entity('blob');
  blob.addComponent('render', { type: 'plane' });
  blob.render.meshInstances[0].material = blobMat;
  blob.render.castShadows = false;
  blob.setLocalScale(2.6, 1, 1.1);
  blob.setPosition(-0.25, 0.05, -0.15);
  app.root.addChild(blob);
}

window.__nx = { app, camera, sun, pc };
