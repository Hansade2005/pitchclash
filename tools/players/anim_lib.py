"""Clip construction helpers: mocap resampling/looping, additive world tweaks, hand-keyed poses."""
import math
import numpy as np
import bpy
from mathutils import Matrix, Quaternion, Vector, Euler

import retarget as rt

FPS = 30
SRC_FPS = 120


# --------------------------------------------------------------------------- basic containers
class Anim:
    """Per-bone local quaternions (n,4) + pelvis loc (n,3) at FPS."""

    def __init__(self, qs, loc):
        self.qs, self.loc = qs, loc

    @property
    def n(self):
        return len(self.loc)

    def copy(self):
        return Anim({k: v.copy() for k, v in self.qs.items()}, self.loc.copy())


def qslerp(a, b, t):
    a = Quaternion(a); b = Quaternion(b)
    if a.dot(b) < 0:
        b.negate()
    r = a.slerp(b, t)
    return (r.w, r.x, r.y, r.z)


def resample(anim, src_t, out_t):
    """src_t: times of anim frames (seconds, increasing); out_t: requested times."""
    qs = {}
    idx = np.clip(np.searchsorted(src_t, out_t, side='right') - 1, 0, len(src_t) - 2)
    frac = np.clip((out_t - src_t[idx]) / (src_t[idx + 1] - src_t[idx]), 0, 1)
    for name, q in anim.qs.items():
        o = np.zeros((len(out_t), 4))
        for i, (k, f) in enumerate(zip(idx, frac)):
            o[i] = qslerp(q[k], q[k + 1], f)
        qs[name] = o
    loc = anim.loc[idx] * (1 - frac[:, None]) + anim.loc[idx + 1] * frac[:, None]
    return Anim(qs, loc)


def world_tweak(clip, bone, rot_fn, rd_children):
    """Pre-multiply world rotation of `bone` and its mapped descendants by rot_fn(i) (3x3)."""
    targets = [bone] + rd_children.get(bone, [])
    for i in range(clip.n):
        R = rot_fn(i)
        if R is None:
            continue
        for t in targets:
            if t in clip.W:
                clip.W[t][i] = R @ clip.W[t][i]


def descendants(arm):
    out = {}
    for b in arm.data.bones:
        out[b.name] = [c.name for c in b.children_recursive]
    return out


def axis_rot(axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 3, Vector(axis)))


FINGER_CURL = None


def finger_curl(arm, deg=22, thumb=10):
    """Constant local rotation for finger bones (relaxed hand). Axis: bone local X."""
    out = {}
    for b in arm.data.bones:
        n = b.name
        if n.startswith(('index', 'middle', 'ring', 'pinky')):
            out[n] = np.array(Matrix.Rotation(math.radians(deg), 3, 'X'))
        elif n.startswith('thumb'):
            out[n] = np.array(Matrix.Rotation(math.radians(thumb), 3, 'X'))
    return out


def mocap(arm, bvh, start, end, speed=1.0, duration=None, loop=False, loop_k=4, heading='travel',
          inplace='all', yaw_extra=0.0, yaw_track=None, tweaks=None, heading_frames=None, curl=None):
    """Retarget [start,end) source frames; resample to FPS with time scale.

    loop=True: [start,end) is one cycle; extra source frames after `end` are used for the crossfade.
    duration: force output duration (s) (overrides speed).
    tweaks: list of (bone, fn(i, n) -> 3x3 or None) world-space additive rotations.
    """
    src_len = end - start
    if duration is None:
        duration = src_len / SRC_FPS / speed
    n_out = max(2, int(round(duration * FPS)))
    extra_out = loop_k if loop else 0
    tscale = (src_len / SRC_FPS) / (n_out / FPS)   # source seconds per output second
    extra_src = int(math.ceil(extra_out / FPS * tscale * SRC_FPS)) + 2 if loop else 1
    clip = rt.retarget(arm, bvh, start, min(end + extra_src, bvh.nframes), step=1, heading=heading,
                       inplace=inplace, yaw_extra=yaw_extra, yaw_track=yaw_track, heading_frames=heading_frames)
    if tweaks:
        ch = descendants(arm)
        for bone, fn in tweaks:
            world_tweak(clip, bone, lambda i: fn(i, clip.n), ch)
    qs, loc = clip.locals(extra_local=curl)
    a = Anim(qs, loc)
    src_t = np.arange(clip.n) / SRC_FPS
    if loop:
        out_t = np.arange(n_out + extra_out) / FPS * tscale
        out_t = np.minimum(out_t, src_t[-1])
        r = resample(a, src_t, out_t)
        q2, l2 = rt.make_loop(r.qs, r.loc, n_out, extra_out)
        # close the loop: last frame == first frame (time n_out/FPS)
        q2 = {k: np.concatenate([v, v[:1]]) for k, v in q2.items()}
        l2 = np.concatenate([l2, l2[:1]])
        return Anim(q2, l2)
    out_t = np.minimum(np.arange(n_out + 1) / FPS * tscale, src_t[-1])
    return resample(a, src_t, out_t)


