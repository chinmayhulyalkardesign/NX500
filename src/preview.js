import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------- palette (Superhot-style) ----------
const WORLD_BG = 0xedeef0;
const GROUND = 0xd9dbde;
const ROAD = 0xbdc1c7;
const ROCK = 0xcfd2d6;
const BIKE_RED = 0xe12b2b;
const RIDER_RED = 0xb02323;
const BLACK = 0x17181a;
const MARKER_RED = 0xff2e2e;

// ---------- renderer / scene / camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(WORLD_BG);
scene.fog = new THREE.Fog(WORLD_BG, 45, 190);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(6.4, 1.9, 5.6);
camera.lookAt(0.3, 1.0, 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0xc8cacd, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.3);
sun.position.set(25, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// ---------- deterministic rng ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(1337);

// ---------- terrain ----------
function terrainHeight(x, z) {
  let h =
    2.2 * Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.038) +
    1.4 * Math.sin(x * 0.11 + z * 0.07) +
    0.6 * Math.sin(x * 0.23 - z * 0.19);
  const d = Math.hypot(x, z);
  const far = THREE.MathUtils.smoothstep(d, 30, 130);
  h *= 0.35 + 1.9 * far;
  h += 7.0 * far * Math.sin(x * 0.021 + 0.5) * Math.sin(z * 0.017 + 1.2);
  const roadK = THREE.MathUtils.smoothstep(Math.abs(z), 4.0, 18.0);
  h *= roadK;
  h += (1 - roadK) * 0.04 * Math.sin(x * 1.3);
  return h;
}

{
  let geo = new THREE.PlaneGeometry(340, 340, 150, 150);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo = geo.toNonIndexed();
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const base = new THREE.Color(GROUND);
  const road = new THREE.Color(ROAD);
  const c = new THREE.Color();
  for (let f = 0; f < p.count; f += 3) {
    const zAvg = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const t = THREE.MathUtils.smoothstep(Math.abs(zAvg), 2.6, 5.0);
    c.copy(road).lerp(base, t);
    const jitter = 1 + (rng() - 0.5) * 0.055;
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = c.r * jitter;
      colors[(f + v) * 3 + 1] = c.g * jitter;
      colors[(f + v) * 3 + 2] = c.b * jitter;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ---------- props ----------
const rockMat = new THREE.MeshStandardMaterial({ color: ROCK, flatShading: true, roughness: 1.0 });
for (let i = 0; i < 30; i++) {
  const r = 0.4 + rng() * 1.4;
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
  const x = -60 + rng() * 180;
  const z = (8 + rng() * 55) * (rng() > 0.5 ? 1 : -1);
  rock.position.set(x, terrainHeight(x, z) + r * 0.35, z);
  rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

const markerMat = new THREE.MeshStandardMaterial({ color: MARKER_RED, roughness: 0.8 });
for (let x = -36; x <= 96; x += 9) {
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), markerMat);
    post.position.set(x, terrainHeight(x, side * 3.6) + 0.27, side * 3.6);
    post.castShadow = true;
    scene.add(post);
  }
}

const blackMat = new THREE.MeshStandardMaterial({ color: BLACK, roughness: 0.7 });
{
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), blackMat);
    post.position.set(-16, 1.3, side * 3.8);
    post.castShadow = true;
    scene.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 7.72), markerMat);
  banner.position.set(-16, 2.45, 0);
  banner.castShadow = true;
  scene.add(banner);
}

// ---------- bike ----------
const bikeRedMat = new THREE.MeshStandardMaterial({ color: BLACK, roughness: 0.3, metalness: 0.15 });
const tireMat = new THREE.MeshStandardMaterial({ color: BLACK, roughness: 0.9, metalness: 0.0 });

