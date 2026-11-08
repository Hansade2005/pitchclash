"""Add all animation clips to a built character .blend and export the .glb.

Usage: blender --background <char.blend> --python make_anims.py -- <out.glb> [--keeper] [--save out.blend] [--only Clip,Clip]
"""
import bpy, sys, os, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import retarget as rt
import anim_lib as al
from anim_lib import Anim, mocap, pose_anim, axis_rot
from bvh import BVH

DATA = '/home/user/assets-src/cmu-mocap/repo/data'
_cache = {}


def bvh(name):
    if name not in _cache:
        sub = name.split('_')[0].zfill(3)
        _cache[name] = BVH(f'{DATA}/{sub}/{name}.bvh')
    return _cache[name]


def ramp(i, n, a, b, va=0.0, vb=1.0):
    """Smooth ramp of value between output-frame fractions a..b."""
    t = i / max(1, n - 1)
    if t <= a:
        return va
    if t >= b:
        return vb
    x = (t - a) / (b - a)
    x = x * x * (3 - 2 * x)
    return va + (vb - va) * x


def bump(i, n, a, peak, b, amp):
    t = i / max(1, n - 1)
    if t <= a or t >= b:
        return 0.0
    if t < peak:
        x = (t - a) / (peak - a)
    else:
        x = (b - t) / (b - peak)
    return amp * (x * x * (3 - 2 * x))


X = (1, 0, 0)   # pitch axis (character left). Positive = bend forward / nose down
Y = (0, 1, 0)   # roll axis
Z = (0, 0, 1)   # yaw


# ============================================================================ clip builders
def clip_idle(arm, curl):
    a = mocap(arm, bvh('137_28'), 2281, 2641, loop=True, loop_k=15, heading='face', curl=curl)
    return al.apply_ground(arm, a, 'min')


def clip_jog(arm, curl):
    b = bvh('16_36')
    e, _ = rt.find_cycle(b, 40, 60, 110)
    a = mocap(arm, b, 40, e, loop=True, loop_k=4, curl=curl)
    return al.apply_ground(arm, a, 'min')


def clip_run(arm, curl):
    b = bvh('127_07')
    e, _ = rt.find_cycle(b, 30, 55, 100)
    a = mocap(arm, b, 30, e, loop=True, loop_k=4, curl=curl)
    return al.apply_ground(arm, a, 'min')


def clip_sprint(arm, curl):
    b = bvh('143_01')
    e, _ = rt.find_cycle(b, 10, 50, 80)
    tw = [('spine_01', lambda i, n: axis_rot(X, 8))]
    a = mocap(arm, b, 10, e, loop=True, loop_k=3, curl=curl, tweaks=tw)
    return al.apply_ground(arm, a, 'min')


def clip_dribble(arm, curl):
    # jog with shorter, quicker steps and a lower, forward-leaning upper body
    b = bvh('16_36')
    e, _ = rt.find_cycle(b, 40, 60, 110)
    tw = [('spine_01', lambda i, n: axis_rot(X, 9))]
    a = mocap(arm, b, 40, e, speed=1.15, loop=True, loop_k=4, curl=curl, tweaks=tw)
    return al.apply_ground(arm, a, 'min')


def clip_shoot(arm, curl):
    b = bvh('10_02')
    a = mocap(arm, b, 292, 388, duration=0.8, heading='face', curl=curl, heading_frames=list(range(330, 350)))
    return al.apply_ground(arm, a, 'min')


def clip_pass(arm, curl):
    b = bvh('10_05')
    # turn the kicking leg outward during the swing -> side-foot contact
    n_src = 330 - 258

    def leg_out(i, n):
        return axis_rot(Z, -ramp(i, n, 0.25, 0.5, 0, 28) + ramp(i, n, 0.75, 1.0, 0, 28))
    tw = [('thigh_r', leg_out)]
    a = mocap(arm, b, 258, 330, duration=0.6, heading='face', curl=curl, tweaks=tw,
              heading_frames=list(range(280, 300)))
    return al.apply_ground(arm, a, 'min')


