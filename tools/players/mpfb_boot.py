import sys, importlib, addon_utils
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
def dyn(p, k):
    for m in list(sys.modules):
        if m.endswith(p):
            return getattr(importlib.import_module(m), k)
    raise ImportError(p)
