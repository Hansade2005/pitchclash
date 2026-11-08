"""Build one footballer character with MPFB2 + MakeHuman system assets.

Usage: blender --background --factory-startup --python build_character.py -- <variant> <out.blend>
Produces a .blend with the skinned, kitted, decimated character (no animation yet).
"""
import bpy, bmesh, sys, os, math, json
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mpfb_boot import dyn
from variants import VARIANTS

ASSETS = '/home/user/assets-src/mh_system_assets/extracted'
HumanService = dyn("mpfb.services.humanservice", "HumanService")
ExportService = dyn("mpfb.services.exportservice", "ExportService")
TargetService = dyn("mpfb.services.targetservice", "TargetService")
LocationService = dyn("mpfb.services.locationservice", "LocationService")


def clean_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def make_human(v):
    macro = dict(gender=1.0, age=v.get('age', 0.5), muscle=v['muscle'], weight=v['weight'],
                 proportions=v.get('proportions', 0.8), height=0.5, cupsize=0.5, firmness=0.5,
                 race=v['race'])
    # find macro height giving the requested stature
    lo, hi = 0.0, 1.0
    for _ in range(9):
        macro['height'] = (lo + hi) / 2
        bm = HumanService.create_human(macro_detail_dict=macro)
        h = body_height(bm)
        bpy.data.objects.remove(bm)
        if h < v['height']:
            lo = macro['height']
        else:
            hi = macro['height']
    macro['height'] = (lo + hi) / 2
    bm = HumanService.create_human(macro_detail_dict=macro)
    targets_root = LocationService.get_mpfb_data("targets")
    for t, w in v.get('targets', {}).items():
        TargetService.load_target(bm, os.path.join(targets_root, t + '.target.gz'), weight=w)
    print('HEIGHT', body_height(bm), 'macro height', macro['height'])
    return bm


def body_height(bm):
    dg = bpy.context.evaluated_depsgraph_get()
    e = bm.evaluated_get(dg)
    zs = [v.co.z for v in e.data.vertices]
    return max(zs) - min(zs)


def add_assets(bm, v):
    objs = {}
    items = [('eyes', 'low-poly.mhclo', 'Eyes'), ('eyebrows', v['eyebrows'] + '.mhclo', 'Eyebrows')]
    if v.get('hair'):
        items.append(('hair', v['hair'] + '.mhclo', 'Hair'))
    items.append(('clothes', v.get('shoes', 'shoes06') + '.mhclo', 'Clothes'))
    for sub, fn, typ in items:
        path = None
        for root, _, files in os.walk(os.path.join(ASSETS, sub)):
            if fn in files:
                path = os.path.join(root, fn)
        o = HumanService.add_mhclo_asset(path, bm, asset_type=typ, subdiv_levels=0, material_type='GAMEENGINE')
        objs[typ] = o
    return objs


# ----------------------------------------------------------------------------------------- materials
TEX_CACHE = '/home/user/assets-src/tex_cache'


def find_file(sub, fn):
    for root, _, files in os.walk(os.path.join(ASSETS, sub)):
        if fn in files:
            return os.path.join(root, fn)
    raise FileNotFoundError(fn)


def prep_texture(src, dst_name, size, fmt='JPEG', tint=None, gray_tint=False, gain=1.0):
    os.makedirs(TEX_CACHE, exist_ok=True)
    dst = os.path.join(TEX_CACHE, dst_name)
    img = bpy.data.images.load(src)
    img.scale(size, size)
    if tint is not None or gain != 1.0:
        px = np.array(img.pixels[:]).reshape(-1, 4)
        if gray_tint:
            lum = px[:, :3] @ np.array([0.3, 0.59, 0.11])
            lum = lum / max(1e-6, np.percentile(lum[px[:, 3] > 0.5], 70) if (px[:, 3] > 0.5).any() else 1)
            px[:, :3] = np.clip(lum[:, None] * np.array(tint)[None, :] * 1.0, 0, 1)
        else:
            px[:, :3] = np.clip(px[:, :3] * gain, 0, 1)
        img.pixels[:] = px.ravel()
    img.filepath_raw = dst
    img.file_format = fmt
    img.save()
    bpy.data.images.remove(img)
    im = bpy.data.images.load(dst)
    im.name = dst_name
    return im


