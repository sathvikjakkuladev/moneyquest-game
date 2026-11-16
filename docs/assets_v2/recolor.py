# Copied from ../assets_v2 by tools/import-assets.ts. Do not edit; reference only, never run by the game.
"""Apply a costume colour set to any RGBA image (still, frame or sprite sheet).
usage: python3 recolor.py costume_sets.json <set-id> in.png out.png [protect_above_y]
protect_above_y: rows above this y are left alone (keeps the cyan rim light on the bald head)."""
import sys, json, numpy as np
from PIL import Image

def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = ((b - r)[gm] / d[gm]) + 2
    h[bm] = ((r - g)[bm] / d[bm]) + 4
    h = h * 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx

def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60.0
    i = np.floor(h).astype(int) % 6; f = h - np.floor(h)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,))
    for k, (R, G, B) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = i == k
        out[m, 0] = R[m]; out[m, 1] = G[m]; out[m, 2] = B[m]
    return out

def masks(spec, h, s, v, alpha):
    res = {}
    taken = np.zeros(h.shape, bool)
    for name in ["trim", "light", "cape", "tunic"]:
        g = spec["groups"][name]
        m = (alpha > 0) & (h >= g["h"][0]) & (h <= g["h"][1]) & (s >= g["s"][0]) & (s <= g["s"][1]) & (v >= g["v"][0]) & (v <= g["v"][1]) & ~taken
        res[name] = m; taken |= m
    return res

def apply(spec, set_id, im, protect_above=None):
    st = next(x for x in spec["sets"] if x["id"] == set_id)
    a = np.asarray(im.convert("RGBA")).astype(float)
    rgb = a[..., :3] / 255.0; alpha = a[..., 3]
    h, s, v = rgb_to_hsv(rgb)
    ms = masks(spec, h, s, v, alpha)
    if protect_above is not None:
        for k in ms: ms[k][:int(protect_above), :] = False
    nh, ns, nv = h.copy(), s.copy(), v.copy()
    for name, t in st["map"].items():
        m = ms[name]
        nh[m] = t.get("h", 0)
        ns[m] = np.clip(s[m] * t.get("s_mul", 1.0) + t.get("s_add", 0.0), 0, 1)
        nv[m] = np.clip(v[m] * t.get("v_mul", 1.0), 0, 1)
    out = hsv_to_rgb(nh, ns, nv)
    res = a.copy(); res[..., :3] = np.clip(out * 255 + 0.5, 0, 255)
    return Image.fromarray(res.astype(np.uint8), "RGBA")

if __name__ == "__main__":
    spec = json.load(open(sys.argv[1]))
    pa = float(sys.argv[5]) if len(sys.argv) > 5 else None
    apply(spec, sys.argv[2], Image.open(sys.argv[3]), pa).save(sys.argv[4])
