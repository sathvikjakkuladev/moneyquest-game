# Copied from ../assets_v2 by tools/import-assets.ts. Do not edit; reference only, never run by the game.
"""Rule-based hat fitting for the unisex avatar (front/back views).
Places each hat from measurements of the head, the hair and the hat image itself, and hides hair under covering hats."""
import sys, os, json, numpy as np
sys.path.insert(0, "/home/user/assets_v2/animations/avatars/_tools")
import overlay
from PIL import Image
from scipy import ndimage as ndi
A = "/home/user/assets_v2/accessories/head"
OPT = json.load(open("/home/user/mq/options.json"))
KIND = {}
for h in "wizard-hat ranger-hat top-hat tricorn bucket-hat mushroom-cap".split(): KIND[h] = "brim"
for h in "beret rune-beanie bandana bard-cap sailor-cap scholar-cap horned-helm winged-helm".split(): KIND[h] = "cap"
for h in "antlers fox-ears moon-headband owl-crest frost-tiara laurel-wreath".split(): KIND[h] = "band"
for h in "crown flower-crown circlet".split(): KIND[h] = "ring"
KIND["halo"] = "halo"; KIND["goggles"] = "goggles"
NEAT = 6   # under-hat hairstyle (Prodigy-style swap)
LONG = {1, 2, 5}   # long-straight, box-braids, afro: hair covers the ears
EAR_PAINT = False
BIG_HAIR = set()   # was {5}: the redrawn afro reads better whole, with ornaments on top
HAIR_RULE = {h: ("swap" if k in ("brim", "cap") else "show") for h, k in KIND.items()}
# tunables (fractions of head width w)
P = dict(band_y=0.30, brim_k=1.45, cap_k=1.12, cap_sink=0.04, brim_sink=0.05, ring_k=1.04, ring_y=0.30,
         band_k=1.06, band_lift=0.05, halo_k=0.92, halo_lift=0.05, gog_y=0.22, gog_k=1.06, hide_margin=0.02)