def principled(name, color=(0.9, 0.9, 0.9), rough=0.8, image=None, alpha=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    if alpha:
        try:
            m.surface_render_method = 'DITHERED'
        except Exception:
            pass
        m.blend_method = 'CLIP' if hasattr(m, 'blend_method') else None
    return m


def set_materials(bm, objs, v, tag):
    keeper = v.get('keeper', False)
    skin_png = [f for f in os.listdir(os.path.dirname(find_file('skins', v['skin'] + '.mhmat'))) if f.endswith('.png')][0]
    skin_img = prep_texture(os.path.join(os.path.dirname(find_file('skins', v['skin'] + '.mhmat')), skin_png),
                            f'skin_{tag}.jpg', 1024, 'JPEG', gain=v.get('skin_gain', 1.0))
    principled('Skin', image=skin_img, rough=0.6)
    principled('Shirt', (0.9, 0.9, 0.9), 0.85)
    principled('Shorts', (0.9, 0.9, 0.9), 0.75)
    principled('Socks', (0.9, 0.9, 0.9), 0.9)
    if 'Clothes' in objs:
        shoe = v.get('shoes', 'shoes06')
        simg = prep_texture(find_file('clothes', shoe + '_diffuse.png'), f'boots_{shoe}.jpg', 512, 'JPEG',
                            tint=(0.16, 0.16, 0.17), gray_tint=True)
        mbo = principled('Boots', image=simg, rough=0.45)
        o = objs['Clothes']; o.data.materials.clear(); o.data.materials.append(mbo); o.name = 'Boots'
        split_shoe_socks(o, find_file('clothes', shoe + '_diffuse.png'))
    if keeper:
        principled('Gloves', (0.85, 0.85, 0.85), 0.7)
    if 'Hair' in objs:
        hsrc = [f for f in os.listdir(os.path.dirname(find_file('hair', v['hair'] + '.mhclo'))) if f.endswith('diffuse.png')][0]
        himg = prep_texture(os.path.join(os.path.dirname(find_file('hair', v['hair'] + '.mhclo')), hsrc),
                            f'hair_{tag}.png', 512, 'PNG', tint=v['hair_color'], gray_tint=True)
        mh = principled('Hair', image=himg, rough=0.7, alpha=True)
        o = objs['Hair']; o.data.materials.clear(); o.data.materials.append(mh); o.name = 'Hair'
    eimg = prep_texture(find_file('eyes', v['eyes'] + '_eye.png'), f'eyes_{v["eyes"]}.png', 256, 'PNG')
    me_ = principled('Eyes', image=eimg, rough=0.2)
    o = objs['Eyes']; o.data.materials.clear(); o.data.materials.append(me_); o.name = 'Eyes'
    bimg = prep_texture(find_file('eyebrows', v['eyebrows'] + '.png'), f'brow_{v["eyebrows"]}.png', 256, 'PNG')
    mb = principled('Eyebrows', image=bimg, rough=0.8, alpha=True)
    o = objs['Eyebrows']; o.data.materials.clear(); o.data.materials.append(mb); o.name = 'Eyebrows'


# ----------------------------------------------------------------------------------------- kit

def bone_seg(arm, name):
    b = arm.data.bones[name]
    return np.array(b.head_local), np.array(b.tail_local)


def seg_t(p, a, b):
    d = b - a
    return float(np.dot(p - a, d) / np.dot(d, d))


ZONES = ['Skin', 'Shirt', 'Shorts', 'Socks']


def kit_planes(arm, v, keeper):
    """Garment boundary planes: name -> (point, normal, side_bones). Positive side = toward limb end / up."""
    B = arm.data.bones
    P = {}
    pelvis_z = B['thigh_l'].head_local.z
    neck_a = np.array(B['neck_01'].head_local)
    sleeve_t = v.get('sleeve', 0.42)
    shorts_t = v.get('shorts', 0.42)
    # collar: tilted plane, lower at the front. normal points up/forward-ish (toward the head side)
    slope = 0.8
    n = np.array([0.0, -slope, 1.0]); n /= np.linalg.norm(n)
    P['collar'] = (neck_a + np.array([0, 0, -0.004]), n)
    P['waist'] = (np.array([0, 0, pelvis_z - 0.01]), np.array([0, 0, 1.0]))
    for sd in 'lr':
        a, b = bone_seg(arm, 'thigh_' + sd)
        d = (b - a) / np.linalg.norm(b - a)
        P['hem_' + sd] = (a + (b - a) * shorts_t, d)
        ca, cb = bone_seg(arm, 'calf_' + sd)
        P['sock_' + sd] = (np.array([0, 0, ca[2] - 0.075]), np.array([0, 0, -1.0]))
        ua, ub = bone_seg(arm, 'upperarm_' + sd)
        la, lb = bone_seg(arm, 'lowerarm_' + sd)
        if keeper:
            dl = (lb - la) / np.linalg.norm(lb - la)
            P['sleeve_' + sd] = (la + (lb - la) * 0.93, dl)
        else:
            du = (ub - ua) / np.linalg.norm(ub - ua)
            P['sleeve_' + sd] = (ua + (ub - ua) * sleeve_t, du)
    return P


def face_dominant(obj, arm):
    me = obj.data
    vg_names = {g.index: g.name for g in obj.vertex_groups}
    deform = set(b.name for b in arm.data.bones)
    W = []
    for vert in me.vertices:
        d = {}
        for g in vert.groups:
            nme = vg_names[g.group]
            if nme in deform and g.weight > 0:
                d[nme] = g.weight
        W.append(d)
    doms = []
    for f in me.polygons:
        acc = {}
        for vi in f.vertices:
            for nme, w in W[vi].items():
                acc[nme] = acc.get(nme, 0) + w
        doms.append(max(acc, key=acc.get) if acc else '')
    return doms


ARM_BONES = ('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb')


def plane_targets(dom, c, name, neck_a):
    """Which faces a given boundary plane may cut."""
    if name == 'collar':
        return (dom in ('neck_01', 'spine_03', 'head') or dom.startswith('clavicle')) and abs(c[0]) < 0.11 \
            and abs(c[2] - neck_a[2]) < 0.12
    if name == 'waist':
        return (dom in ('pelvis', 'spine_01', 'spine_02') or dom.startswith('thigh')) and not dom.startswith(ARM_BONES)
    side = name[-1]
    if name.startswith('hem'):
        return dom == 'thigh_' + side
    if name.startswith('sock'):
        return dom in ('calf_' + side, 'thigh_' + side)
    if name.startswith('sleeve'):
        return dom in ('upperarm_' + side, 'lowerarm_' + side, 'hand_' + side) or \
            (dom.startswith('clavicle_' + side))
    return False


def cut_planes(obj, arm, planes):
    neck_a = np.array(arm.data.bones['neck_01'].head_local)
    for name, (co, no) in planes.items():
        doms = face_dominant(obj, arm)
        me = obj.data
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        faces = []
        for f, dom in zip(bm.faces, doms):
            c = np.array(f.calc_center_median())
            if plane_targets(dom, c, name, neck_a):
                # only faces straddling the plane
                ds = [np.dot(np.array(vv.co) - co, no) for vv in f.verts]
                if min(ds) < 0 < max(ds):
                    faces.append(f)
        if faces:
            edges = list({e for f in faces for e in f.edges})
            geom = faces + edges + list({vv for f in faces for vv in f.verts})
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), dist=0.0015)
            bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(me); bm.free(); me.update()
        print('CUT', name, len(faces))


