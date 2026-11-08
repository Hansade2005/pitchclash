import bpy, math
from mathutils import Vector


def setup_scene(res=(480, 640), samples=16):
    sc = bpy.context.scene
    for n in ('Cube', 'Light', 'Camera'):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('W') if not sc.world else sc.world
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.55, 0.62, 0.7, 1)
    bg.inputs[1].default_value = 0.6
    if 'KeySun' not in bpy.data.objects:
        sun = bpy.data.lights.new('KeySun', 'SUN')
        sun.energy = 3.5
        o = bpy.data.objects.new('KeySun', sun)
        sc.collection.objects.link(o)
        o.rotation_euler = (math.radians(50), 0, math.radians(-35))
        # ground
        me = bpy.data.meshes.new('Ground')
        me.from_pydata([(-10, -10, 0), (10, -10, 0), (10, 10, 0), (-10, 10, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new('Ground', me)
        sc.collection.objects.link(g)
        m = bpy.data.materials.new('GroundMat')
        m.use_nodes = True
        m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12, 0.32, 0.12, 1)
        g.data.materials.append(m)
    if 'PrevCam' not in bpy.data.objects:
        cam = bpy.data.cameras.new('PrevCam')
        co = bpy.data.objects.new('PrevCam', cam)
        sc.collection.objects.link(co)
        sc.camera = co


def shoot(path, view='front', target=(0, 0, 0.92), dist=3.6, lens=50, xoff=0.0):
    co = bpy.data.objects['PrevCam']
    co.data.lens = lens
    t = Vector(target)
    dirs = {'front': Vector((0, -1, 0)), 'side': Vector((1, 0, 0)), 'back': Vector((0, 1, 0)),
            'q': Vector((0.7, -0.7, 0)).normalized(), 'face': Vector((0, -1, 0))}
    d = dirs[view]
    co.location = t + d * dist + Vector((xoff, 0, 0.1))
    co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
