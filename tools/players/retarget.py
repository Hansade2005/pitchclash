"""Retarget CMU (Hahne BVH) motion onto the MPFB game_engine rig.

World-space delta transfer:  T_b(f) = Rz * C * G_j(f) * G_j(tpose)^-1 * C^T * Tm_b
where Tm_b is the target bone swung so its direction matches the source bone direction
in the BVH T-pose frame.  Pure numpy + mathutils; runs inside Blender.
"""
import math
import numpy as np
import bpy
from mathutils import Matrix, Quaternion, Vector

from bvh import BVH

C = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=float)  # BVH(Y-up) -> Blender(Z-up)

MAP = {
    'pelvis': 'Hips',
    'spine_01': 'LowerBack',
    'spine_02': 'Spine',
    'spine_03': 'Spine1',
    'neck_01': 'Neck1',
    'head': 'Head',
    'clavicle_l': 'LeftShoulder', 'upperarm_l': 'LeftArm', 'lowerarm_l': 'LeftForeArm', 'hand_l': 'LeftHand',
    'clavicle_r': 'RightShoulder', 'upperarm_r': 'RightArm', 'lowerarm_r': 'RightForeArm', 'hand_r': 'RightHand',
    'thigh_l': 'LeftUpLeg', 'calf_l': 'LeftLeg', 'foot_l': 'LeftFoot', 'ball_l': 'LeftToeBase',
    'thigh_r': 'RightUpLeg', 'calf_r': 'RightLeg', 'foot_r': 'RightFoot', 'ball_r': 'RightToeBase',
}
# Source direction (from joint A to joint B, T-pose frame).  None => end site of A.
DIR_SRC = {
    'pelvis': ('LowerBack', 'Spine'), 'spine_01': ('LowerBack', 'Spine'), 'spine_02': ('Spine', 'Spine1'),
    'spine_03': ('Spine1', 'Neck1'), 'neck_01': ('Neck', 'Head'), 'head': ('Head', None),
}
for _s in ('Left', 'Right'):
    _t = _s[0].lower()
    DIR_SRC.update({
        'clavicle_' + _t: (_s + 'Shoulder', _s + 'Arm'), 'upperarm_' + _t: (_s + 'Arm', _s + 'ForeArm'),
        'lowerarm_' + _t: (_s + 'ForeArm', _s + 'Hand'), 'hand_' + _t: (_s + 'Hand', _s + 'HandIndex1'),
        'thigh_' + _t: (_s + 'UpLeg', _s + 'Leg'), 'calf_' + _t: (_s + 'Leg', _s + 'Foot'),
        'foot_' + _t: (_s + 'Foot', _s + 'ToeBase'), 'ball_' + _t: (_s + 'ToeBase', None),
    })


def src_dir(b, a, c, frame=0):
    if c is None:
        return b.child_dir(a, frame)
    d = b.gpos[c][frame] - b.gpos[a][frame]
    return d / np.linalg.norm(d)


def swing(a, b):
    """Rotation matrix (3x3 numpy) rotating unit vector a onto unit vector b."""
    q = Vector(a).rotation_difference(Vector(b))
    return np.array(q.to_matrix())


def rest_data(arm):
    bones = arm.data.bones
    rd = {}
    for b in bones:
        M = np.array(b.matrix_local)
        rd[b.name] = dict(R=M[:3, :3].copy(), head=M[:3, 3].copy(), tail=np.array(b.tail_local),
                          dir=(np.array(b.tail_local) - np.array(b.head_local)) /
                          max(1e-9, np.linalg.norm(np.array(b.tail_local) - np.array(b.head_local))),
                          parent=b.parent.name if b.parent else None)
    order = []

    def walk(b):
        order.append(b.name)
        for c in b.children:
            walk(c)
    for b in bones:
        if b.parent is None:
            walk(b)
    return rd, order