def classify_faces(obj, arm, v, keeper=False):
    planes = kit_planes(arm, v, keeper)
    me = obj.data
    doms = face_dominant(obj, arm)
    neck_a = np.array(arm.data.bones['neck_01'].head_local)

    def side_of(name, c):
        co, no = planes[name]
        return float(np.dot(c - co, no))
    zones, params = [], []
    for f, dom in zip(me.polygons, doms):
        c = np.array(f.center)
        z, prm = 'Skin', 0.0
        sd = dom[-1] if dom[-2:] in ('_l', '_r') else ('l' if c[0] > 0 else 'r')
        if not dom:
            pass
        elif dom.startswith(('index', 'middle', 'pinky', 'ring', 'thumb', 'hand')):
            z = 'Gloves' if keeper else 'Skin'
            if keeper and side_of('sleeve_' + sd, c) < 0:
                z = 'Shirt'; prm = 2.0
        elif dom.startswith(('foot', 'ball')):
            z = 'Hidden'
        elif dom.startswith('calf'):
            a, b = bone_seg(arm, 'calf_' + sd)
            t = seg_t(c, a, b)
            z = 'Hidden' if t > 0.97 else ('Socks' if side_of('sock_' + sd, c) > 0 else 'Skin')
        elif dom.startswith('thigh'):
            if side_of('waist', c) > 0:
                z = 'Shirt'
            elif side_of('hem_' + sd, c) < 0:
                a, b = bone_seg(arm, 'thigh_' + sd)
                z = 'Shorts'; prm = min(1.0, max(0.0, seg_t(c, a, b) / v.get('shorts', 0.42)))
            elif side_of('sock_' + sd, c) > 0:
                z = 'Socks'
        elif dom.startswith(('upperarm', 'lowerarm')):
            if side_of('sleeve_' + sd, c) < 0:
                a, b = bone_seg(arm, 'upperarm_' + sd)
                t = seg_t(c, a, b)
                z = 'Shirt'; prm = 1.0 + min(1.0, max(0.0, t / v.get('sleeve', 0.42)))
            elif keeper:
                z = 'Gloves'
        elif dom in ('pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head') or dom.startswith('clavicle'):
            if side_of('waist', c) < 0:
                z = 'Shorts'
            elif side_of('collar', c) < 0 or (abs(c[0]) > 0.11 and c[2] < neck_a[2] + 0.02):
                z = 'Shirt'
        if z == 'Shirt' and prm == 0.0 and side_of('waist', c) < 0.04:
            prm = 0.25   # shirt hem: extra overhang
        zones.append(z)
        params.append(prm)
    return zones, params