def crossfade_concat(a, b, k):
    """Append b to a; the last k frames of a blend into the first k frames of b."""
    qs = {}
    na = a.n
    for name in a.qs:
        qa, qb = a.qs[name], b.qs[name]
        blend = np.zeros((k, 4))
        for i in range(k):
            w = (i + 1) / (k + 1)
            w = w * w * (3 - 2 * w)
            blend[i] = qslerp(qa[na - k + i], qb[i], w)
        qs[name] = np.concatenate([qa[:na - k], blend, qb[k:]])
    lb = np.zeros((k, 3))
    for i in range(k):
        w = (i + 1) / (k + 1)
        w = w * w * (3 - 2 * w)
        lb[i] = a.loc[na - k + i] * (1 - w) + b.loc[i] * w
    loc = np.concatenate([a.loc[:na - k], lb, b.loc[k:]])
    return Anim(qs, loc)


def blend_to_pose(a, pose_anim, k_in=0, k_out=0):
    """Blend the first k_in frames from pose_anim[0] and last k_out frames toward pose_anim[0]."""
    out = a.copy()
    for name in out.qs:
        p = pose_anim.qs[name][0]
        for i in range(k_in):
            w = 1 - (i + 1) / (k_in + 1)
            out.qs[name][i] = qslerp(out.qs[name][i], p, w)
        for i in range(k_out):
            w = (i + 1) / (k_out + 1)
            j = out.n - k_out + i
            out.qs[name][j] = qslerp(out.qs[name][j], p, w)
    pl = pose_anim.loc[0]
    for i in range(k_in):
        w = 1 - (i + 1) / (k_in + 1)
        out.loc[i] = out.loc[i] * (1 - w) + pl * w
    for i in range(k_out):
        w = (i + 1) / (k_out + 1)
        j = out.n - k_out + i
        out.loc[j] = out.loc[j] * (1 - w) + pl * w
    return out


# --------------------------------------------------------------------------- forward kinematics / grounding
def fk_positions(rd, order, Wall, pelvis_head):
    """Return dict bone -> (n,3) head positions, and tails (n,3)."""
    n = len(pelvis_head)
    heads, tails = {}, {}
    for name in order:
        r = rd[name]
        p = r['parent']
        if p is None:
            heads[name] = np.tile(r['head'], (n, 1))
        elif name == 'pelvis':
            heads[name] = pelvis_head.copy()
        else:
            Dp = np.einsum('fij,jk->fik', Wall[p], rd[p]['R'].T)   # world delta of parent
            off = r['head'] - rd[p]['head']
            heads[name] = heads[p] + np.einsum('fij,j->fi', Dp, off)
        D = np.einsum('fij,jk->fik', Wall[name], r['R'].T)
        tails[name] = heads[name] + np.einsum('fij,j->fi', D, r['tail'] - r['head'])
    return heads, tails


def world_from_locals(rd, order, qs, n):
    Wall = {}
    for name in order:
        r = rd[name]
        p = r['parent']
        if p is None:
            Wall[name] = np.tile(r['R'], (n, 1, 1))
            continue
        rel = rd[p]['R'].T @ r['R']
        if name in qs:
            L = np.array([np.array(Quaternion(q).to_matrix()) for q in qs[name]])
        else:
            L = np.tile(np.eye(3), (n, 1, 1))
        Wall[name] = np.einsum('fij,jk->fik', Wall[p], rel) @ L
    return Wall