def clip_header(arm, curl):
    b = bvh('13_39')
    # nod: lean back then snap forward around the jump apex (~frame 175 of 120..240)
    def spine_nod(i, n):
        return axis_rot(X, -bump(i, n, 0.15, 0.40, 0.55, 14) + bump(i, n, 0.42, 0.55, 0.8, 24))

    def neck_nod(i, n):
        return axis_rot(X, -bump(i, n, 0.2, 0.42, 0.52, 18) + bump(i, n, 0.45, 0.55, 0.75, 32))
    tw = [('spine_02', spine_nod), ('neck_01', neck_nod)]
    a = mocap(arm, b, 125, 235, duration=0.75, heading='face', curl=curl, tweaks=tw)
    return al.apply_ground(arm, a, 'min')


def clip_celebrate(arm, curl):
    b = bvh('79_69')
    a = mocap(arm, b, 105, 345, loop=True, loop_k=10, heading='face', curl=None)
    return al.apply_ground(arm, a, 'min')


def clip_fall(arm, curl):
    fall = mocap(arm, bvh('90_16'), 285, 470, duration=0.75, heading='travel', curl=curl,
                 heading_frames=list(range(300, 460)))
    getup = mocap(arm, bvh('140_01'), 150, 545, duration=1.35, heading='head', curl=curl,
                  yaw_track=None, heading_frames=[150])
    a = al.crossfade_concat(fall, getup, 4)
    clr = {('hand_l', 'tail'): 0.02, ('hand_r', 'tail'): 0.02, ('head', 'tail'): 0.03, ('head', 'head'): 0.09,
           ('calf_l', 'head'): 0.05, ('calf_r', 'head'): 0.05, ('spine_03', 'head'): 0.11, ('spine_02', 'head'): 0.11,
           ('pelvis', 'head'): 0.11, ('lowerarm_l', 'head'): 0.04, ('lowerarm_r', 'head'): 0.04}
    body_pts = [(b, w, c) for (b, w), c in clr.items()]
    return al.apply_ground(arm, a, 'all', extra_pts=body_pts)


# ---------------------------------------------------------------- hand-keyed
STAND = dict(upperarm_l=(0.25, 0.05, -1), lowerarm_l=(0.12, -0.25, -1), upperarm_r=(-0.25, 0.05, -1),
             lowerarm_r=(-0.12, -0.25, -1), thigh_l=(0.06, 0, -1), calf_l=(0.04, 0.02, -1), foot_l=(0, -1, -0.5),
             thigh_r=(-0.06, 0, -1), calf_r=(-0.04, 0.02, -1), foot_r=(0, -1, -0.5))


def P(**kw):
    d = dict(STAND)
    d.update(kw)
    return d


def clip_tackle(arm, curl):
    # slide tackle, right leg leads, in place. Legs/arms given in world space.
    slide = dict(legs_world=True, arms_world=True, root=(-55, 12, 0), spine=(18, 0, 8), neck=(25, 0, 0), z=0.24,
                 thigh_r=(-0.12, -1, -0.12), calf_r=(-0.1, -1, -0.12), foot_r=(-0.1, -0.5, 1),
                 thigh_l=(0.45, -0.75, -0.35), calf_l=(0.15, 0.6, -0.55), foot_l=(0.1, 0.2, -1),
                 upperarm_l=(0.55, 0.45, -0.7), lowerarm_l=(0.3, 0.2, -1), hand_l=(0.3, 0.1, -1),
                 upperarm_r=(-0.7, -0.4, 0.15), lowerarm_r=(-0.4, -0.8, 0.3))
    slide2 = dict(slide, z=0.2, root=(-62, 14, 0), thigh_r=(-0.12, -1, -0.08), calf_r=(-0.1, -1, -0.05))
    keys = [
        (0.00, P(spine=(10, 0, 0), thigh_l=(0.05, -0.35, -1), calf_l=(0.05, 0.3, -1), thigh_r=(-0.05, 0.3, -1),
                 calf_r=(-0.05, 0.5, -1), upperarm_l=(0.3, 0.3, -1), upperarm_r=(-0.3, -0.4, -1))),
        (0.16, dict(legs_world=True, root=(-15, 5, 0), spine=(8, 0, 4), z=0.72,
                    thigh_r=(-0.1, -1, -0.45), calf_r=(-0.1, -0.7, -0.7), foot_r=(0, -0.6, 0.6),
                    thigh_l=(0.2, -0.45, -0.85), calf_l=(0.2, 0.75, -0.65), foot_l=(0, 0.3, -1),
                    upperarm_l=(0.6, 0.3, -0.7), lowerarm_l=(0.5, 0, -1), upperarm_r=(-0.6, -0.2, -0.3),
                    lowerarm_r=(-0.4, -0.7, 0.2))),
        (0.32, slide),
        (0.68, slide2),
        (1.00, P(spine=(15, 0, 0), thigh_r=(-0.1, -0.5, -1), calf_r=(-0.05, 0.1, -1),
                 thigh_l=(0.1, -0.15, -1), calf_l=(0.05, 0.45, -1), upperarm_l=(0.4, 0, -1), upperarm_r=(-0.4, 0, -1))),
    ]
    return pose_anim(arm, keys, ground=True, curl=curl)