def apply_kit(obj, arm, v, keeper=False):
    cut_planes(obj, arm, kit_planes(arm, v, keeper))
    zones, params = classify_faces(obj, arm, v, keeper)
    me = obj.data
    names = ZONES + (['Gloves'] if keeper else [])
    mats = {}
    for n in names:
        m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        mats[n] = m
    me.materials.clear()
    for n in names:
        me.materials.append(mats[n])
    idx = {n: i for i, n in enumerate(names)}
    for f, z in zip(me.polygons, zones):
        f.material_index = idx.get(z, 0)
    # garment volume: per-vertex displacement along normal
    base_off = {'Hidden': 0.0, 'Skin': 0.0, 'Shirt': 0.010, 'Shorts': 0.013, 'Socks': 0.003, 'Boots': 0.006, 'Gloves': 0.012}
    disp = np.zeros(len(me.vertices))
    for f, z, p in zip(me.polygons, zones, params):
        o = base_off[z]
        if z == 'Shirt' and p >= 1.0:
            o = 0.006 + 0.007 * (p - 1.0)      # sleeve flares toward cuff
            if keeper:
                o = 0.010
        if z == 'Shorts':
            o = 0.010 + 0.016 * p              # shorts flare toward hem
        if z == 'Shirt' and p == 0.25:
            o = 0.013
        for vi in f.vertices:
            disp[vi] = max(disp[vi], o)
    me.update()
    smooth_zone(obj, zones, ('Shirt', 'Shorts'), iters=6, fac=0.5)
    hidden = [i for i, z in enumerate(zones) if z == 'Hidden']
    normals = np.array([vv.normal for vv in me.vertices])
    co = np.array([vv.co for vv in me.vertices])
    co += normals * disp[:, None]
    for vv, c in zip(me.vertices, co):
        vv.co = c
    # delete faces hidden inside the boots
    bmh = bmesh.new(); bmh.from_mesh(me); bmh.faces.ensure_lookup_table()
    bmesh.ops.delete(bmh, geom=[bmh.faces[i] for i in hidden], context='FACES')
    bmh.to_mesh(me); bmh.free(); me.update()
    return zones


def smooth_zone(obj, zones, which, iters=6, fac=0.5):
    """Laplacian smoothing of vertices fully inside the given zones (softens muscle detail under cloth)."""
    me = obj.data
    inside = np.ones(len(me.vertices), bool)
    touched = np.zeros(len(me.vertices), bool)
    vz = [None] * len(me.vertices)
    for f, z in zip(me.polygons, zones):
        for vi in f.vertices:
            touched[vi] = True
            if z not in which or (vz[vi] is not None and vz[vi] != z):
                inside[vi] = False
            vz[vi] = z
    inside &= touched
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    vs = [bm.verts[i] for i in np.nonzero(inside)[0]]
    for _ in range(iters):
        newp = {}
        for vt in vs:
            nb = [e.other_vert(vt).co for e in vt.link_edges]
            avg = sum(nb, Vector()) / len(nb)
            newp[vt.index] = vt.co.lerp(avg, fac)
        for i, p in newp.items():
            bm.verts[i].co = p
    bm.to_mesh(me); bm.free(); me.update()


def split_shoe_socks(shoe, img_path):
    """Faces of the MH shoe that are textured as sock (bright) get the Socks material."""
    img = bpy.data.images.load(img_path)
    w, h = img.size
    px = np.array(img.pixels[:]).reshape(h, w, 4)
    me = shoe.data
    uv = me.uv_layers.active.data
    if 'Socks' not in [m.name for m in me.materials]:
        me.materials.append(bpy.data.materials['Socks'])
    si = [m.name for m in me.materials].index('Socks')
    zs = np.array([p.center.z for p in me.polygons])
    for p in me.polygons:
        lum = 0
        for li in p.loop_indices:
            u, v = uv[li].uv
            c = px[int(np.clip(v, 0, 0.999) * h), int(np.clip(u, 0, 0.999) * w)]
            lum += c[:3] @ np.array([0.3, 0.59, 0.11])
        lum /= len(p.loop_indices)
        if lum > 0.55 and p.center.z > 0.07:
            p.material_index = si
    bpy.data.images.remove(img)


