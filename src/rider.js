import { Vector3, MeshBuilder, TransformNode } from '@babylonjs/core';

// ---- bike anchor points, measured from the NX500 mesh (meters, Y-up, +X front) ----
export const BIKE_ANCHORS = {
  pegL: new Vector3(-0.23, 0.47, 0.18),
  pegR: new Vector3(-0.23, 0.47, -0.18),
  gripL: new Vector3(0.19, 1.12, 0.36),
  gripR: new Vector3(0.19, 1.12, -0.36),
  seatHeight: 0.83,
};

// ---- rider joint targets per pose (derived from anchors + 175cm proportions) ----
const POSES = {
  seated: {
    footL: new Vector3(-0.21, 0.48, 0.19), footR: new Vector3(-0.21, 0.48, -0.19),
    kneeL: new Vector3(0.02, 0.74, 0.20), kneeR: new Vector3(0.02, 0.74, -0.20),
    hipL: new Vector3(-0.26, 0.86, 0.10), hipR: new Vector3(-0.26, 0.86, -0.10),
    pelvis: new Vector3(-0.28, 0.90, 0),
    neck: new Vector3(-0.10, 1.35, 0),
    shoulderL: new Vector3(-0.11, 1.31, 0.19), shoulderR: new Vector3(-0.11, 1.31, -0.19),
    elbowL: new Vector3(0.0, 1.11, 0.33), elbowR: new Vector3(0.0, 1.11, -0.33),
    handL: BIKE_ANCHORS.gripL, handR: BIKE_ANCHORS.gripR,
    head: new Vector3(-0.04, 1.47, 0),
  },
  standing: {
    footL: new Vector3(-0.21, 0.48, 0.19), footR: new Vector3(-0.21, 0.48, -0.19),
    kneeL: new Vector3(0.02, 0.80, 0.20), kneeR: new Vector3(0.02, 0.80, -0.20),
    hipL: new Vector3(-0.30, 1.08, 0.11), hipR: new Vector3(-0.30, 1.08, -0.11),
    pelvis: new Vector3(-0.32, 1.12, 0),
    neck: new Vector3(-0.02, 1.52, 0),
    shoulderL: new Vector3(-0.03, 1.48, 0.19), shoulderR: new Vector3(-0.03, 1.48, -0.19),
    elbowL: new Vector3(0.08, 1.26, 0.33), elbowR: new Vector3(0.08, 1.26, -0.33),
    handL: BIKE_ANCHORS.gripL, handR: BIKE_ANCHORS.gripR,
    head: new Vector3(0.06, 1.62, 0),
  },
};

/**
 * Rider built from capsules/spheres so its silhouette matches the smooth bike mesh.
 * @param scene Babylon scene
 * @param mats { body, dark } materials (suit, gloves/boots/visor)
 * @param onMesh optional callback per created mesh (shadows etc.)
 */
export function createRider(scene, mats, onMesh = () => {}) {
  const root = new TransformNode('rider', scene);
  let current = null;

  function register(m, mat) {
    m.material = mat;
    m.parent = root;
    onMesh(m);
    return m;
  }

  // tapered capsule limb aligned from -> to (rTo = radius at the "to" end)
  function limb(from, to, rFrom, rTo, mat) {
    const dir = to.subtract(from);
    const len = dir.length();
    const c = MeshBuilder.CreateCapsule('limb', {
      height: len + (rFrom + rTo) * 0.5,
      radiusTop: rTo,
      radiusBottom: rFrom,
      tessellation: 14,
      capSubdivisions: 4,
      orientation: new Vector3(0, 0, 1),
    }, scene);
    c.position = from.add(dir.scale(0.5));
    c.lookAt(to);
    return register(c, mat);
  }

  function ball(name, r, pos, mat, scale = null) {
    const s = MeshBuilder.CreateSphere(name, { diameter: r * 2, segments: 12 }, scene);
    s.position = pos;
    if (scale) s.scaling = scale;
    return register(s, mat);
  }

  function build(poseName) {
    for (const c of [...root.getChildMeshes()]) c.dispose();
    const P = POSES[poseName];

    // legs: shin (foot->knee), thigh (knee->hip), rounded joints
    limb(P.footL, P.kneeL, 0.050, 0.062, mats.body); limb(P.footR, P.kneeR, 0.050, 0.062, mats.body);
    limb(P.kneeL, P.hipL, 0.062, 0.080, mats.body); limb(P.kneeR, P.hipR, 0.062, 0.080, mats.body);
    ball('kneeL', 0.066, P.kneeL, mats.body); ball('kneeR', 0.066, P.kneeR, mats.body);

    // pelvis: capsule across the hips
    limb(P.hipL, P.hipR, 0.095, 0.095, mats.body);

    // torso: tapered capsule, flattened front-to-back
    const torso = limb(P.pelvis, P.neck, 0.125, 0.165, mats.body);
    torso.scaling.y = 0.72;

    // shoulders + arms
    ball('shoulderL', 0.062, P.shoulderL, mats.body); ball('shoulderR', 0.062, P.shoulderR, mats.body);
    limb(P.shoulderL, P.elbowL, 0.048, 0.044, mats.body); limb(P.shoulderR, P.elbowR, 0.048, 0.044, mats.body);
    limb(P.elbowL, P.handL, 0.042, 0.038, mats.body); limb(P.elbowR, P.handR, 0.042, 0.038, mats.body);

    // gloves on the grips
    ball('gloveL', 0.052, P.handL, mats.dark); ball('gloveR', 0.052, P.handR, mats.dark);

    // boots on the pegs (rounded, toe forward)
    for (const [name, f] of [['bootL', P.footL], ['bootR', P.footR]]) {
      const heel = f.add(new Vector3(-0.06, -0.02, 0));
      const toe = f.add(new Vector3(0.15, -0.02, 0));
      limb(heel, toe, 0.048, 0.042, mats.dark).name = name;
    }

    // neck + helmet + visor
    limb(P.neck, P.head, 0.045, 0.045, mats.body);
    ball('helmet', 0.125, P.head, mats.body, new Vector3(1, 1.04, 0.94));
    ball('visor', 0.09, P.head.add(new Vector3(0.075, -0.005, 0)), mats.dark, new Vector3(0.55, 0.75, 1));

    current = poseName;
  }

  build('seated');
  return {
    root,
    get pose() { return current; },
    setPose(name) { if (POSES[name] && name !== current) build(name); },
    toggle() { build(current === 'seated' ? 'standing' : 'seated'); },
  };
}
