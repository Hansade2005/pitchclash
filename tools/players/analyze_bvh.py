import sys, numpy as np
sys.path.insert(0, '.')
from bvh import BVH
for p in sys.argv[1:]:
    b = BVH(p)
    print('==', p.split('/')[-1], b.nframes, 'frames', round(b.nframes*b.frame_time,2), 's')
    H = b.gpos['Hips']; lf = b.gpos['LeftFoot']; rf = b.gpos['RightFoot']; hd = b.gpos['Head']; lh=b.gpos['LeftHand']; rh=b.gpos['RightHand']
    step = 15
    for f in range(1, b.nframes, step):
        v = np.linalg.norm(H[min(f+step,b.nframes-1),[0,2]] - H[f,[0,2]]) / (step*b.frame_time) * 0.056
        lfs = np.linalg.norm(lf[min(f+3,b.nframes-1)]-lf[f])/(3*b.frame_time)*0.056
        rfs = np.linalg.norm(rf[min(f+3,b.nframes-1)]-rf[f])/(3*b.frame_time)*0.056
        print(f'{f:5d} t={f*b.frame_time:5.2f} hipY={H[f,1]*0.056:.2f} spd={v:4.1f} headY={hd[f,1]*0.056:.2f} lfY={lf[f,1]*0.056:.2f} rfY={rf[f,1]*0.056:.2f} lfv={lfs:4.1f} rfv={rfs:4.1f} lhY={lh[f,1]*0.056:.2f} rhY={rh[f,1]*0.056:.2f}')
