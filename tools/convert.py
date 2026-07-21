#!/usr/bin/env python3
"""OBJ -> GLB for the NX500: strips the antenna accessory, splits wheels into
a separate black-material mesh, rescales mm -> m, and rotates Z-up -> Y-up."""
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix

SRC = "public/nx500.obj"
DST = "public/nx500.glb"

scene = trimesh.load(SRC, process=False)
geoms = [g for name, g in scene.geometry.items()
         if "Part2Mtl" not in name and "Part3Mtl" not in name]
mesh = trimesh.util.concatenate(geoms)
print(f"merged: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")

c = mesh.triangles.mean(axis=1)
antenna = (c[:, 0] > -860) & (c[:, 0] < -560) & (c[:, 2] > 1195)
wheel = ((np.abs(c[:, 1]) < 140) & (c[:, 2] < 740) &
         ((np.hypot(c[:, 0] - 681, c[:, 2] - 325) < 400) |
          (np.hypot(c[:, 0] + 681, c[:, 2] - 325) < 400)))
print(f"wheel faces: {wheel.sum()}, antenna faces: {antenna.sum()}")

body = mesh.submesh([np.where(~wheel & ~antenna)[0]], append=True)
wheels = mesh.submesh([np.where(wheel)[0]], append=True)

xform = rotation_matrix(-np.pi / 2, [1, 0, 0])
xform[:3, :3] *= 0.001
for m in (body, wheels):
    m.apply_transform(xform)

body.visual = trimesh.visual.TextureVisuals(
    material=trimesh.visual.material.PBRMaterial(
        name="bikeRed", baseColorFactor=[0.82, 0.11, 0.11, 1.0],
        roughnessFactor=0.45, metallicFactor=0.05))
wheels.visual = trimesh.visual.TextureVisuals(
    material=trimesh.visual.material.PBRMaterial(
        name="wheelBlack", baseColorFactor=[0.055, 0.055, 0.065, 1.0],
        roughnessFactor=0.9, metallicFactor=0.0))

out = trimesh.Scene({"body": body, "wheels": wheels})
out.export(DST)
bounds = out.bounds
print(f"exported {DST}, bounds (m): {np.round(bounds, 3).tolist()}")
