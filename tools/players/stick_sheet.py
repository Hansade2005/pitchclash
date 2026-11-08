"""Draw stick-figure contact sheets of a BVH (front view, X/Y) to choose frame ranges."""
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '.')
from bvh import BVH
path, out = sys.argv[1], sys.argv[2]
start = int(sys.argv[3]) if len(sys.argv) > 3 else 1
end = int(sys.argv[4]) if len(sys.argv) > 4 else None
step = int(sys.argv[5]) if len(sys.argv) > 5 else 30
view = sys.argv[6] if len(sys.argv) > 6 else 'front'
b = BVH(path)
end = end or b.nframes
frames = list(range(start, end, step))
cols = 10
rows = (len(frames) + cols - 1) // cols
W = 110; H = 150
im = Image.new('RGB', (cols * W, rows * H), 'white')
d = ImageDraw.Draw(im)
for k, f in enumerate(frames):
    ox, oy = (k % cols) * W, (k // cols) * H
    hip = b.gpos['Hips'][f]
    def P(j):
        p = b.gpos[j][f] - hip
        x = p[0] if view == 'front' else p[2]
        return (ox + W / 2 + x * 3.2, oy + H - 12 - (b.gpos[j][f][1]) * 3.2)
    for j in b.joints:
        if j.parent is not None:
            col = 'red' if 'Left' in j.name else ('blue' if 'Right' in j.name else 'black')
            d.line([P(j.parent.name), P(j.name)], fill=col, width=2)
    d.text((ox + 3, oy + 2), str(f), fill='black')
im.save(out)
