# Reduce triangle counts of a GLB with Blender's Decimate (collapse), keeping node names, doors, wheels and skeletons.
# blender -b --python slim_glb.py -- <in.glb> <out.glb> <ratio> [min_tris_per_mesh]
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]; src, dst, ratio = argv[0], argv[1], float(argv[2]); min_tris = int(argv[3]) if len(argv) > 3 else 1500
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
before = after = 0
for ob in list(bpy.data.objects):
    if ob.type != 'MESH': continue
    ob.data.calc_loop_triangles(); n = len(ob.data.loop_triangles); before += n
    if n > min_tris:
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        m = ob.modifiers.new('slim', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
        try: bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
        except Exception: pass
        try: bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e: print('apply failed', ob.name, e)
        ob.select_set(False)
    ob.data.calc_loop_triangles(); after += len(ob.data.loop_triangles)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=False, export_animations=True, export_yup=True)
print('SLIM', src.split('/')[-1], before, '->', after)