def clip_throwin(arm, curl):
    stag = dict(thigh_l=(0.06, -0.2, -1), calf_l=(0.04, 0.05, -1), thigh_r=(-0.06, 0.25, -1), calf_r=(-0.04, 0.35, -1))
    keys = [
        (0.00, P(upperarm_l=(0.25, -0.45, -0.85), lowerarm_l=(-0.15, -1, 0.35), upperarm_r=(-0.25, -0.45, -0.85),
                 lowerarm_r=(0.15, -1, 0.35))),
        (0.40, P(spine=(-16, 0, 0), neck=(-8, 0, 0), upperarm_l=(0.3, 0.25, 1), lowerarm_l=(-0.45, 0.6, -0.45),
                 upperarm_r=(-0.3, 0.25, 1), lowerarm_r=(0.45, 0.6, -0.45), **stag)),
        (0.62, P(spine=(14, 0, 0), neck=(5, 0, 0), upperarm_l=(0.2, -0.55, 0.85), lowerarm_l=(0.0, -0.8, 0.6),
                 upperarm_r=(-0.2, -0.55, 0.85), lowerarm_r=(0.0, -0.8, 0.6), **stag)),
        (0.85, P(spine=(24, 0, 0), upperarm_l=(0.2, -1, -0.1), lowerarm_l=(0.05, -1, -0.3),
                 upperarm_r=(-0.2, -1, -0.1), lowerarm_r=(-0.05, -1, -0.3), **stag)),
        (1.20, P()),
    ]
    return pose_anim(arm, keys, ground=True, curl=curl)


# ---------------------------------------------------------------- keeper
KREADY = dict(spine=(18, 0, 0), neck=(-15, 0, 0), thigh_l=(0.3, -0.35, -1), calf_l=(0.15, 0.35, -1),
              foot_l=(0.1, -1, -0.4), thigh_r=(-0.3, -0.35, -1), calf_r=(-0.15, 0.35, -1), foot_r=(-0.1, -1, -0.4),
              upperarm_l=(0.7, -0.45, -0.6), lowerarm_l=(0.3, -1, 0.15), hand_l=(0.2, -0.6, 1),
              upperarm_r=(-0.7, -0.45, -0.6), lowerarm_r=(-0.3, -1, 0.15), hand_r=(-0.2, -0.6, 1))


def K(**kw):
    d = dict(KREADY)
    d.update(kw)
    return d


def clip_keeper_idle(arm, curl):
    keys = [
        (0.0, K()),
        (0.5, K(spine=(20, 0, 2), thigh_l=(0.32, -0.4, -1), thigh_r=(-0.32, -0.4, -1), ground=0.0)),
        (1.0, K(spine=(18, 0, 0), ground=0.02)),
        (1.5, K(spine=(20, 0, -2), thigh_l=(0.32, -0.4, -1), thigh_r=(-0.32, -0.4, -1))),
        (2.0, K()),
    ]
    return pose_anim(arm, keys, ground=True, curl=curl)