SOLE_PTS = [('foot_l', 'head', 0.0), ('foot_r', 'head', 0.0), ('ball_l', 'head', 0.0), ('ball_r', 'head', 0.0),
            ('ball_l', 'tail', 0.0), ('ball_r', 'tail', 0.0)]


def ground_offsets(arm, anim, per_frame=False, extra_pts=()):
    """Vertical offset so the lowest sole point matches the rest-pose lowest sole point."""
    rd, order = rt.rest_data(arm)
    Wall = world_from_locals(rd, order, anim.qs, anim.n)
    r = rd['pelvis']
    pel = r['head'] + np.einsum('ij,fj->fi', r['R'], anim.loc)
    heads, tails = fk_positions(rd, order, Wall, pel)
    rest_min = min(rd[b][w][2] for b, w, _ in SOLE_PTS)
    pts = []
    for b, w, clr in list(SOLE_PTS) + list(extra_pts):
        arr = heads[b] if w == 'head' else tails[b]
        pts.append(arr[:, 2] - clr)
    zmin = np.min(np.array(pts), axis=0)
    return rest_min - zmin, heads, tails


def apply_ground(arm, anim, mode='min', extra_pts=()):
    """mode 'min': constant offset so the lowest frame touches; 'all': every frame grounded."""
    off, _, _ = ground_offsets(arm, anim, extra_pts=extra_pts)
    rd, _ = rt.rest_data(arm)
    R = rd['pelvis']['R']
    if mode == 'min':
        d = np.full(anim.n, off.max())   # lowest point over clip touches the ground
    elif mode == 'mean_contact':
        d = np.full(anim.n, np.percentile(off, 90))
    else:
        d = off
    world = np.zeros((anim.n, 3)); world[:, 2] = d
    anim.loc = anim.loc + np.einsum('ij,fj->fi', R.T, world)
    return anim


# --------------------------------------------------------------------------- hand-keyed poses
LIMBS = ['upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
         'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r', 'clavicle_l', 'clavicle_r']


def E(rot):
    """Euler degrees (x pitch, y roll, z yaw) -> 3x3. Blender axes: X=char left, -Y forward, Z up.
    +X pitch bends FORWARD; +Y roll tips the top toward the character's left (+X)?  (Ry(+): Z->+X); +Z yaw turns left."""
    return np.array(Euler([math.radians(a) for a in rot], 'XYZ').to_matrix())


def nrm(v):
    v = np.array(v, float)
    return v / np.linalg.norm(v)


def pose_world(rd, pose):
    """Pose dict -> world rotations for bones (dict of 3x3) and pelvis head position (or None)."""
    W = {}
    Rr = E(pose.get('root', (0, 0, 0)))
    s = np.array(pose.get('spine', (0, 0, 0)), float)
    nk = np.array(pose.get('neck', (0, 0, 0)), float)
    W['pelvis'] = Rr @ E(pose.get('pelvis', (0, 0, 0))) @ rd['pelvis']['R']
    W['spine_01'] = Rr @ E(s / 3) @ rd['spine_01']['R']
    W['spine_02'] = Rr @ E(2 * s / 3) @ rd['spine_02']['R']
    Rc = Rr @ E(s)
    W['spine_03'] = Rc @ rd['spine_03']['R']
    W['neck_01'] = Rc @ E(nk / 2) @ rd['neck_01']['R']
    W['head'] = Rc @ E(nk) @ rd['head']['R']
    for side in 'lr':
        W['clavicle_' + side] = Rc @ E(pose.get('clav_' + side, (0, 0, 0))) @ rd['clavicle_' + side]['R']
    for b in LIMBS:
        if b in pose:
            spec = pose[b]
            d = nrm(spec[0] if isinstance(spec, tuple) and len(spec) == 2 and hasattr(spec[0], '__len__') else spec)
            tw = spec[1] if isinstance(spec, tuple) and len(spec) == 2 and hasattr(spec[0], '__len__') else 0.0
            is_arm = b.startswith(('upperarm', 'lowerarm', 'hand', 'clavicle'))
            frame = Rc if is_arm else Rr
            if (is_arm and pose.get('arms_world')) or (not is_arm and pose.get('legs_world')):
                frame = np.eye(3)
            dw = frame @ d
            R = rt.swing(rd[b]['dir'], dw)
            if tw:
                R = np.array(Matrix.Rotation(math.radians(tw), 3, Vector(dw))) @ R
            W[b] = R @ rd[b]['R']
    return W


