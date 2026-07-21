import { Quaternion, TransformNode, Vector3, SceneLoader } from '@babylonjs/core';
import { terrainHeight, surfaceAt } from './terrain.js';

const WHEELBASE = 1.38;
const WHEEL_RADIUS = 0.375;
const GRAVITY = 15.5;            // gamey gravity: crisp landings, still jumpable
const FRONT_AXLE = new Vector3(0.69, 0.375, 0);

export class Bike {
  constructor(scene, shadows) {
    this.scene = scene;
    this.shadows = shadows;
    this.root = new TransformNode('bikeRoot', scene);
    this.model = null;
    this.wheelF = null;
    this.wheelR = null;
    this.steerPivot = null;
    this.reset();
  }

  reset() {
    this.x = -150; this.z = 0;
    this.y = terrainHeight(this.x, this.z);
    this.heading = 0;             // +X
    this.velHeading = 0;          // velocity direction trails heading (tire slip)
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this.lean = 0;
    this.pitch = 0;
    this.steerVis = 0;
    this.bump = 0;
    this.wheelAngle = 0;
    this.surface = surfaceAt(this.x, this.z);
  }

  async load(mats) {
    const result = await SceneLoader.ImportMeshAsync(null, '/', 'blazer.glb', this.scene);
    for (const m of result.meshes) {
      if (m.getTotalVertices && m.getTotalVertices() > 0) {
        m.material = /wheel/i.test(m.name) ? mats.tire
          : /rider/i.test(m.name) ? mats.rider : mats.body;
        m.receiveShadows = true;
        this.shadows.addShadowCaster(m);
      }
      if (/wheelF/i.test(m.name)) this.wheelF = m;
      if (/wheelR/i.test(m.name)) this.wheelR = m;
      if (m.name === '__root__') this.model = m;
    }
    this.model.parent = this.root;

    // steering pivot at the front axle so the wheel can turn with the bars
    this.steerPivot = new TransformNode('steerPivot', this.scene);
    this.steerPivot.parent = this.wheelF.parent;
    this.steerPivot.position = FRONT_AXLE.clone();
    this.wheelF.parent = this.steerPivot;
    this.wheelF.position = Vector3.Zero();
  }

  update(dt, input) {
    const surf = surfaceAt(this.x, this.z);
    this.surface = surf;

    // ---- longitudinal ----
    const throttle = input.throttle ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    let accel = throttle * surf.accel * Math.max(0, 1 - this.speed / surf.top);
    accel -= brake * 13 * Math.sign(this.speed || 1);
    accel -= surf.drag * 0.12 * this.speed;                  // rolling + aero
    if (this.grounded) this.speed += accel * dt;
    this.speed = Math.max(0, Math.min(this.speed, 48));

    // ---- steering: lean-first model. Input banks the bike; the lean carves the turn.
    // yawRate = g*tan(lean)/v is the physics of a coordinated motorcycle turn, so the
    // same lean naturally turns tight at low speed and sweeps wide at high speed.
    const steerDir = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const leanTarget = steerDir * 0.60 * Math.min(1, 0.25 + this.speed / 14);
    const leanRate = steerDir !== 0 ? 4.2 : 6.0;             // bank in smooth, stand up quicker
    if (this.grounded) {
      this.lean += (leanTarget - this.lean) * Math.min(1, dt * leanRate);
      if (this.speed > 0.5) {
        const effV = Math.max(this.speed, 5.5);
        let yawRate = (1.28 * 9.81 * Math.tan(this.lean)) / effV;
        yawRate *= Math.min(1, this.speed / 3);              // no pivoting at a standstill
        this.heading += yawRate * dt;
      }
    } else {
      this.lean *= 1 - Math.min(1, dt * 1.5);
    }
    // visual bar angle follows the lean
    this.steerVis += (this.lean * 0.5 - this.steerVis) * Math.min(1, dt * 10);

    // ---- move: velocity direction tracks heading tightly (trace drift on dirt only) ----
    const slipRate = 8 + 16 * surf.grip;
    let dh = this.heading - this.velHeading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.velHeading += dh * Math.min(1, dt * slipRate);
    const fx = Math.cos(this.velHeading), fz = -Math.sin(this.velHeading);
    this.x += this.speed * fx * dt;
    this.z += this.speed * fz * dt;

    // keep inside the world: clamp, mild scrub, keep sliding along the edge
    const LIM = 160;
    if (Math.abs(this.x) > LIM) { this.x = Math.sign(this.x) * LIM; this.speed *= 0.995; }
    if (Math.abs(this.z) > LIM) { this.z = Math.sign(this.z) * LIM; this.speed *= 0.995; }

    // ---- vertical: suspension-smoothed ground follow, airborne only off real crests ----
    const groundY = terrainHeight(this.x, this.z);
    if (this.grounded) {
      const prevY = this.y;
      const fallRate = (prevY - groundY) / dt;
      if (fallRate > 7.0 && this.speed > 11) {               // ground genuinely falls away
        this.grounded = false;
        this.vy = 0;
      } else {
        // spring the chassis toward ground height instead of snapping
        this.y += (groundY - this.y) * Math.min(1, dt * 14);
        if (groundY > this.y) this.y = Math.max(this.y, groundY - 0.12); // never sink deep
      }
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= groundY) {
        this.y = groundY;
        this.grounded = true;
        if (this.vy < -4) this.speed *= 0.94;                // only hard landings scrub
        this.vy = 0;
      }
    }

    // ---- pitch from slope (sampled along heading) ----
    const hAhead = terrainHeight(this.x + fx * 0.7, this.z + fz * 0.7);
    const hBehind = terrainHeight(this.x - fx * 0.7, this.z - fz * 0.7);
    let pitchTarget = Math.atan2(hAhead - hBehind, 1.4);
    if (!this.grounded) pitchTarget = Math.max(-0.35, Math.min(0.15, this.vy * 0.045));
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 8);

    // ---- dirt chatter (visual, subtle) ----
    const bumpTarget = this.grounded && this.speed > 4
      ? surf.bump * Math.sin(this.x * 4.1 + this.z * 3.3) : 0;
    this.bump += (bumpTarget - this.bump) * Math.min(1, dt * 12);

    // ---- apply to nodes ----
    this.root.position.set(this.x, this.y + 0.02 + this.bump, this.z);
    this.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
      this.heading, this.lean, pitchToRoll(this.pitch));
    this.wheelAngle -= (this.speed / WHEEL_RADIUS) * dt;
    if (this.wheelF) this.wheelF.rotation.z = this.wheelAngle;
    if (this.wheelR) this.wheelR.rotation.z = this.wheelAngle;
    if (this.steerPivot) this.steerPivot.rotation.y = this.steerVis * 0.7;
  }

  get forward() {
    return new Vector3(Math.cos(this.velHeading), 0, -Math.sin(this.velHeading));
  }

  get kmh() { return Math.round(this.speed * 3.6); }
}

// model forward is +X, so nose pitch is rotation about Z (negated: nose up on climb)
function pitchToRoll(pitch) { return -pitch; }