def hexrgb(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def reskin(img, target):
    a = np.asarray(img).astype(np.float32); m = overlay.skin(a.astype(np.int32))
    base = np.median(a[m][:, :3], axis=0); a[m, :3] = np.clip(a[m, :3] / base * np.array(hexrgb(target)), 0, 255)
    return Image.fromarray(a.astype(np.uint8))
def hat_geom(im):
    a = np.asarray(im)[:, :, 3] > 40; ys, xs = np.where(a); y0, y1 = ys.min(), ys.max(); H = y1 - y0 + 1
    def width_at(y):
        r = np.where(a[int(y)])[0]; return (r.min(), r.max()) if len(r) else (0, 0)
    rows = range(int(y1 - 0.10 * H), y1 + 1)
    lo = min(width_at(y)[0] for y in rows); hi = max(width_at(y)[1] for y in rows)
    return dict(top=y0, bottom=y1, H=H, bl=lo, br=hi, bw=hi - lo + 1, bcx=(lo + hi) / 2,
                left=xs.min(), right=xs.max(), cx=(xs.min() + xs.max()) / 2, W=xs.max() - xs.min() + 1)
def place(canvas_size, img, x, y, s):
    L = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    l = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    L.alpha_composite(l, (int(round(x)), int(round(y)))); return L
def build(body_png, view="front", hair_i=None, face_i=None, hair_c="black", eye_c="brown", skin_c=None, hat=None, tier="rare", pad=900, params=None):
    p = dict(P, **(params or {}))
    style_i = hair_i
    if hat and HAIR_RULE.get(hat) == "swap" and hair_i is not None: hair_i = NEAT
    baked = None
    if hat:
        bp = f"{A}/{hat}/unisex/hat-{hat}-unisex-meta.json"
        if os.path.exists(bp):
            bm_ = [x for x in json.load(open(bp)) if x["tier"] == tier and x["view"] == view]
            baked = bm_[0] if bm_ else None
    tucked = False
    wrap = bool(hat and baked and HAIR_RULE.get(hat) == "show" and hair_i is not None)
    body = Image.open(body_png).convert("RGBA")
    if skin_c: body = reskin(body, skin_c)
    tmpl = "/home/user/mq/rig/m_front/head.png" if view == "front" else "/home/user/mq/rig/m_back/head.png"
    hair_meta = f"/home/user/mq/layers/hair-{'front' if view=='front' else 'back'}-view-meta.json"
    face_meta = "/home/user/mq/layers/face-front-meta.json" if view == "front" else None
    cwd = os.getcwd(); os.chdir("/home/user/mq")
    ov = overlay.Overlay(tmpl, hair_meta, face_meta if face_i is not None else None, hair_i if hair_i is not None else -1,
                         face_i if face_i is not None else -1, hexrgb(OPT["hair"][hair_c]), hexrgb(OPT["eyes"][eye_c]))
    os.chdir(cwd)
    ov.track([body]); t = ov.track_[0]; s = t["w"] / ov.tm["w"]
    W, Hh = body.size; size = (W + 2 * pad, Hh + 2 * pad)
    ox = pad + t["cx"] - ov.tm["cx"] * s; oy = pad + t["top"] - ov.tm["top"] * s
    layers = {"back": [], "face": [], "hair": []}
    for kind, L, off in ov.layers:
        layers["back" if kind == "back" else ("hair" if kind == "hair" else "face")].append(place(size, L, ox + off[0] * s, oy + off[1] * s, s))
    style_layers = {"back": [], "hair": []}
    if (tucked or (style_i is not None and style_i in LONG and hair_i == style_i)) and style_i is not None:
        os.chdir("/home/user/mq")
        ovs = overlay.Overlay(tmpl, hair_meta, None, style_i, -1, hexrgb(OPT["hair"][hair_c]), (0, 0, 0))
        os.chdir(cwd)
        for kind, L, off in ovs.layers:
            style_layers["back" if kind == "back" else "hair"].append(place(size, L, ox + off[0] * s, oy + off[1] * s, s))
    bodyL = Image.new("RGBA", size, (0, 0, 0, 0)); bodyL.alpha_composite(body, (pad, pad))
    w = t["w"]; top = pad + t["top"]; cx = pad + t["cx"]
    skinm = overlay.skin(np.asarray(bodyL).astype(np.int32))
    def headw_at(y):
        r = np.where(skinm[int(y)])[0]; return (r.max() - r.min() + 1, (r.max() + r.min()) / 2) if len(r) else (w, cx)
    hatL = None
    if hat:
        kind = KIND[hat]
        meta = json.load(open(f"{A}/{hat}/hat-{hat}-meta.json"))
        m = [x for x in meta if x["tier"] == tier and x["sex"] == "male" and x["view"] == view][0]
        him = Image.open(f"{A}/{hat}/male/{m['file']}").convert("RGBA"); g = hat_geom(him)
        # silhouette (head + all hair) to find what the hat rests on
        sil = np.asarray(bodyL)[:, :, 3] > 60
        for L in layers["back"] + layers["hair"]: sil |= np.asarray(L)[:, :, 3] > 60
        xs0, xs1 = int(cx - 0.30 * w), int(cx + 0.30 * w)
        colband = sil[:, xs0:xs1]; sil_top = np.where(colband.any(1))[0].min()
        bsil = np.asarray(bodyL)[:, :, 3] > 60
        body_top = np.where(bsil[:, xs0:xs1].any(1))[0].min()
        hair_lift = min(0, int(sil_top) - int(body_top))      # negative when hair rises above the head
        def silw(y, m):
            r = np.where(m[int(y)])[0]; return (r.max() - r.min() + 1) if len(r) else w
        if kind in ("brim", "cap"):
            yb = top + p["band_y"] * w; hw, hcx = headw_at(yb)
            k = p["brim_k"] if kind == "brim" else p["cap_k"]; sc = k * hw / g["bw"]
            sink = (p["brim_sink"] if kind == "brim" else p["cap_sink"]) * w
            hx = hcx - g["bcx"] * sc; hy = yb + sink - g["bottom"] * sc
            hide_y = yb + p["hide_margin"] * w
        elif kind == "ring":
            yr = top + (0.40 if hat == "circlet" else p["ring_y"]) * w + 0.9 * hair_lift
            cw_ = float(np.clip(silw(yr, sil), 0.70 * w, 1.05 * w))
            base = g["bw"] if g["bw"] > 0.5 * g["W"] else 0.92 * g["W"]   # thin rings (circlet) have a pointed bottom
            sc = p["ring_k"] * cw_ / base
            hx = cx - g["bcx"] * sc; hy = yr - g["bottom"] * sc; hide_y = None
        elif kind == "halo":
            sc = p["halo_k"] * w / g["W"]; hx = cx - g["cx"] * sc; hy = sil_top - p["halo_lift"] * w - g["bottom"] * sc; hide_y = None
        elif kind == "band":   # original tuned fit, lifted by hair height, widened a little for big hair
            sc0 = s; hx0 = ox + m["off"][0] * s; hy0 = oy + m["off"][1] * s
            yl = top + 0.15 * w
            grow = float(np.clip(silw(yl, sil) / max(silw(yl, bsil), 1), 1.0, 1.12))
            cxh = hx0 + g["cx"] * sc0; sc = sc0 * grow
            hx = cxh - g["cx"] * sc; hy = hy0 + hair_lift - (g["bottom"] * sc - g["bottom"] * sc0); hide_y = None
        else:  # goggles: strap across the forehead
            yg = top + p["gog_y"] * w
            sc = p["gog_k"] * float(np.clip(silw(yg, sil), 0.8 * w, 1.15 * w)) / g["W"]
            hx = cx - g["cx"] * sc; hy = yg - (g["top"] + g["H"] / 2) * sc; hide_y = None
        if baked:
            him = Image.open(f"{A}/{hat}/unisex/{baked['file']}").convert("RGBA")
            hx = ox + baked["off"][0] * s; hy = oy + baked["off"][1] * s; sc = s
            if kind == "halo": hy += 0.9 * hair_lift          # float above tall hair (afro) instead of sinking into it
            if HAIR_RULE.get(hat) == "show": hide_y = None
        hatL = place(size, him, hx, hy, sc)
        if baked and wrap and style_i in BIG_HAIR:
            # hair that sticks out past the accessory's band is tucked under it: cut along the band's lower edge,
            # tapering outward past its ends, with a drawn edge; hair inside the band's span stays (it shows through)
            C = np.asarray(hatL)[:, :, 3] > 60
            cols = np.where(C.any(0))[0]; cL, cR = cols.min(), cols.max()
            bot = np.full(size[0], -1.0)
            ys_last = size[1] - 1 - np.argmax(C[::-1, :], axis=0)
            bot[cL:cR + 1] = ys_last[cL:cR + 1]
            Xa = np.arange(size[0], dtype=np.float32)
            big = style_i in BIG_HAIR          # big hair (afro) is pressed under the band everywhere
            inner = (cR - cL) * (0.5 if big else 0.10)
            cut = np.full(size[0], -1e9, dtype=np.float32)
            edge_l = bot[cL]; edge_r = bot[cR]
            left = Xa < cL + inner; right = Xa > cR - inner
            cut[left] = np.where(Xa[left] < cL, edge_l, bot[np.clip(Xa[left].astype(int), cL, cR)])
            cut[right] = np.where(Xa[right] > cR, edge_r, bot[np.clip(Xa[right].astype(int), cL, cR)])
            Yg = np.arange(size[1], dtype=np.float32)[:, None]
            keep = Yg >= cut[None, :]
            stroke = max(3, int(round(0.012 * t["w"])))
            band = keep & (Yg < cut[None, :] + stroke)
            for L in layers["back"] + layers["hair"]:
                a = np.array(L); al = a[:, :, 3]
                e = band & (al > 90); al[~keep] = 0
                a[e, 0], a[e, 1], a[e, 2] = 11, 22, 48
                L.paste(Image.fromarray(a))
        if hide_y is not None:
            bL = hx + g["bl"] * sc; bR = hx + g["br"] * sc
            X = np.arange(size[0], dtype=np.float32)
            d = np.maximum(0, np.maximum(bL - X, X - bR))
            cut = hide_y + d * 1.15                      # flat under the brim, sloping down past its edges
            Y = np.arange(size[1], dtype=np.float32)[:, None]
            keep = Y > cut[None, :]
            stroke = max(3, int(round(0.012 * w)))
            band = keep & (Y < cut[None, :] + stroke)
            for L in layers["back"] + layers["hair"]:
                a = np.array(L); al = a[:, :, 3]
                edge = band & (al > 90)
                al[~keep] = 0
                a[edge, 0], a[edge, 1], a[edge, 2], a[edge, 3] = 11, 22, 48, 255
                a[:, :, 3] = al if True else al
                a[edge, 3] = 255
                L.paste(Image.fromarray(a))
    w_ = t["w"]; top_ = pad + t["top"]; cx_ = pad + t["cx"]
    Y = np.arange(size[1])[:, None]; X = np.arange(size[0])[None, :]
    if tucked:   # keep only the style's lengths below the tuck line, with a drawn edge
        y_t = top_ + 0.40 * w_; stroke = max(3, int(round(0.012 * w_)))
        for L in style_layers["back"] + style_layers["hair"]:
            a = np.array(L); al = a[:, :, 3]
            edge = (Y >= y_t) & (Y < y_t + stroke) & (al > 90)
            al[np.broadcast_to(Y < y_t, al.shape)] = 0
            a[edge, :3] = (11, 22, 48); L.paste(Image.fromarray(a))
    face_ell = ((X - cx_) / (0.40 * w_)) ** 2 + ((Y - (top_ + 0.55 * w_)) / (0.47 * w_)) ** 2 <= 1.0
    ear_zone = (~face_ell) & (Y > top_ + 0.30 * w_) & (Y < top_ + 0.92 * w_) & (np.abs(X - cx_) < 0.62 * w_)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    for L in style_layers["back"] if tucked else []: out.alpha_composite(L)
    for L in layers["back"]: out.alpha_composite(L)
    out.alpha_composite(bodyL)
    if EAR_PAINT and style_i in LONG and hair_i is not None and not (hat and HAIR_RULE.get(hat) == "swap"):
        # long hair covers the ears: paint a hair lock over each ear, flat hair colour with a drawn edge
        cur = np.array(out)
        EARS = {"front": [(66, 303, 66, 76), (468, 300, 42, 66)], "back": [(66, 306, 66, 76), (466, 300, 46, 66)]}
        Xt = (X - ox) / s; Yt = (Y - oy) / s
        fill = np.zeros(cur.shape[:2], bool)
        for ex, ey, rx, ry in EARS[view]:
            fill |= ((Xt - ex) / rx) ** 2 + ((Yt - ey) / ry) ** 2 <= 1.0
        fill &= cur[:, :, 3] > 0
        stroke = max(3, int(round(0.012 * w_)))
        border = fill & ~ndi.binary_erosion(fill, iterations=stroke)
        outside = ndi.binary_dilation(~fill, iterations=1)
        hairish = np.zeros_like(fill)
        for L in (style_layers["back"] + style_layers["hair"] + layers["back"] + layers["hair"]):
            hairish |= np.asarray(L)[:, :, 3] > 100
        # edge only where the lock meets skin or empty space, not where it meets other hair
        near = ndi.binary_dilation((~hairish & ~fill), iterations=stroke + 1)
        # copy colour from the nearest real hair pixel so strands and shading carry across the ear
        src = hairish & ~fill & (cur[:, :, 3] > 200)
        dark = cur[:, :, :3].max(2) < 60
        src &= ~dark  # sample hair colour, not outlines
        if src.any():
            _, (iy, ix) = ndi.distance_transform_edt(~src, return_indices=True)
            cur[fill, :3] = cur[iy[fill], ix[fill], :3]
        else:
            cur[fill, :3] = hexrgb(OPT["hair"][hair_c])
        cur[fill, 3] = 255
        ol = border & near; cur[ol, :3] = (11, 22, 48)
        out = Image.fromarray(cur)
    for L in layers["face"]: out.alpha_composite(L)
    for L in style_layers["hair"] if tucked else []: out.alpha_composite(L)
    for L in layers["hair"]: out.alpha_composite(L)
    if hatL: out.alpha_composite(hatL)
    return out
