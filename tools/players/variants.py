# Character variants. race weights drive the MakeHuman face/body shape.
VARIANTS = {
    'a': dict(height=1.80, muscle=0.78, weight=0.48, proportions=0.85,
              race=dict(caucasian=0.85, african=0.05, asian=0.10),
              skin='young_caucasian_male', hair='short01', hair_color=(0.10, 0.065, 0.04),
              eyebrows='eyebrow001', eyes='brown'),
    'b': dict(height=1.84, muscle=0.80, weight=0.52, proportions=0.85,
              race=dict(caucasian=0.05, african=0.92, asian=0.03),
              skin='young_african_male', hair='short04', hair_color=(0.03, 0.025, 0.02),
              eyebrows='eyebrow002', eyes='brown'),
    'c': dict(height=1.76, muscle=0.72, weight=0.45, proportions=0.85,
              race=dict(caucasian=0.35, african=0.05, asian=0.60),
              skin='young_asian_male', hair='short04', hair_color=(0.035, 0.03, 0.025),
              eyebrows='eyebrow007', eyes='brown'),
    'd': dict(height=1.82, muscle=0.75, weight=0.55, proportions=0.8,
              race=dict(caucasian=0.55, african=0.35, asian=0.10),
              skin='young_caucasian_male2', hair='short02', hair_color=(0.20, 0.13, 0.07),
              eyebrows='eyebrow005', eyes='brownlight'),
    'keeper': dict(height=1.88, muscle=0.74, weight=0.52, proportions=0.85, keeper=True,
                   race=dict(caucasian=0.75, african=0.10, asian=0.15),
                   skin='middleage_caucasian_male', hair='short02', hair_color=(0.16, 0.11, 0.06),
                   eyebrows='eyebrow003', eyes='blue'),
}


# ---------------------------------------------------------------------------------------------------------------
# Extra outfield players e..p: every face is different (head shape, nose, eyes, mouth, chin, cheeks, ears, brow),
# plus age, skin, hair style/colour, eyebrows, eye colour, height and build. Seeded, so rebuilds are identical.
import random as _random

