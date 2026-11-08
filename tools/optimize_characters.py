# Headless Blender script: strip weapons/accessories and unused animations from KayKit characters.
# Usage: blender --background --factory-startup --python optimize_characters.py -- <in.glb> <out.glb>
import bpy, sys, re
argv = sys.argv[sys.argv.index('--') + 1:]
src, dst = argv
KEEP_ANIMS = {'Unarmed_Idle', 'Running_A', 'Running_B', 'Unarmed_Melee_Attack_Kick', 'Dodge_Forward', 'Dodge_Left',
              'Dodge_Right', 'Throw', 'Cheer', 'Hit_A', 'Running_Strafe_Left', 'Running_Strafe_Right', 'Unarmed_Pose', '2H_Melee_Idle'}
BODY = re.compile(r'_(Body|Head|ArmLeft|ArmRight|LegLeft|LegRight)$')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
removed = [o.name for o in list(bpy.data.objects) if o.type == 'MESH' and not BODY.search(o.name)]
for n in removed: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
# clear NLA tracks so only actions we keep are exported
for o in bpy.data.objects:
    if o.animation_data:
        for t in list(o.animation_data.nla_tracks): o.animation_data.nla_tracks.remove(t)
        o.animation_data.action = None
for a in list(bpy.data.actions):
    base = a.name.split('.')[0]
    if base not in KEEP_ANIMS: bpy.data.actions.remove(a)
    else: a.use_fake_user = True
print('kept actions:', sorted(a.name for a in bpy.data.actions))
print('removed meshes:', removed)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animation_mode='ACTIONS', export_apply=False,
                          export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False)
