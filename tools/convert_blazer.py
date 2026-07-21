#!/usr/bin/env python3
"""Meshy AI 'Highway Blazer' OBJ -> GLB: scale to real bike length,
ground at y=0, rotate length axis onto +X."""
import numpy as np
import trimesh
from trimesh.transformations import rotation_matrix

SRC = "/Users/chinmayhulyalkar/Downloads/Meshy_AI_Highway_Blazer_0716125425_generate.obj"
DST = "public/blazer.glb"
TARGET_LENGTH = 2.16  # meters, NX500 overall length

mesh = trimesh.load(SRC, process=False, force='mesh')
print(f"loaded: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")

# rotate 90deg about Y: length currently along Z -> onto X
mesh.apply_transform(rotation_matrix(np.pi / 2, [0, 1, 0]))

ext = mesh.bounds[1] - mesh.bounds[0]
scale = TARGET_LENGTH / ext[0]
mesh.apply_scale(scale)

# center x/z, ground at y=0
b = mesh.bounds
offset = [-(b[0][0] + b[1][0]) / 2, -b[0][1], -(b[0][2] + b[1][2]) / 2]
mesh.apply_translation(offset)

mesh.visual = trimesh.visual.TextureVisuals(
    material=trimesh.visual.material.PBRMaterial(
        name="blazer", baseColorFactor=[0.82, 0.11, 0.11, 1.0],
        roughnessFactor=0.5, metallicFactor=0.05))

out = trimesh.Scene({"blazer": mesh})
out.export(DST)
print(f"exported {DST}, scale={scale:.3f}, bounds={np.round(out.bounds, 3).tolist()}")
