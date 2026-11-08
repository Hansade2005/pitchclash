import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_util as ru
argv = sys.argv[sys.argv.index('--') + 1:]
prefix = argv[0]
ru.setup_scene(res=(400, 560), samples=12)
ru.shoot(prefix + '_front.png', 'front')
ru.shoot(prefix + '_side.png', 'side')
ru.shoot(prefix + '_face.png', 'face', target=(0, 0, 1.65), dist=1.0)