class Clip:
    """Holds per-frame target world rotations + pelvis head position (Blender armature space)."""

    def __init__(self, rd, order, frames):
        self.rd, self.order = rd, order
        self.n = frames
        self.W = {}       # bone -> (n,3,3) world rotation (only mapped bones)
        self.pelvis = np.zeros((frames, 3))

    def locals(self, extra_local=None):
        """Return per-bone (n,4) quaternions of local rotations and pelvis loc (n,3)."""
        rd = self.rd
        n = self.n
        Wall = {}
        out = {}
        for name in self.order:
            r = rd[name]
            p = r['parent']
            if p is None:
                Wall[name] = np.tile(r['R'], (n, 1, 1))
                continue
            rel = rd[p]['R'].T @ r['R']
            if name in self.W:
                Wb = self.W[name]
                L = np.einsum('ij,fjk->fik', rel.T, np.einsum('fji,fjk->fik', Wall[p], Wb))
            else:
                L = np.tile(np.eye(3), (n, 1, 1))
                if extra_local and name in extra_local:
                    L = L @ extra_local[name]
                Wb = np.einsum('fij,jk->fik', Wall[p], rel) @ L
            Wall[name] = Wb
            qs = np.zeros((n, 4))
            prev = None
            for f in range(n):
                q = Matrix(L[f].tolist()).to_quaternion()
                if prev is not None and q.dot(prev) < 0:
                    q.negate()
                prev = q
                qs[f] = (q.w, q.x, q.y, q.z)
            out[name] = qs
        r = rd['pelvis']
        loc = np.einsum('ij,fj->fi', r['R'].T, self.pelvis - r['head'])
        return out, loc


def heading_matrix(vec_xy):
    """Rotation about Z that maps horizontal direction vec_xy onto -Y (forward)."""
    ang = math.atan2(vec_xy[1], vec_xy[0])
    target = -math.pi / 2
    a = target - ang
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def zrot(deg):
    a = math.radians(deg)
    return np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])


def retarget(arm, bvh_path, start, end, step=1, heading='travel', inplace='all', yaw_extra=0.0, yaw_track=None,
             heading_frames=None):
    """start/end in source frames (120 fps). Returns Clip at 120/step fps.
    inplace: 'all' (no horizontal pelvis motion), 'detrend' (remove linear drift only), 'none'.
    yaw_track: (deg_at_start, deg_at_end) additional time-varying yaw."""
    b = BVH(bvh_path) if isinstance(bvh_path, str) else bvh_path
    rd, order = rest_data(arm)
    frames = list(range(start, end, step))
    n = len(frames)
    clip = Clip(rd, order, n)
    # target matched pose
    Tm = {}
    for tb, sj in MAP.items():
        sd = C @ src_dir(b, *DIR_SRC[tb])
        Tm[tb] = swing(rd[tb]['dir'], sd) @ rd[tb]['R']
    hips = b.gpos['Hips'][frames] @ C.T
    hf = heading_frames or frames
    # heading
    if heading == 'travel':
        hh = b.gpos['Hips'][hf] @ C.T
        d = hh[-1] - hh[0]
        Rz = heading_matrix(d[:2])
    elif heading == 'head':
        # direction from hips to head, horizontal (for lying poses)
        d = (C @ (b.gpos['Head'][hf[0]] - b.gpos['Hips'][hf[0]]))
        Rz = heading_matrix(d[:2])
    elif heading == 'face':
        # average facing of hips over the clip: hips local +Z (BVH fwd)
        fw = np.einsum('ij,fjk,k->fi', C, b.grot['Hips'][hf], np.array([0, 0, 1.0]))
        Rz = heading_matrix(fw.mean(axis=0)[:2])
    elif heading == 'face0':
        fw = C @ b.grot['Hips'][hf[0]] @ np.array([0, 0, 1.0])
        Rz = heading_matrix(fw[:2])
    else:
        Rz = np.eye(3)
    if yaw_extra:
        Rz = zrot(yaw_extra) @ Rz
    n = len(frames)
    if yaw_track:
        RzF = np.array([zrot(yaw_track[0] + (yaw_track[1] - yaw_track[0]) * (i / max(1, n - 1))) @ Rz for i in range(n)])
    else:
        RzF = np.tile(Rz, (n, 1, 1))
    for tb, sj in MAP.items():
        G = b.grot[sj]
        D = np.einsum('ij,fjk->fik', C, G[frames] @ G[0].T) @ C.T
        clip.W[tb] = np.einsum('fij,fjk->fik', RzF, D) @ Tm[tb]
    # pelvis translation
    src_h = (C @ b.gpos['Hips'][0])[2] - min((C @ b.gpos[j][0])[2] for j in ('LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'))
    tgt_h = rd['pelvis']['head'][2]
    scale = tgt_h / src_h
    floor0 = min((C @ b.gpos[j][0])[2] for j in ('LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'))
    P = (hips - np.array([0, 0, floor0])) * scale
    P = np.einsum('fij,fj->fi', RzF, P)
    if inplace == 'all':
        P[:, 0] = 0.0
        P[:, 1] = 0.0
    elif inplace == 'detrend':
        tt = np.arange(n)
        for ax in (0, 1):
            k, c0 = np.polyfit(tt, P[:, ax], 1)
            P[:, ax] -= k * tt + c0
    else:
        P[:, 0] -= P[0, 0]
        P[:, 1] -= P[0, 1]
    P[:, 0] += rd['pelvis']['head'][0]
    P[:, 1] += rd['pelvis']['head'][1]
    clip.pelvis = P
    clip.scale = scale
    clip.bvh = b
    clip.frames = frames
    return clip


