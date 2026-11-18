"""Pembuat peta statis (SVG) untuk versi PDF dan unduhan peta.

Hanya memakai pustaka standar Python. Setiap peta berisi: bingkai, graticule
(garis lintang/bujur), poligon berwarna sesuai kelas risiko, batas provinsi,
label (opsional), panah utara, skala batang, kotak KETERANGAN, dan sumber data.
"""
from __future__ import annotations

import math
from html import escape

WARNA_KELAS = {"TINGGI": "#E5242A", "SEDANG": "#FFE433", "RENDAH": "#2EAD4B"}
WARNA_TANPA_DATA = "#D5D5D5"
WARNA_LAUT = "#DCEBF1"
WARNA_DARAT_KONTEKS = "#EFEDE7"
FONT = "Arial, Helvetica, sans-serif"


def _fmt(x: float) -> str:
    s = f"{x:.1f}"
    return s[:-2] if s.endswith(".0") else s


def _dp(pts, tol):
    """Douglas-Peucker (ruang piksel)."""
    n = len(pts)
    if n < 4 or tol <= 0:
        return pts
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    tol2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if L2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / L2
                t = 0.0 if t < 0 else 1.0 if t > 1 else t
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, idx = d2, i
        if best > tol2 and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]


class Proyeksi:
    """Equirectangular dengan koreksi cos(lintang tengah); cocok untuk wilayah ekuatorial."""

    def __init__(self, bbox, box):
        lon0, lat0, lon1, lat1 = bbox
        x0, y0, w, h = box
        self.kx = math.cos(math.radians((lat0 + lat1) / 2))
        gw = (lon1 - lon0) * self.kx
        gh = lat1 - lat0
        self.s = min(w / gw, h / gh)
        # pusatkan
        self.ox = x0 + (w - gw * self.s) / 2 - lon0 * self.kx * self.s
        self.oy = y0 + (h - gh * self.s) / 2 + lat1 * self.s
        self.box = box

    def xy(self, lon, lat):
        return lon * self.kx * self.s + self.ox, -lat * self.s + self.oy

    def lonlat(self, x, y):
        return (x - self.ox) / (self.kx * self.s), -(y - self.oy) / self.s

    def km_per_px(self):
        return 111.32 / self.s


def _path(mp, proj, tol=0.6, min_px2=0.8):
    parts = []
    for poly in mp:
        for k, ring in enumerate(poly):
            pts = [proj.xy(x, y) for x, y in ring]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            if (max(xs) - min(xs)) * (max(ys) - min(ys)) < min_px2:
                if k == 0:
                    break  # pulau terlalu kecil di skala ini
                continue
            pts = _dp(pts, tol)
            if len(pts) < 3:
                continue
            d = "M" + "L".join(f"{_fmt(x)} {_fmt(y)}" for x, y in pts) + "Z"
            parts.append(d)
    return "".join(parts)


def _bbox_overlap(a, b):
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def _langkah_graticule(span):
    for step in (0.25, 0.5, 1, 2, 5, 10):
        if span / step <= 6:
            return step
    return 10


def _label_derajat(v, pos, neg):
    if abs(v) < 1e-9:
        return "0°"
    s = f"{abs(v):g}°"
    return s + (pos if v > 0 else neg)


def _nilai_bulat_skala(km):
    for n in (1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000):
        if n >= km:
            return n
    return 1000


