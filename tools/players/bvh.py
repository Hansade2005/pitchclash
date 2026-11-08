"""Minimal BVH parser producing per-frame global rotations/positions (numpy).

Output is in BVH space (Y-up, actor faces +Z in the Hahne CMU T-pose frame).
"""
import numpy as np


class Joint:
    def __init__(self, name, parent):
        self.name = name
        self.parent = parent
        self.offset = np.zeros(3)
        self.channels = []
        self.children = []
        self.end = None  # end-site offset
        self.ch_index = 0


def _rot(axis, deg):
    a = np.radians(deg)
    c, s = np.cos(a), np.sin(a)
    n = a.shape[0]
    m = np.zeros((n, 3, 3))
    if axis == 'X':
        m[:, 0, 0] = 1; m[:, 1, 1] = c; m[:, 1, 2] = -s; m[:, 2, 1] = s; m[:, 2, 2] = c
    elif axis == 'Y':
        m[:, 1, 1] = 1; m[:, 0, 0] = c; m[:, 0, 2] = s; m[:, 2, 0] = -s; m[:, 2, 2] = c
    else:
        m[:, 2, 2] = 1; m[:, 0, 0] = c; m[:, 0, 1] = -s; m[:, 1, 0] = s; m[:, 1, 1] = c
    return m


class BVH:
    def __init__(self, path):
        toks = open(path).read().split()
        self.joints = []
        self.by_name = {}
        i = 0
        stack = []
        nch = 0
        cur = None
        while True:
            t = toks[i]
            if t in ('ROOT', 'JOINT'):
                j = Joint(toks[i + 1], stack[-1] if stack else None)
                if j.parent:
                    j.parent.children.append(j)
                self.joints.append(j)
                self.by_name[j.name] = j
                cur = j
                i += 2
            elif t == 'End':
                cur = None
                i += 2
            elif t == '{':
                stack.append(cur)
                i += 1
            elif t == '}':
                stack.pop()
                i += 1
            elif t == 'OFFSET':
                off = np.array([float(x) for x in toks[i + 1:i + 4]])
                if cur is None:
                    stack[-2].end = off  # end site belongs to enclosing joint
                else:
                    cur.offset = off
                i += 4
            elif t == 'CHANNELS':
                n = int(toks[i + 1])
                cur.channels = toks[i + 2:i + 2 + n]
                cur.ch_index = nch
                nch += n
                i += 2 + n
            elif t == 'MOTION':
                break
            else:
                i += 1
        self.nframes = int(toks[i + 2])
        self.frame_time = float(toks[i + 5])
        data = np.array(toks[i + 6:i + 6 + self.nframes * nch], dtype=float)
        self.data = data.reshape(self.nframes, nch)
        self._compute()

    def _compute(self):
        F = self.nframes
        self.grot = {}
        self.gpos = {}
        for j in self.joints:
            R = np.tile(np.eye(3), (F, 1, 1))
            pos = None
            for k, ch in enumerate(j.channels):
                v = self.data[:, j.ch_index + k]
                if ch.endswith('rotation'):
                    R = R @ _rot(ch[0], v)
                elif ch.endswith('position'):
                    if pos is None:
                        pos = np.tile(j.offset, (F, 1)).astype(float) * 0
                    pos[:, 'XYZ'.index(ch[0])] = v
            if j.parent is None:
                self.grot[j.name] = R
                self.gpos[j.name] = pos if pos is not None else np.tile(j.offset, (F, 1))
            else:
                PR = self.grot[j.parent.name]
                self.grot[j.name] = PR @ R
                self.gpos[j.name] = self.gpos[j.parent.name] + np.einsum('fij,j->fi', PR, j.offset)

    def child_dir(self, name, frame):
        """Direction from joint to its (first) child or end site at frame, BVH space."""
        j = self.by_name[name]
        if j.children:
            # prefer a child with a non-zero offset
            for c in j.children:
                if np.linalg.norm(c.offset) > 1e-6:
                    off = c.offset
                    break
            else:
                off = j.children[0].offset
        else:
            off = j.end
        d = self.grot[name][frame] @ off
        return d / np.linalg.norm(d)
