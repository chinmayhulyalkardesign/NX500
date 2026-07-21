#!/usr/bin/env python3
"""Meshy bike+rider GLB -> oriented, grounded, wheel-split GLB.
Usage: split_hero.py <src.glb> <dst.glb> [target_length_m] [rot] [rider]
rot: 'z2x' (length was along Z, default) | 'none' (already along X)
     | 'flip' (along X but facing -X) | 'z2x+flip'
rider: pass 'rider' to also split the rider figure into its own node
       (heuristic: above the tank line behind the screen + leg zones at the flanks)"""
import sys
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix, translation_matrix

SRC = sys.argv[1]
DST = sys.argv[2]
TARGET_LENGTH = float(sys.argv[3]) if len(sys.argv) > 3 else 2.16
ROT = sys.argv[4] if len(sys.argv) > 4 else 'z2x'

mesh = trimesh.load(SRC, process=False, force='mesh')
print(f"loaded: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")

ANGLES = {'z2x': np.pi / 2, 'none': 0, 'flip': np.pi, 'z2x+flip': -np.pi / 2}
if ANGLES.get(ROT, 0):
    mesh.apply_transform(rotation_matrix(ANGLES[ROT], [0, 1, 0]))
ext = mesh.bounds[1] - mesh.bounds[0]
mesh.apply_scale(TARGET_LENGTH / ext[0])
b = mesh.bounds
mesh.apply_translation([-(b[0][0] + b[1][0]) / 2, -b[0][1], -(b[0][2] + b[1][2]) / 2])
print(f"oriented, bounds: {np.round(mesh.bounds, 3).tolist()}")

v = mesh.vertices
low = v[(v[:, 1] < 0.75) & (np.abs(v[:, 2]) < 0.15)]
axles = {}
for name, sel in (("wheelF", low[:, 0] > 0.3), ("wheelR", low[:, 0] < -0.3)):
    c = low[sel]
    ax = (c[:, 0].min() + c[:, 0].max()) / 2
    r = c[:, 1].max() / 2
    axles[name] = (ax, r)
    print(f"{name}: axle x={ax:.3f}, radius~{r:.3f}")

cent = mesh.triangles.mean(axis=1)
taken = np.zeros(len(cent), dtype=bool)
masks = {}
for name, (ax, r) in axles.items():
    m = (np.abs(cent[:, 2]) < 0.14) & \
        (np.hypot(cent[:, 0] - ax, cent[:, 1] - r) < r * 1.06) & ~taken
    masks[name] = m
    taken |= m
    print(f"{name}: {m.sum()} faces")

# per-model rider-zone presets: bikes differ in fairing width and screen height
RIDER_PRESETS = {
    # torso: list of (yMin, xMax); pelvis: (yMin, yMax, xMin, xMax) or None
    # legs/boots: (yMin, yMax, zMin, xMin, xMax) or None
    'desert': dict(
        torso=[(1.02, 0.32), (1.35, 0.55)],
        pelvis=None,
        legs=(0.42, 1.02, 0.165, -0.62, 0.30),
        boots=None),
    'blazer': dict(
        # arms/chest/helmet above the tank line; lower back behind the tank
        torso=[(1.10, 0.34), (1.02, -0.05)],
        pelvis=(0.86, 1.02, -0.48, -0.08),
        legs=(0.36, 1.02, 0.185, -0.50, 0.12),
        boots=(0.30, 0.42, 0.15, -0.42, -0.02)),
}

scene = trimesh.Scene()
if len(sys.argv) > 5 and sys.argv[5] in RIDER_PRESETS:
    P = RIDER_PRESETS[sys.argv[5]]
    rider = np.zeros(len(cent), dtype=bool)
    for yMin, xMax in P['torso']:
        rider |= (cent[:, 1] > yMin) & (cent[:, 0] < xMax)
    for zone in (P['pelvis'],):
        if zone:
            yMin, yMax, xMin, xMax = zone
            rider |= (cent[:, 1] > yMin) & (cent[:, 1] <= yMax) & \
                     (cent[:, 0] > xMin) & (cent[:, 0] < xMax) & (np.abs(cent[:, 2]) < 0.17)
    for zone in (P['legs'], P['boots']):
        if zone:
            yMin, yMax, zMin, xMin, xMax = zone
            rider |= (cent[:, 1] > yMin) & (cent[:, 1] <= yMax) & \
                     (np.abs(cent[:, 2]) > zMin) & (cent[:, 0] > xMin) & (cent[:, 0] < xMax)
    rider &= ~taken
    taken |= rider
    print(f"rider: {rider.sum()} faces")
    scene.add_geometry(mesh.submesh([np.where(rider)[0]], append=True),
                       node_name="rider", geom_name="rider")
scene.add_geometry(mesh.submesh([np.where(~taken)[0]], append=True),
                   node_name="body", geom_name="body")
for name, (ax, r) in axles.items():
    w = mesh.submesh([np.where(masks[name])[0]], append=True)
    w.apply_translation([-ax, -r, 0])
    scene.add_geometry(w, node_name=name, geom_name=name,
                       transform=translation_matrix([ax, r, 0]))
scene.export(DST)
print(f"exported {DST}")