def render(
    *,
    fitur_fokus: list[dict],          # [{'geom': mp, 'kelas': 'TINGGI'|..|None, 'label': str|None, 'lonlat': (lon,lat)}]
    fitur_konteks: list[dict],        # [{'geom': mp, 'bbox': [..]}] darat abu-abu
    batas_provinsi: list[dict],       # [{'geom': mp, 'bbox': [..]}] garis batas tebal
    bbox: list[float],
    keterangan_judul: str,
    keterangan_kelas: list[tuple[str, str, int]],  # (KELAS, teks rentang, jumlah)
    tampil_tanpa_data: int = 0,
    sumber: str = "",
    label: bool = False,
    ukuran=(1600, 1100),
    pad=0.06,
) -> str:
    W, H = ukuran
    ml, mr, mt, mb = 92, 28, 44, 74  # margin bingkai untuk label koordinat & sumber
    frame = (ml, mt, W - ml - mr, H - mt - mb)
    lon0, lat0, lon1, lat1 = bbox
    dx, dy = (lon1 - lon0) * pad, (lat1 - lat0) * pad
    view = [lon0 - dx, lat0 - dy, lon1 + dx, lat1 + dy]
    proj = Proyeksi(view, frame)
    # perluas view agar mengisi bingkai penuh (konteks di sekitar)
    vx0, vy1 = proj.lonlat(frame[0], frame[1])
    vx1, vy0 = proj.lonlat(frame[0] + frame[2], frame[1] + frame[3])
    vis = [vx0, vy0, vx1, vy1]

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
           f'font-family="{FONT}">']
    out.append(f'<defs><clipPath id="bingkai"><rect x="{frame[0]}" y="{frame[1]}" width="{frame[2]}" '
               f'height="{frame[3]}"/></clipPath></defs>')
    out.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    out.append(f'<g clip-path="url(#bingkai)">')
    out.append(f'<rect x="{frame[0]}" y="{frame[1]}" width="{frame[2]}" height="{frame[3]}" fill="{WARNA_LAUT}"/>')

    # darat konteks
    ctx = [f for f in fitur_konteks if _bbox_overlap(f["bbox"], vis)]
    if ctx:
        d = "".join(_path(f["geom"], proj, tol=0.8, min_px2=1.5) for f in ctx)
        out.append(f'<path d="{d}" fill="{WARNA_DARAT_KONTEKS}" stroke="#C9C6BC" stroke-width="0.6" '
                   f'fill-rule="evenodd"/>')

    # wilayah fokus, dikelompokkan per warna agar SVG ringkas
    grup: dict[str, list[str]] = {}
    for f in fitur_fokus:
        warna = WARNA_KELAS.get(f.get("kelas") or "", WARNA_TANPA_DATA)
        grup.setdefault(warna, []).append(_path(f["geom"], proj))
    for warna, ds in grup.items():
        out.append(f'<path d="{"".join(ds)}" fill="{warna}" stroke="#FFFFFF" stroke-width="0.9" '
                   f'stroke-linejoin="round" fill-rule="evenodd"/>')

    # batas provinsi
    bp = [f for f in batas_provinsi if _bbox_overlap(f["bbox"], vis)]
    if bp:
        d = "".join(_path(f["geom"], proj, tol=0.7, min_px2=4) for f in bp)
        out.append(f'<path d="{d}" fill="none" stroke="#4A4A4A" stroke-width="1.5" stroke-linejoin="round"/>')

    # graticule
    step = _langkah_graticule(max(vis[2] - vis[0], vis[3] - vis[1]))
    g = ['<g stroke="#7A8C96" stroke-width="0.6" stroke-dasharray="4 4" fill="none" opacity="0.7">']
    lon = math.ceil(vis[0] / step) * step
    while lon <= vis[2]:
        x, _ = proj.xy(lon, 0)
        g.append(f'<line x1="{_fmt(x)}" y1="{frame[1]}" x2="{_fmt(x)}" y2="{frame[1] + frame[3]}"/>')
        lon += step
    lat = math.ceil(vis[1] / step) * step
    while lat <= vis[3]:
        _, y = proj.xy(0, lat)
        g.append(f'<line x1="{frame[0]}" y1="{_fmt(y)}" x2="{frame[0] + frame[2]}" y2="{_fmt(y)}"/>')
        lat += step
    g.append("</g>")
    out.extend(g)

    # label wilayah
    if label:
        fs = 22 if len(fitur_fokus) <= 15 else 19 if len(fitur_fokus) <= 28 else 16
        lab = [f'<g font-size="{fs}" font-weight="bold" fill="#1F2D33" text-anchor="middle" '
               f'stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round" paint-order="stroke">']
        for f in fitur_fokus:
            if not f.get("label"):
                continue
            x, y = proj.xy(*f["lonlat"])
            lab.append(f'<text x="{_fmt(x)}" y="{_fmt(y + fs / 3)}">{escape(f["label"])}</text>')
        lab.append("</g>")
        out.extend(lab)
    out.append("</g>")  # akhir clip

    # bingkai + label koordinat
    out.append(f'<rect x="{frame[0]}" y="{frame[1]}" width="{frame[2]}" height="{frame[3]}" fill="none" '
               f'stroke="#1F2D33" stroke-width="2"/>')
    t = ['<g font-size="21" fill="#33454E">']
    lon = math.ceil(vis[0] / step) * step
    while lon <= vis[2]:
        x, _ = proj.xy(lon, 0)
        lbl = _label_derajat(round(lon, 2), " BT", " BB")
        t.append(f'<text x="{_fmt(x)}" y="{frame[1] - 11}" text-anchor="middle">{lbl}</text>')
        t.append(f'<text x="{_fmt(x)}" y="{frame[1] + frame[3] + 26}" text-anchor="middle">{lbl}</text>')
        lon += step
    lat = math.ceil(vis[1] / step) * step
    while lat <= vis[3]:
        _, y = proj.xy(0, lat)
        lbl = _label_derajat(round(lat, 2), " LU", " LS")
        t.append(f'<text x="{frame[0] - 8}" y="{_fmt(y + 7)}" text-anchor="end">{lbl}</text>')
        lat += step
    t.append("</g>")
    out.extend(t)

    # --- penempatan kotak keterangan: pojok dengan wilayah fokus paling sedikit
    lw, lh = 450, 112 + 44 * (len(keterangan_kelas) + (1 if tampil_tanpa_data else 0)) + 70
    corners = {
        "bl": (frame[0] + 16, frame[1] + frame[3] - lh - 16),
        "br": (frame[0] + frame[2] - lw - 16, frame[1] + frame[3] - lh - 16),
        "tl": (frame[0] + 16, frame[1] + 16),
        "tr": (frame[0] + frame[2] - lw - 16, frame[1] + 16),
    }

    def beban(c):
        x, y = c
        n = 0
        for f in fitur_fokus:
            fx, fy = proj.xy(*f["lonlat"])
            if x - 20 <= fx <= x + lw + 20 and y - 20 <= fy <= y + lh + 20:
                n += 1
        return n

    urutan = ["bl", "br", "tl", "tr"]
    pos = min(urutan, key=lambda k: (beban(corners[k]), urutan.index(k)))
    lx, ly = corners[pos]
    k = [f'<g transform="translate({lx} {ly})">',
         f'<rect width="{lw}" height="{lh}" rx="6" fill="#FFFFFF" fill-opacity="0.94" stroke="#1F2D33" '
         f'stroke-width="1.2"/>',
         f'<text x="20" y="40" font-size="27" font-weight="bold" fill="#0B3C49">KETERANGAN</text>',
         f'<text x="20" y="72" font-size="20" fill="#33454E">{escape(keterangan_judul)}</text>']
    yy = 92
    for kelas, rentang, jml in keterangan_kelas:
        k.append(f'<rect x="20" y="{yy}" width="50" height="30" fill="{WARNA_KELAS[kelas]}" stroke="#666" '
                 f'stroke-width="1"/>')
        teks = kelas.capitalize() + (f"  ({rentang})" if rentang else "")
        k.append(f'<text x="82" y="{yy + 22}" font-size="21" fill="#1F2D33">{escape(teks)}</text>')
        k.append(f'<text x="{lw - 20}" y="{yy + 22}" font-size="19" fill="#55656D" text-anchor="end">'
                 f'{jml} wilayah</text>')
        yy += 44
    if tampil_tanpa_data:
        k.append(f'<rect x="20" y="{yy}" width="50" height="30" fill="{WARNA_TANPA_DATA}" stroke="#666" '
                 f'stroke-width="1"/>')
        k.append(f'<text x="82" y="{yy + 22}" font-size="21" fill="#1F2D33">Tidak dinilai</text>')
        k.append(f'<text x="{lw - 20}" y="{yy + 22}" font-size="19" fill="#55656D" text-anchor="end">'
                 f'{tampil_tanpa_data} wilayah</text>')
        yy += 44
    yy += 10
    k.append(f'<line x1="20" y1="{yy + 11}" x2="70" y2="{yy + 11}" stroke="#4A4A4A" stroke-width="3"/>')
    k.append(f'<text x="82" y="{yy + 18}" font-size="19" fill="#1F2D33">Batas provinsi</text>')
    k.append(f'<rect x="240" y="{yy}" width="50" height="22" fill="#BBBBBB" stroke="#FFFFFF" stroke-width="2.5"/>')
    k.append(f'<text x="300" y="{yy + 18}" font-size="19" fill="#1F2D33">Batas kab/kota</text>')
    k.append("</g>")
    out.extend(k)

    # --- panah utara (pojok kanan atas, kecuali dipakai keterangan)
    nx = frame[0] + frame[2] - 80 if pos != "tr" else frame[0] + 80
    ny = frame[1] + 30
    out.append(f'<g transform="translate({nx} {ny}) scale(1.35)">'
               f'<circle cx="0" cy="34" r="30" fill="#FFFFFF" fill-opacity="0.9" stroke="#1F2D33" stroke-width="1"/>'
               f'<path d="M0 8 L14 50 L0 40 Z" fill="#1F2D33"/><path d="M0 8 L-14 50 L0 40 Z" fill="#FFFFFF" '
               f'stroke="#1F2D33" stroke-width="1.2"/>'
               f'<text x="0" y="0" font-size="18" font-weight="bold" text-anchor="middle" fill="#1F2D33" '
               f'stroke="#FFFFFF" stroke-width="3" paint-order="stroke">U</text></g>')

    # --- skala batang (kanan bawah, kecuali dipakai keterangan)
    target_px = frame[2] * 0.16
    km = _nilai_bulat_skala(target_px * proj.km_per_px())
    px = km / proj.km_per_px()
    sx = frame[0] + frame[2] - px - 60 if pos != "br" else frame[0] + 50
    sy = frame[1] + frame[3] - 60
    half = px / 2
    out.append(f'<g transform="translate({_fmt(sx)} {sy})">'
               f'<rect x="-22" y="-38" width="{_fmt(px + 66)}" height="76" rx="5" fill="#FFFFFF" fill-opacity="0.9"/>'
               f'<rect x="0" y="0" width="{_fmt(half)}" height="11" fill="#1F2D33"/>'
               f'<rect x="{_fmt(half)}" y="0" width="{_fmt(half)}" height="11" fill="#FFFFFF" stroke="#1F2D33" '
               f'stroke-width="1"/>'
               f'<text x="0" y="-8" font-size="18" text-anchor="middle" fill="#1F2D33">0</text>'
               f'<text x="{_fmt(half)}" y="-8" font-size="18" text-anchor="middle" fill="#1F2D33">'
               f'{km / 2:g}</text>'
               f'<text x="{_fmt(px)}" y="-8" font-size="18" text-anchor="middle" fill="#1F2D33">{km:g} km</text>'
               f'<text x="{_fmt(half)}" y="30" font-size="15" text-anchor="middle" fill="#55656D">'
               f'skala perkiraan</text></g>')

    # --- sumber
    if sumber:
        out.append(f'<text x="{frame[0]}" y="{H - 14}" font-size="17" fill="#55656D">{escape(sumber)}</text>')
    out.append("</svg>")
    return "\n".join(out)
