# Blender 4.5 LTS: builds the "Hans" player character.
# Takes the suited base body, reshapes the head, projects the player's photo onto the face,
# paints cornrow hair on the scalp, recolours suit/eyes/shoes and exports a game-ready GLB.
import bpy, bmesh, numpy as np, math, sys
D = '/tmp/claude-0/-home-user/2e3ecbb1-43b2-5aaf-a2ea-1a3ac4756a44/scratchpad/hans/'
P = dict(sx=2770.0, sy=2770.0, cx=712.0, cy=561.0, tilt=-0.047, widen=0.12, eyeZ=1.7107, ell=(716, 648, 192, 262))
for a in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []:
    k, v = a.split('='); P[k] = float(v)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/user/neon/assets/models/person_m6.glb')
ob = bpy.data.objects['Person']; me = ob.data
mats = [m.name for m in me.materials]
sstep = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))

# 1) drop the stock hair + eyebrow cards (the photo and painted cornrows replace them)
bm = bmesh.new(); bm.from_mesh(me)
kill = [f for f in bm.faces if mats[f.material_index] in ('Hair', 'Eyebrows')]
bmesh.ops.delete(bm, geom=kill, context='FACES')
# 2) reshape the face to the photo's proportions: wider-set eyes, lower brow line, longer upper lip
ZO = [1.56, 1.597, 1.632, 1.641, 1.658, 1.6705, 1.7107, 1.728, 1.775, 1.826]     # model landmarks (chin, lips, mouth, nose base, nose tip, eyes, brow, hairline, crown)
ZN = [1.56, 1.597, 1.6316, 1.6443, 1.6732, 1.6822, 1.7107, 1.7345, 1.7688, 1.826]  # where the photo puts them
XO = [0, 0.0296, 0.069, 0.3]; XN = [0, 0.0383, 0.069, 0.3]
for v in bm.verts:
    x, y, z = v.co
    if z > 1.56:
        f = float(sstep(-0.06, -0.11, y))                                   # only the front of the head
        v.co.z = z + f * (float(np.interp(z, ZO, ZN)) - z)
        wx = f * float(sstep(1.62, 1.67, z)) * (1 - float(sstep(1.74, 1.775, z)))
        v.co.x = x + wx * (math.copysign(float(np.interp(abs(x), XO, XN)), x) - x)
        v.co.x *= 1 + P['widen'] * float(sstep(1.56, 1.63, z))
bm.to_mesh(me); bm.free(); me.update()

# 3) textures
def px(img):
    w, h = img.size; a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a); return a.reshape(h, w, 4)
def put(img, a): img.pixels.foreach_set(a.astype(np.float32).ravel()); img.update(); img.pack()
img_of = lambda key: next(i for i in bpy.data.images if key in i.name.lower())

photo_img = bpy.data.images.load(D + 'photo.png'); photo = px(photo_img)[::-1, :, :3]   # top-down rows
PH, PW = photo.shape[:2]
def sample(pxs, pys):
    x = np.clip(pxs, 0, PW - 1.001); y = np.clip(pys, 0, PH - 1.001); x0 = x.astype(int); y0 = y.astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    return (photo[y0, x0] * (1 - fx) + photo[y0, x0 + 1] * fx) * (1 - fy) + (photo[y0 + 1, x0] * (1 - fx) + photo[y0 + 1, x0 + 1] * fx) * fy

skin_img = img_of('skin'); skin = px(skin_img); H, W = skin.shape[:2]
tone = np.median(photo[430:500, 640:800].reshape(-1, 3), axis=0)           # forehead skin tone from the photo
base = np.median(skin[..., :3].reshape(-1, 3), axis=0)
skin[..., :3] = np.clip(skin[..., :3] * (tone * 0.9 / base), 0, 1)        # whole body matches the face

