"""Build Spellbook's editable card-box scene and render a transparent PNG.

Run in a separate Blender process:
  flatpak run org.blender.Blender --background --factory-startup \
    --python "$PWD/frontend/brand/card-box.py" -- \
    --model "$PWD/frontend/brand/card-box.blend" \
    --render "$PWD/frontend/brand/card-box.png"

Convert the PNG to the web asset with Pillow:
  python -c 'from PIL import Image; Image.open("frontend/brand/card-box.png").save(
    "frontend/static/brand/card-box.webp", quality=90, method=6)'

All geometry and materials are procedural. No external models or textures are used.
The script creates its own scene and leaves other scenes and objects intact.
"""

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def material(name, color, roughness=0.35, metallic=0.0):
    rgb = tuple(int(color[i : i + 2], 16) / 255 for i in (0, 2, 4))
    linear = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb)
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*linear, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Specular IOR Level"].default_value = 0.3
    return result


def mesh_object(name, outline, depth, location, surface, bevel=0.012):
    """Extrude an x/z outline along y to retain wide card corner radii."""
    n = len(outline)
    vertices = [(x, y, z) for y in (-depth / 2, depth / 2) for x, z in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces.extend((i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft physical edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.affect = "EDGES"
        normal = obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
    return obj


def rounded_panel(name, width, height, radius, depth, location, surface, bevel=0.008):
    outline = []
    for cx, cz, angle in (
        (width / 2 - radius, height / 2 - radius, 0),
        (-width / 2 + radius, height / 2 - radius, 90),
        (-width / 2 + radius, -height / 2 + radius, 180),
        (width / 2 - radius, -height / 2 + radius, 270),
    ):
        for step in range(9):
            theta = math.radians(angle + step * 90 / 8)
            outline.append((cx + radius * math.cos(theta), cz + radius * math.sin(theta)))
    return mesh_object(name, outline, depth, location, surface, bevel)


def block(name, dimensions, location, surface, bevel=0.06):
    x, y, z = dimensions
    outline = [(-x / 2, -z / 2), (x / 2, -z / 2), (x / 2, z / 2), (-x / 2, z / 2)]
    return mesh_object(name, outline, y, location, surface, bevel)


def light(name, location, power, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1.5)) - obj.location).to_track_quat("-Z", "Y").to_euler()


parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--render", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
model_path = Path(args.model).resolve()
render_path = Path(args.render).resolve()
model_path.parent.mkdir(parents=True, exist_ok=True)
render_path.parent.mkdir(parents=True, exist_ok=True)

scene = bpy.data.scenes.new("Spellbook card box")
bpy.context.window.scene = scene
graphite = material("Graphite powder coat", "242b39", 0.3, 0.28)
liner = material("Soft dark liner", "111725", 0.65)
label = material("Ivory label and card edges", "edf2f4", 0.36)
sleeves = [
    material("Violet sleeves", "6752d9", 0.27),
    material("Blue sleeves", "287ada", 0.27),
    material("Cyan sleeves", "16bdd5", 0.27),
    material("Teal sleeves", "129c93", 0.27),
]

block("Box base", (2.85, 2.70, 0.20), (0, 0, 0.10), graphite)
block("Interior liner", (2.53, 2.36, 0.05), (0, 0, 0.225), liner, 0.018)
block("Right wall", (0.16, 2.70, 1.48), (1.345, 0, 0.84), graphite)
block("Left wall", (0.16, 2.70, 1.48), (-1.345, 0, 0.84), graphite)
block("Rear wall", (2.61, 0.16, 1.48), (0, 1.27, 0.84), graphite)
front_outline = [
    (-1.425, 0.08), (1.425, 0.08), (1.425, 1.58), (0.90, 1.58),
    (0.61, 1.26), (-0.61, 1.26), (-0.90, 1.58), (-1.425, 1.58),
]
mesh_object("Notched front wall", front_outline, 0.16, (0, -1.27, 0), graphite, 0.055)
rounded_panel("Blank front label", 1.05, 0.25, 0.045, 0.026, (0, -1.365, 0.59), label)

for group, surface in enumerate(sleeves):
    for card in range(6):
        y = -1.00 + group * 0.55 + card * 0.072
        z = 1.79 + group * 0.045
        prefix = f"Group {group + 1} card {card + 1}"
        rounded_panel(prefix + " sleeve", 2.20, 3.06, 0.16, 0.046, (0, y, z), surface)
        if card == 0:
            rounded_panel(prefix + " border", 2.08, 2.94, 0.14, 0.012, (0, y - 0.029, z), label, 0.003)
            rounded_panel(prefix + " back", 1.97, 2.83, 0.12, 0.012, (0, y - 0.038, z), surface, 0.003)

star = [(0, 0.39), (0.115, 0.12), (0.36, 0), (0.115, -0.12),
        (0, -0.39), (-0.115, -0.12), (-0.36, 0), (-0.115, 0.12)]
mesh_object("Front sleeve collection mark", star, 0.012, (0, -1.047, 2.27), label, 0.005)

world = bpy.data.worlds.new("Neutral studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.16, 0.19, 0.25, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3
scene.world = world
light("Large warm key", (-4, -5, 7), 1150, 5.0, (1.0, 0.95, 0.90))
light("Cool right fill", (5, -1, 4.5), 1000, 4.0, (0.78, 0.89, 1.0))
light("Top edge light", (0, 4, 7), 1400, 3.0, (0.87, 0.96, 1.0))

camera_data = bpy.data.cameras.new("Product camera")
camera = bpy.data.objects.new("Product camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (5.7, -8, 5.2)
camera.rotation_euler = (Vector((0, 0, 1.72)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 5.55
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1200
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(render_path)
scene.view_settings.view_transform = "AgX"
scene.view_settings.exposure = -0.35
scene.render.image_settings.color_depth = "8"
scene["asset_role"] = "Static product illustration, not the supplied logo or a browser icon"
scene["geometry"] = "24 sleeve cards in four color groups, open graphite storage box, blank front label"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(model_path), compress=True)
bpy.ops.render.render(write_still=True)
print(f"Rendered {render_path}; editable model {model_path}")
