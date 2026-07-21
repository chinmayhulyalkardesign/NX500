#!/usr/bin/env python3
"""Meshy 'Highway Blazer' GLB -> oriented, grounded, wheel-split GLB.
Wheels become separate nodes with origins at their axles so they can
spin (rotation.z) and later steer. Decimation happens afterwards via
gltf-transform."""
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix, translation_matrix

SRC = "/Users/chinmayhulyalkar/Downloads/Meshy_AI_Highway_Blazer_0716131517_generate.glb"
DST = "public/blazer-split.glb"
TARGET_LENGTH = 2.16

mesh = trimesh.load(SRC, process=False, force='mesh')
print(f"loaded: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")

# orient: length Z -> X, scale to real length, ground at y=0, center x/z
mesh.apply_transform(rotation_matrix(np.pi / 2, [0, 1, 0]))
ext = mesh.bounds[1] - mesh.bounds[0]
mesh.apply_scale(TARGET_LENGTH / ext[0])
b = mesh.bounds
mesh.apply_translation([-(b[0][0] + b[1][0]) / 2, -b[0][1], -(b[0][2] + b[1][2]) / 2])

# ---- find the two wheel axles from low, laterally-centered geometry ----
v = mesh.vertices
low = v[(v[:, 1] < 0.75) & (np.abs(v[:, 2]) < 0.15)]
axles = {}
for name, sel in (("wheelF", low[:, 0] > 0.3), ("wheelR", low[:, 0] < -0.3)):
    c = low[sel]
    ax = (c[:, 0].min() + c[:, 0].max()) / 2
    r = c[:, 1].max() / 2
    axles[name] = (ax, r)
    print(f"{name}: axle x={ax:.3f}, center y={r:.3f}, radius~{r:.3f}")

# ---- classify faces ----
cent = mesh.triangles.mean(axis=1)
masks = {}
taken = np.zeros(len(cent), dtype=bool)
for name, (ax, r) in axles.items():
    m = (np.abs(cent[:, 2]) < 0.14) & \
        (np.hypot(cent[:, 0] - ax, cent[:, 1] - r) < r * 1.06) & ~taken
    masks[name] = m
    taken |= m
    print(f"{name}: {m.sum()} faces")

scene = trimesh.Scene()
body = mesh.submesh([np.where(~taken)[0]], append=True)
scene.add_geometry(body, node_name="body", geom_name="body")
for name, (ax, r) in axles.items():
    w = mesh.submesh([np.where(masks[name])[0]], append=True)
    w.apply_translation([-ax, -r, 0])  # origin at axle
    scene.add_geometry(w, node_name=name, geom_name=name,
                       transform=translation_matrix([ax, r, 0]))

scene.export(DST)
print(f"exported {DST}")
