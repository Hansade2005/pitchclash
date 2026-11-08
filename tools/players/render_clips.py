"""Render contact strips of every action in the open .blend.
Usage: blender --background x.blend --python render_clips.py -- <prefix> [n_frames] [view] [Clip,Clip]"""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_util as ru
argv = sys.argv[sys.argv.index('--') + 1:]
prefix = argv[0]
nf = int(argv[1]) if len(argv) > 1 else 6
view = argv[2] if len(argv) > 2 else 'side'
only = argv[3].split(',') if len(argv) > 3 else None
ru.setup_scene(res=(220, 300), samples=6)
arm = bpy.data.objects['Armature']
for act in bpy.data.actions:
    if only and act.name not in only:
        continue
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    files = []
    for k in range(nf):
        f = round(f0 + (f1 - f0) * k / max(1, nf - 1))
        bpy.context.scene.frame_set(int(f))
        fn = f'{prefix}_{act.name}_{k}.png'
        ru.shoot(fn, view, dist=4.2)
        files.append(fn)
    print('STRIP', act.name, ' '.join(files))