// wheel centers measured from the OBJ (mm, obj coords): (±681, *, ~325)
function splitWheelFaces(geometry) {
  const pos = geometry.attributes.position;
  const faceCount = pos.count / 3;
  const isWheel = new Uint8Array(faceCount);
  let wheelFaces = 0;
  for (let f = 0; f < faceCount; f++) {
    let cx = 0, cy = 0, cz = 0;
    for (let v = 0; v < 3; v++) {
      cx += pos.getX(f * 3 + v); cy += pos.getY(f * 3 + v); cz += pos.getZ(f * 3 + v);
    }
    cx /= 3; cy /= 3; cz /= 3;
    if (Math.abs(cy) < 140 && cz < 740 &&
        (Math.hypot(cx - 681, cz - 325) < 400 || Math.hypot(cx + 681, cz - 325) < 400)) {
      isWheel[f] = 1; wheelFaces++;
    }
  }
  if (wheelFaces === 0) return null;
  const out = new Float32Array(pos.count * 3);
  let body = 0, wheel = (faceCount - wheelFaces) * 9;
  for (let f = 0; f < faceCount; f++) {
    let dst = isWheel[f] ? wheel : body;
    for (let v = 0; v < 3; v++) {
      out[dst++] = pos.getX(f * 3 + v);
      out[dst++] = pos.getY(f * 3 + v);
      out[dst++] = pos.getZ(f * 3 + v);
    }
    if (isWheel[f]) wheel = dst; else body = dst;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.addGroup(0, (faceCount - wheelFaces) * 3, 0);
  geo.addGroup((faceCount - wheelFaces) * 3, wheelFaces * 3, 1);
  geo.computeVertexNormals();
  return geo;
}

const bike = new THREE.Group();
bike.rotation.x = -Math.PI / 2; // obj is Z-up
bike.scale.setScalar(0.001);    // mm -> m
bike.position.y = 0.02;
scene.add(bike);

new GLTFLoader().load('/nx500.glb', (gltf) => {
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
    child.material = /wheel/i.test(child.name || '') ? tireMat : bikeRedMat;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  // GLB is already in meters, Y-up
  bike.rotation.x = 0;
  bike.scale.setScalar(1);
  bike.add(gltf.scene);
  document.getElementById('loading')?.remove();
});

// ---------- rider (anchors measured from OBJ, converted to world: x, z->y, -y->z) ----------
const riderMat = new THREE.MeshStandardMaterial({ color: RIDER_RED, flatShading: true, roughness: 0.6 });

function limb(from, to, w, d = w) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, len), riderMat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.lookAt(to);
  mesh.castShadow = true;
  return mesh;
}

const rider = new THREE.Group();
{
  // grips measured at obj (208, ±370, 1120) -> world (0.21, 1.12, ∓0.37)
  const A = {
    footL: new THREE.Vector3(-0.23, 0.48, 0.19),
    footR: new THREE.Vector3(-0.23, 0.48, -0.19),
    kneeL: new THREE.Vector3(-0.02, 0.86, 0.20),
    kneeR: new THREE.Vector3(-0.02, 0.86, -0.20),
    hip: new THREE.Vector3(-0.24, 1.24, 0),
    neck: new THREE.Vector3(0.02, 1.55, 0),
    shoulderL: new THREE.Vector3(0.02, 1.50, 0.21),
    shoulderR: new THREE.Vector3(0.02, 1.50, -0.21),
    elbowL: new THREE.Vector3(0.13, 1.31, 0.33),
    elbowR: new THREE.Vector3(0.13, 1.31, -0.33),
    handL: new THREE.Vector3(0.19, 1.11, 0.36),
    handR: new THREE.Vector3(0.19, 1.11, -0.36),
    head: new THREE.Vector3(0.10, 1.70, 0),
  };
  rider.add(limb(A.footL, A.kneeL, 0.09));
  rider.add(limb(A.footR, A.kneeR, 0.09));
  rider.add(limb(A.kneeL, new THREE.Vector3(A.hip.x, A.hip.y, 0.12), 0.11));
  rider.add(limb(A.kneeR, new THREE.Vector3(A.hip.x, A.hip.y, -0.12), 0.11));
  rider.add(limb(A.hip, A.neck, 0.30, 0.20));
  rider.add(limb(A.shoulderL, A.elbowL, 0.08));
  rider.add(limb(A.shoulderR, A.elbowR, 0.08));
  rider.add(limb(A.elbowL, A.handL, 0.07));
  rider.add(limb(A.elbowR, A.handR, 0.07));
  for (const f of [A.footL, A.footR]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.09, 0.10), riderMat);
    boot.position.copy(f).add(new THREE.Vector3(0.05, -0.02, 0));
    boot.castShadow = true;
    rider.add(boot);
  }
  const helmet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), riderMat);
  helmet.position.copy(A.head);
  helmet.castShadow = true;
  rider.add(helmet);
}
scene.add(rider);

// debug handles
window.__nx = { scene, camera, bike, rider, sun, renderer };

renderer.setAnimationLoop(() => renderer.render(scene, camera));