def find_cycle(b, start, min_len, max_len, joints=('LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm')):
    """Return end frame (source fps) where the pose best matches `start`."""
    best, bi = 1e9, None
    for e in range(start + min_len, min(start + max_len, b.nframes - 1)):
        d = 0
        for j in joints:
            d += np.linalg.norm(b.grot[j][e] @ b.grot['Hips'][e].T - b.grot[j][start] @ b.grot['Hips'][start].T)
        # include velocity similarity
        for j in joints[:2]:
            v1 = b.grot[j][e + 1] - b.grot[j][e]
            v0 = b.grot[j][start + 1] - b.grot[j][start]
            d += 2.0 * np.linalg.norm(v1 - v0)
        if d < best:
            best, bi = d, e
    return bi, best


def slerp_arr(q0, q1, t):
    out = np.zeros_like(q0)
    for i in range(len(q0)):
        a = Quaternion(q0[i]); b = Quaternion(q1[i])
        if a.dot(b) < 0:
            b.negate()
        r = a.slerp(b, float(t[i]) if hasattr(t, '__len__') else t)
        out[i] = (r.w, r.x, r.y, r.z)
    return out


def make_loop(qs, loc, n, k):
    """qs/loc contain n+k frames; return n frames that loop seamlessly (crossfade k frames)."""
    outq = {}
    for name, q in qs.items():
        res = q[:n].copy()
        for i in range(k):
            w = (i + 0.5) / k  # weight of head pose
            res[i] = slerp_arr(q[n + i:n + i + 1], q[i:i + 1], w)[0]
        outq[name] = res
    l = loc[:n].copy()
    for i in range(k):
        w = (i + 0.5) / k
        l[i] = loc[n + i] * (1 - w) + loc[i] * w
    return outq, l


def write_action(arm, name, qs, loc, fps_step=1, fcurve_interp='LINEAR'):
    """Create an action on arm from per-bone quaternions (n,4) and pelvis loc (n,3)."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    n = len(next(iter(qs.values())))
    for name_b, q in qs.items():
        pb = arm.pose.bones[name_b]
        for f in range(n):
            pb.rotation_quaternion = Quaternion(q[f])
            pb.keyframe_insert('rotation_quaternion', frame=f * fps_step, group=name_b)
    pb = arm.pose.bones['pelvis']
    for f in range(len(loc)):
        pb.location = Vector(loc[f])
        pb.keyframe_insert('location', frame=f * fps_step, group='pelvis')
    return act
