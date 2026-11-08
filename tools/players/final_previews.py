"""Rest / mid-Run / mid-Shoot previews (front+side) for a *_anim.blend. Shirt tinted for readability (not saved)."""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_util as ru
argv = sys.argv[sys.argv.index('--') + 1:]
prefix, tint = argv[0], argv[1:4]
cols = [tuple(int(t[i:i+2], 16) / 255 for i in (0, 2, 4)) for t in tint]
for name, c in zip(('Shirt', 'Shorts', 'Socks'), cols):
    m = bpy.data.materials[name]
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (c[0]**2.2, c[1]**2.2, c[2]**2.2, 1)
ru.setup_scene(res=(420, 600), samples=24)
arm = bpy.data.objects['Armature']
def setact(n, frac):
    a = bpy.data.actions[n]; arm.animation_data.action = a
    if a.slots: arm.animation_data.action_slot = a.slots[0]
    f0, f1 = a.frame_range; bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * frac)))
arm.animation_data.action = None
for pb in arm.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
bpy.context.scene.frame_set(0)
ru.shoot(prefix + '_rest_front.png', 'front'); ru.shoot(prefix + '_rest_side.png', 'side')
setact('Run', 0.3); ru.shoot(prefix + '_run_front.png', 'front'); ru.shoot(prefix + '_run_side.png', 'side')
setact('Shoot', 0.62); ru.shoot(prefix + '_shoot_front.png', 'front'); ru.shoot(prefix + '_shoot_side.png', 'side')