def clip_keeper_dive(arm, curl, side='l'):
    """Dive to the keeper's left (+X). Right dive = mirror."""
    keys = [
        (0.00, K()),
        (0.15, K(spine=(-15, -10, 0), thigh_l=(0.5, -0.3, -1), calf_l=(0.2, 0.5, -1), thigh_r=(-0.1, -0.2, -1),
                 calf_r=(-0.1, 0.4, -1), upperarm_l=(0.8, -0.5, 0.1), upperarm_r=(-0.4, -0.6, 0.0))),
        (0.40, K(root=(0, 55, 0), spine=(0, -10, 0), neck=(0, 10, 0), z=0.85, thigh_l=(0.35, -0.1, -1),
                 calf_l=(0.2, 0.2, -1), thigh_r=(-0.5, 0.0, -1), calf_r=(-0.4, 0.1, -1), foot_r=(-0.2, -1, -0.3),
                 upperarm_l=(0.3, -0.25, 1), lowerarm_l=(0.15, -0.2, 1), hand_l=(0.0, -0.3, 1),
                 upperarm_r=(0.0, -0.4, 1), lowerarm_r=(0.2, -0.3, 1), hand_r=(0.1, -0.3, 1))),
        (0.62, K(root=(0, 85, 0), spine=(0, -8, 0), neck=(0, 12, 0), z=0.55, thigh_l=(0.1, -0.1, -1),
                 calf_l=(0.1, 0.3, -1), thigh_r=(-0.3, -0.05, -1), calf_r=(-0.2, 0.3, -1),
                 upperarm_l=(0.1, -0.3, 1), lowerarm_l=(0.0, -0.3, 1), upperarm_r=(0.15, -0.35, 1),
                 lowerarm_r=(0.2, -0.3, 1))),
        (0.85, K(root=(0, 92, 0), spine=(-10, 0, 0), neck=(0, 10, 0), z=0.20, thigh_l=(0.0, -0.4, -1),
                 calf_l=(0.0, 0.4, -1), thigh_r=(-0.1, -0.5, -1), calf_r=(-0.1, 0.4, -1),
                 upperarm_l=(0.1, -0.6, 0.8), lowerarm_l=(-0.2, -0.8, 0.2), upperarm_r=(0.2, -0.7, 0.5),
                 lowerarm_r=(0.4, -0.8, 0.1))),
        (1.10, K(root=(0, 92, 0), spine=(-14, 0, 0), neck=(0, 10, 0), z=0.18, thigh_l=(0.0, -0.5, -1),
                 calf_l=(0.0, 0.5, -1), thigh_r=(-0.1, -0.6, -1), calf_r=(-0.1, 0.4, -1),
                 upperarm_l=(0.1, -0.7, 0.7), lowerarm_l=(-0.3, -0.8, 0.1), upperarm_r=(0.2, -0.8, 0.4),
                 lowerarm_r=(0.4, -0.8, 0.0))),
    ]
    a = pose_anim(arm, keys, ground=True, curl=curl)
    if side == 'r':
        a = al.mirror_anim(arm, a)
    return a


def clip_keeper_catch(arm, curl):
    keys = [
        (0.0, K()),
        (0.2, K(spine=(-8, 0, 0), upperarm_l=(0.3, -1, 0.35), lowerarm_l=(-0.1, -1, 0.35), hand_l=(-0.2, -0.3, 1),
                upperarm_r=(-0.3, -1, 0.35), lowerarm_r=(0.1, -1, 0.35), hand_r=(0.2, -0.3, 1))),
        (0.38, K(spine=(-14, 0, 0), upperarm_l=(0.3, -0.6, -0.6), lowerarm_l=(-0.4, -0.9, 0.3),
                 upperarm_r=(-0.3, -0.6, -0.6), lowerarm_r=(0.4, -0.9, 0.3))),
        (0.6, K(spine=(-6, 0, 0), thigh_l=(0.15, -0.2, -1), calf_l=(0.1, 0.2, -1), thigh_r=(-0.15, -0.2, -1),
                calf_r=(-0.1, 0.2, -1), upperarm_l=(0.3, -0.4, -0.85), lowerarm_l=(-0.5, -0.85, 0.3),
                upperarm_r=(-0.3, -0.4, -0.85), lowerarm_r=(0.5, -0.85, 0.3))),
    ]
    return pose_anim(arm, keys, ground=True, curl=curl)