_PROFILES = {
    # name: (race weights, skins, hair styles, hair colours, skin gains, eye colours)
    'european': (dict(caucasian=0.9, african=0.03, asian=0.07), ['young_caucasian_male', 'young_caucasian_male2', 'middleage_caucasian_male'],
                 ['short01', 'short02', 'short03', 'short04', None], [(0.10, 0.065, 0.04), (0.28, 0.18, 0.08), (0.05, 0.04, 0.035), (0.45, 0.33, 0.15), (0.32, 0.12, 0.06), (0.55, 0.52, 0.5)],
                 [0.9, 1.0, 1.06], ['brown', 'brownlight', 'blue', 'green', 'grey', 'bluegreen']),
    'african': (dict(caucasian=0.04, african=0.93, asian=0.03), ['young_african_male', 'middleage_african_male'],
                ['short04', 'afro01', 'short03', None], [(0.03, 0.025, 0.02), (0.05, 0.04, 0.035), (0.12, 0.08, 0.05)],
                [0.85, 0.95, 1.05], ['brown', 'brown', 'brownlight']),
    'asian': (dict(caucasian=0.2, african=0.03, asian=0.77), ['young_asian_male', 'middleage_asian_male'],
              ['short04', 'short01', 'short03', None], [(0.035, 0.03, 0.025), (0.08, 0.06, 0.04), (0.15, 0.1, 0.06)],
              [0.95, 1.0, 1.08], ['brown', 'brown', 'brownlight']),
    'latin': (dict(caucasian=0.55, african=0.15, asian=0.30), ['young_caucasian_male2', 'young_caucasian_male', 'young_african_male'],
              ['short01', 'short02', 'short03', 'short04'], [(0.06, 0.045, 0.03), (0.14, 0.09, 0.05), (0.03, 0.025, 0.02)],
              [0.82, 0.9, 0.98], ['brown', 'brownlight', 'green']),
    'mixed': (dict(caucasian=0.45, african=0.4, asian=0.15), ['young_caucasian_male2', 'young_african_male', 'young_caucasian_male'],
              ['short01', 'short03', 'short04', 'afro01', None], [(0.04, 0.03, 0.025), (0.1, 0.06, 0.04), (0.2, 0.12, 0.06)],
              [0.8, 0.88, 0.95], ['brown', 'brownlight', 'green', 'grey']),
    'mena': (dict(caucasian=0.6, african=0.12, asian=0.28), ['young_caucasian_male2', 'middleage_caucasian_male'],
             ['short01', 'short02', 'short04', None], [(0.04, 0.03, 0.025), (0.08, 0.05, 0.035)],
             [0.78, 0.86, 0.94], ['brown', 'brown', 'brownlight', 'green']),
}
# (group, base, option-A, option-B): the target file is "<group>/<base>-<option>"; b may be negative direction of the same slider
_FACE_PAIRS = [
    ('nose', 'nose-width1', 'decr', 'incr'), ('nose', 'nose-width2', 'decr', 'incr'), ('nose', 'nose-hump', 'decr', 'incr'), ('nose', 'nose-greek', 'decr', 'incr'),
    ('nose', 'nose-flaring', 'decr', 'incr'), ('nose', 'nose-point-width', 'decr', 'incr'), ('nose', 'nose-scale-vert', 'decr', 'incr'), ('nose', 'nose-volume', 'decr', 'incr'),
    ('nose', 'nose-curve', 'concave', 'convex'), ('nose', 'nose-base', 'down', 'up'), ('nose', 'nose-nostrils-width', 'decr', 'incr'),
    ('mouth', 'mouth-scale-horiz', 'decr', 'incr'), ('mouth', 'mouth-lowerlip-volume', 'decr', 'incr'), ('mouth', 'mouth-upperlip-height', 'decr', 'incr'),
    ('mouth', 'mouth-cupidsbow', 'decr', 'incr'), ('mouth', 'mouth-philtrum-volume', 'decr', 'incr'), ('mouth', 'mouth-angles', 'down', 'up'), ('mouth', 'mouth-scale-vert', 'decr', 'incr'),
    ('chin', 'chin-width', 'decr', 'incr'), ('chin', 'chin-prominent', 'decr', 'incr'), ('chin', 'chin-prognathism', 'decr', 'incr'), ('chin', 'chin-height', 'decr', 'incr'), ('chin', 'chin-cleft', 'decr', 'incr'),
    ('forehead', 'forehead-nubian', 'decr', 'incr'), ('forehead', 'forehead-scale-vert', 'decr', 'incr'), ('forehead', 'forehead-temple', 'decr', 'incr'),
    ('neck', 'neck-scale-horiz', 'decr', 'incr'), ('neck', 'neck-scale-vert', 'decr', 'incr'),
    ('head', 'head-scale-horiz', 'decr', 'incr'), ('head', 'head-scale-vert', 'decr', 'incr'), ('head', 'head-scale-depth', 'decr', 'incr'), ('head', 'head-fat', 'decr', 'incr'),
]
_PAIRED = [  # left/right versions are applied together so the face stays symmetric
    ('eyes', 'eye-scale', 'decr', 'incr'), ('eyes', 'eye-height1', 'decr', 'incr'), ('eyes', 'eye-height2', 'decr', 'incr'), ('eyes', 'eye-corner1', 'down', 'up'),
    ('eyes', 'eye-bag', 'decr', 'incr'), ('eyes', 'eye-eyefold-angle', 'down', 'up'), ('eyes', 'eye-push1', 'in', 'out'), ('eyes', 'eye-trans', 'in', 'out'),
    ('cheek', 'cheek-bones', 'decr', 'incr'), ('cheek', 'cheek-volume', 'decr', 'incr'), ('ears', 'ear-scale', 'decr', 'incr'), ('ears', 'ear-wing', 'decr', 'incr'), ('ears', 'ear-lobe', 'decr', 'incr'),
]
_HEADS = ['head-oval', 'head-round', 'head-square', 'head-rectangular', 'head-diamond', 'head-triangular', 'head-invertedtriangular']
_CODES = 'efghijklmnop'
_MIX = ['european', 'african', 'latin', 'asian', 'mixed', 'european', 'mena', 'african', 'european', 'latin', 'mixed', 'asian']


def _extra(i):
    rng = _random.Random(7000 + i * 131)
    prof = _PROFILES[_MIX[i]]
    race, skins, hairs, hair_cols, gains, eyes = prof
    skin = rng.choice(skins)
    t = {}
    t['head/' + rng.choice(_HEADS)] = round(rng.uniform(0.35, 0.9), 2)
    for grp, base, a, b in rng.sample(_FACE_PAIRS, 9):
        t[f'{grp}/{base}-{rng.choice([a, b])}'] = round(rng.uniform(0.25, 0.8), 2)
    for grp, base, a, b in rng.sample(_PAIRED, 6):
        opt, w = rng.choice([a, b]), round(rng.uniform(0.25, 0.7), 2)
        for side in ('l', 'r'):
            t[f'{grp}/{side}-{base}-{opt}'] = w
    hair = rng.choice(hairs)
    v = dict(height=round(rng.uniform(1.72, 1.91), 2), muscle=round(rng.uniform(0.62, 0.86), 2), weight=round(rng.uniform(0.40, 0.60), 2), proportions=round(rng.uniform(0.75, 0.9), 2),
             age=0.5 if 'middleage' not in skin else 0.62, race=dict(race), skin=skin, skin_gain=rng.choice(gains), eyebrows='eyebrow%03d' % rng.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
             eyes=rng.choice(eyes), targets=t, body_tris=9000, hair_tris=2200, profile=_MIX[i])
    if hair:
        v['hair'] = hair; v['hair_color'] = rng.choice(hair_cols)
    return v


for _i, _c in enumerate(_CODES):
    VARIANTS[_c] = _extra(_i)