si = mats.index('Skin'); me.calc_loop_triangles(); uvl = me.uv_layers[0].data
co = np.array([v.co[:] for v in me.vertices]); no = np.array([v.normal[:] for v in me.vertices])
ex, ey, erx, ery = P['ell']; ct, st = math.cos(P['tilt']), math.sin(P['tilt'])
out = skin[..., :3].copy()
for t in me.loop_triangles:
    if t.material_index != si: continue
    vi = list(t.vertices); p3 = co[vi]
    if p3[:, 2].max() < 1.5: continue
    uv = np.array([uvl[l].uv[:] for l in t.loops]) * [W, H]
    x0, y0 = np.floor(uv.min(0)).astype(int) - 1; x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
    gx, gy = np.meshgrid(np.arange(max(0, x0), min(W, x1 + 1)), np.arange(max(0, y0), min(H, y1 + 1)))
    if gx.size == 0: continue
    a, b, c = uv; den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(den) < 1e-9: continue
    qx = gx.ravel() + 0.5; qy = gy.ravel() + 0.5
    w0 = ((b[1] - c[1]) * (qx - c[0]) + (c[0] - b[0]) * (qy - c[1])) / den; w1 = ((c[1] - a[1]) * (qx - c[0]) + (a[0] - c[0]) * (qy - c[1])) / den; w2 = 1 - w0 - w1
    ok = (w0 > -0.08) & (w1 > -0.08) & (w2 > -0.08)
    if not ok.any(): continue
    bw = np.stack([w0, w1, w2], 1)[ok]; pos = bw @ p3; nrm = bw @ no[vi]; nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    X, Y, Z = pos[:, 0], pos[:, 1], pos[:, 2]
    cur = out[gy.ravel()[ok], gx.ravel()[ok]]
    # painted cornrows on the scalp (rows run front to back)
    thr = 1.771 + np.clip((Y + 0.12) / 0.12, 0, 1) * (1.63 - 1.771)
    ear = (np.abs(X) > 0.086) & (Z < 1.745)
    hair = sstep(-0.004, 0.006, Z - thr) * (~ear)
    row = 0.5 + 0.5 * np.cos(np.arctan2(X, np.maximum(Z - 1.69, 0.001)) * 0.085 * 2 * math.pi / 0.0165); braid = sstep(0.18, 0.6, row) * (0.82 + 0.18 * np.sin(Y * 2 * math.pi / 0.007 + row * 3))
    hcol = (tone * 0.42)[None, :] * (1 - braid[:, None]) + np.array([0.035, 0.03, 0.03])[None, :] * braid[:, None]
    cur = cur * (1 - hair[:, None]) + hcol * hair[:, None]
    # photo projection on the front of the head
    u = P['sx'] * X / (1 + P['widen']); v = -P['sy'] * (Z - P['eyeZ']); pxs = P['cx'] + u * ct - v * st; pys = P['cy'] + u * st + v * ct
    r = np.sqrt(((pxs - ex) / erx) ** 2 + ((pys - ey) / ery) ** 2)
    m = (1 - sstep(0.82, 1.0, r)) * sstep(0.22, 0.55, -nrm[:, 1]) * (Z > 1.585)
    cur = cur * (1 - m[:, None]) + sample(pxs, pys) * m[:, None]
    out[gy.ravel()[ok], gx.ravel()[ok]] = cur
skin[..., :3] = out; put(skin_img, skin)

eyes_img = img_of('eye'); e = px(eyes_img); rgb = e[..., :3]; lum = rgb.mean(-1, keepdims=True); iris = (lum < 0.7) & (lum > 0.1)
e[..., :3] = np.where(iris, np.clip(lum * np.array([0.5, 0.28, 0.14]), 0, 1), rgb); put(eyes_img, e)
o_img = img_of('outfit'); o = px(o_img); rgb = o[..., :3]; lum = rgb.mean(-1, keepdims=True); dark = sstep(0.55, 0.3, lum)   # suit cloth vs white shirt
o[..., :3] = np.clip(rgb * (1 - dark) + (rgb * np.array([0.5, 0.78, 2.1]) + np.array([0.0, 0.01, 0.05])) * dark, 0, 1); put(o_img, o)
s_img = img_of('shoes'); s = px(s_img); s[..., :3] *= 0.22; put(s_img, s)
for m in me.materials: m.name = m.name  # keep slot names (Hair/Eyebrows slots are now unused)

ob.name = 'Person'
bpy.ops.export_scene.gltf(filepath=D + 'person_hans.glb', export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, export_animations=False, export_skins=True, export_yup=True, export_materials='EXPORT')
bpy.ops.wm.save_as_mainfile(filepath=D + 'hans.blend')
skin_img.filepath_raw = D + 'hans_skin.png'; skin_img.file_format = 'PNG'; skin_img.save()
print('DONE', P)