def clip_keeper_throw(arm, curl):
    # overarm bowling throw with the right arm
    keys = [
        (0.0, P(upperarm_l=(0.3, -0.6, -0.6), lowerarm_l=(-0.4, -0.9, 0.3), upperarm_r=(-0.3, -0.6, -0.6),
                lowerarm_r=(0.4, -0.9, 0.3))),
        (0.35, P(spine=(8, 0, -25), thigh_l=(0.06, -0.3, -1), calf_l=(0.04, 0.0, -1), thigh_r=(-0.06, 0.15, -1),
                 calf_r=(-0.04, 0.3, -1), upperarm_l=(0.6, -0.8, 0.2), lowerarm_l=(0.3, -1, 0.3),
                 upperarm_r=(-0.5, 0.8, -0.1), lowerarm_r=(-0.3, 1, 0.1))),
        (0.55, P(spine=(-5, 0, 0), thigh_l=(0.06, -0.35, -1), calf_l=(0.04, 0.0, -1), thigh_r=(-0.06, 0.2, -1),
                 calf_r=(-0.04, 0.4, -1), upperarm_l=(0.5, 0.1, -1), upperarm_r=(-0.25, 0.1, 1),
                 lowerarm_r=(-0.15, -0.3, 1))),
        (0.70, P(spine=(-25, 0, 20), thigh_l=(0.06, -0.35, -1), calf_l=(0.04, 0.0, -1), thigh_r=(-0.06, 0.25, -1),
                 calf_r=(-0.04, 0.5, -1), upperarm_l=(0.5, 0.4, -1), upperarm_r=(-0.1, -1, -0.3),
                 lowerarm_r=(0.0, -1, -0.6))),
        (1.0, P()),
    ]
    return pose_anim(arm, keys, ground=True, curl=curl)


OUTFIELD = [
    ('Idle', clip_idle), ('Jog', clip_jog), ('Run', clip_run), ('Sprint', clip_sprint), ('Dribble', clip_dribble),
    ('Pass', clip_pass), ('Shoot', clip_shoot), ('Tackle', clip_tackle), ('Header', clip_header),
    ('Celebrate', clip_celebrate), ('Fall', clip_fall), ('ThrowIn', clip_throwin),
]
KEEPER = [
    ('KeeperIdle', clip_keeper_idle), ('KeeperDiveLeft', lambda a, c: clip_keeper_dive(a, c, 'l')),
    ('KeeperDiveRight', lambda a, c: clip_keeper_dive(a, c, 'r')), ('KeeperCatch', clip_keeper_catch),
    ('KeeperThrow', clip_keeper_throw),
]


def export_glb(path, arm, mesh):
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=False, export_animations=True, export_animation_mode='ACTIONS',
        export_frame_range=False, export_force_sampling=True, export_frame_step=1,
        export_anim_single_armature=True, export_reset_pose_bones=True,
        export_def_bones=False, export_skins=True, export_morph=False,
        export_image_format='AUTO', export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials='EXPORT', export_cameras=False, export_lights=False,
        export_optimize_animation_size=True, export_draco_mesh_compression_enable=False)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    out = argv[0]
    keeper = '--keeper' in argv
    save = argv[argv.index('--save') + 1] if '--save' in argv else None
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else None
    arm = bpy.data.objects['Armature']
    mesh = bpy.data.objects['Footballer']
    curl = al.finger_curl(arm)
    clips = OUTFIELD + (KEEPER if keeper else [])
    bpy.context.scene.render.fps = al.FPS
    for name, fn in clips:
        if only and name not in only:
            continue
        a = fn(arm, curl)
        act = rt.write_action(arm, name, a.qs, a.loc)
        print('CLIP', name, a.n, 'frames', round((a.n - 1) / al.FPS, 3), 's')
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=save)
    if out != '-':
        export_glb(out, arm, mesh)
        print('EXPORTED', out, os.path.getsize(out))


if __name__ == '__main__':
    main()
