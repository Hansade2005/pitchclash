import bpy
tot=0
for o in bpy.data.objects:
    if o.type=='MESH' and o.name not in ('Ground',):
        t=sum(len(p.vertices)-2 for p in o.data.polygons); tot+=t
        print('TRIS', o.name, t, len(o.data.vertices), [m.name for m in o.data.materials])
print('TOTAL', tot)