def smooth_feet(obj, arm, iters=12):
    """Laplacian-smooth toe/forefoot geometry so the boot reads as one shape."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    gi = {g.name: g.index for g in obj.vertex_groups}
    sel = []
    for vert in me.vertices:
        w = 0
        for g in vert.groups:
            if g.group in (gi.get('ball_l'), gi.get('ball_r')):
                w += g.weight
        if w > 0.3:
            sel.append(vert.index)
    sel_set = set(sel)
    vs = [bm.verts[i] for i in sel]
    for _ in range(iters):
        newp = {}
        for vt in vs:
            nb = [e.other_vert(vt).co for e in vt.link_edges]
            if nb:
                avg = sum(nb, Vector()) / len(nb)
                newp[vt.index] = vt.co.lerp(avg, 0.6)
        for i, p in newp.items():
            bm.verts[i].co = p
    bm.to_mesh(me)
    bm.free()
    me.update()


def decimate(obj, target_tris, head_bias=True):
    me = obj.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    ratio = min(1.0, target_tris / tris)
    mod = obj.modifiers.new('Dec', 'DECIMATE')
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    if head_bias:
        # vertex group "dec_w": 1 = keep detail (face/hands)
        vg = obj.vertex_groups.get('dec_w') or obj.vertex_groups.new(name='dec_w')
        gi = {g.name: g.index for g in obj.vertex_groups}
        for vert in me.vertices:
            w = 0.0
            for g in vert.groups:
                if g.group == gi.get('head'):
                    w = max(w, 0.6 * g.weight)
            vg.add([vert.index], w, 'REPLACE')
        mod.vertex_group = 'dec_w'
        mod.vertex_group_factor = 1.0
        mod.invert_vertex_group = True
    bpy.context.view_layer.objects.active = obj
    # armature must not be applied: move decimate to the top
    while obj.modifiers.find('Dec') > 0:
        bpy.ops.object.modifier_move_up(modifier='Dec')
    bpy.ops.object.modifier_apply(modifier='Dec')
    print('DECIMATE', obj.name, tris, '->', sum(len(p.vertices) - 2 for p in obj.data.polygons))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    name, out = argv[0], argv[1]
    v = VARIANTS[name]
    keeper = v.get('keeper', False)
    clean_scene()
    bm = make_human(v)
    HumanService.add_builtin_rig(bm, 'game_engine')
    arm = bm.parent
    objs = add_assets(bm, v)
    ExportService.bake_modifiers_remove_helpers(bm, bake_masks=True, bake_subdiv=False, remove_helpers=True)
    for o in [bm] + list(objs.values()):
        for m in list(o.modifiers):
            if m.type not in ('ARMATURE',):
                o.modifiers.remove(m)
        if o.data.shape_keys:
            bpy.context.view_layer.objects.active = o
            o.shape_key_add(name='tmp', from_mix=True)
            for kb in list(o.data.shape_keys.key_blocks):
                o.shape_key_remove(kb)
    bm.name = 'Body'
    arm.name = 'Armature'
    decimate(bm, v.get('body_tris', 6400))
    apply_kit(bm, arm, v, keeper)
    set_materials(bm, objs, v, name)
    decimate(objs['Clothes'], 560, head_bias=False)
    if 'Hair' in objs:
        decimate(objs['Hair'], v.get('hair_tris', 1500), head_bias=False)
    # join into one skinned mesh
    bpy.ops.object.select_all(action='DESELECT')
    for o in [bm] + list(objs.values()):
        o.select_set(True)
    bpy.context.view_layer.objects.active = bm
    bpy.ops.object.join()
    bm.name = 'Footballer'
    bm.data.name = 'Footballer'
    for g in list(bm.vertex_groups):
        if g.name not in arm.data.bones:
            bm.vertex_groups.remove(g)
    bpy.ops.object.shade_smooth()
    # origin at the soles: shift mesh + bones so min z == 0
    minz = min(vv.co.z for vv in bm.data.vertices)
    for vv in bm.data.vertices:
        vv.co.z -= minz
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in arm.data.edit_bones:
        eb.head.z -= minz
        eb.tail.z -= minz
    bpy.ops.object.mode_set(mode='OBJECT')
    print('SOLE SHIFT', minz, 'HEIGHT', max(vv.co.z for vv in bm.data.vertices))
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('SAVED', out, [o.name for o in bpy.data.objects])


if __name__ == '__main__':
    main()