def pose_anim(arm, keys, ground=True, curl=None, ease='smooth'):
    """keys: list of (time_s, pose_dict). Returns Anim at FPS (inclusive of last key time)."""
    rd, order = rt.rest_data(arm)
    nk = len(keys)
    clip = rt.Clip(rd, order, nk)
    Ws = [pose_world(rd, p) for _, p in keys]
    names = set().union(*[w.keys() for w in Ws])
    for b in names:
        arr = []
        for i, w in enumerate(Ws):
            if b in w:
                arr.append(w[b])
            else:
                arr.append(None)
        # fill missing by rest-relative: use parent's delta (handled by leaving out) -> we require presence
        if any(a is None for a in arr):
            continue
        clip.W[b] = np.array(arr)
    clip.pelvis = np.tile(rd['pelvis']['head'], (nk, 1)).astype(float)
    for i, (_, p) in enumerate(keys):
        if 'z' in p:
            clip.pelvis[i, 2] = p['z']
        if 'xy' in p:
            clip.pelvis[i, 0] += p['xy'][0]
            clip.pelvis[i, 1] += p['xy'][1]
    qs, loc = clip.locals(extra_local=curl)
    key_anim = Anim(qs, loc)
    # ground per key (feet planted) unless explicit z
    if ground:
        off, _, _ = ground_offsets(arm, key_anim, extra_pts=())
        R = rd['pelvis']['R']
        for i, (_, p) in enumerate(keys):
            if 'z' in p:
                continue
            g = p.get('ground', 0.0)
            world = np.array([0, 0, off[i] + g])
            key_anim.loc[i] += R.T @ world
    # interpolate
    times = np.array([t for t, _ in keys])
    n_out = int(round(times[-1] * FPS)) + 1
    out_t = np.arange(n_out) / FPS
    qso = {}
    idx = np.clip(np.searchsorted(times, out_t, side='right') - 1, 0, nk - 2)
    frac = np.clip((out_t - times[idx]) / (times[idx + 1] - times[idx]), 0, 1)
    if ease == 'smooth':
        frac = frac * frac * (3 - 2 * frac)
    for name, q in key_anim.qs.items():
        o = np.zeros((n_out, 4))
        for i, (k, f) in enumerate(zip(idx, frac)):
            o[i] = qslerp(q[k], q[k + 1], f)
        qso[name] = o
    loc = key_anim.loc[idx] * (1 - frac[:, None]) + key_anim.loc[idx + 1] * frac[:, None]
    return Anim(qso, loc)


def anim_pose_at(anim, i):
    return Anim({k: v[i:i + 1].copy() for k, v in anim.qs.items()}, anim.loc[i:i + 1].copy())


def mirror_anim(arm, anim):
    """Mirror an animation left<->right (X axis) using world-space reflection."""
    rd, order = rt.rest_data(arm)
    Wall = world_from_locals(rd, order, anim.qs, anim.n)
    S = np.diag([-1.0, 1.0, 1.0])
    clip = rt.Clip(rd, order, anim.n)
    for name in order:
        if rd[name]['parent'] is None:
            continue
        src = name[:-2] + ('_r' if name.endswith('_l') else '_l') if name[-2:] in ('_l', '_r') else name
        # mirrored world rotation for bone `name` from bone `src`: S * W_src * S, re-based on rest frames
        Wm = np.einsum('ij,fjk,kl->fil', S, Wall[src], S)
        # rest orientation mirror correction
        corr = (S @ rd[src]['R'] @ S).T @ rd[name]['R']
        clip.W[name] = Wm @ corr
    r = rd['pelvis']
    pel = r['head'] + np.einsum('ij,fj->fi', r['R'], anim.loc)
    pel[:, 0] *= -1
    clip.pelvis = pel
    qs, loc = clip.locals()
    return Anim(qs, loc)
