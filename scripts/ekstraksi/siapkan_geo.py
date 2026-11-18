"""Menyiapkan batas wilayah (GeoJSON) dan menautkan kode wilayah ke tabel IRBI (sekali pakai).

Sumber batas: https://github.com/cahyadsn/wilayah_boundaries (MIT) - sesuai
Kepmendagri No 300.2.2-2430 Tahun 2025. Berkas SQL berisi kolom kode, nama,
lat, lng, dan path (larik [lat, lng]).

Keluaran:
  data/geo/provinsi.geojson   - 38 provinsi (disederhanakan untuk web)
  data/geo/kabkota.geojson    - 514 kabupaten/kota (disederhanakan untuk web)
  menambahkan kolom `kode` ke data/irbi_*.csv

Pemakaian:
  python3 -I scripts/ekstraksi/siapkan_geo.py _work/geo-src _work data
"""
import csv
import json
import math
import re
import sys
from pathlib import Path

ROW = re.compile(r"\('([\d.]+)',\s*'((?:[^'\\]|\\.|'')*)',\s*([-\d.]+),\s*([-\d.]+),\s*'(\[.*?\])'\s*\)",
                 flags=re.S)

NAMA_PROV_IRBI = {  # nama di buku -> nama di sumber batas (huruf besar)
    "DKI JAKARTA": "DAERAH KHUSUS IBUKOTA JAKARTA",
}


def baca_sql(path: Path):
    s = path.read_text(encoding="utf-8")
    for m in ROW.finditer(s):
        kode, nama, lat, lng, p = m.groups()
        coords = json.loads(p)
        yield kode, nama.replace("''", "'"), float(lat), float(lng), coords


def kedalaman(x):
    d = 0
    while isinstance(x, list):
        d += 1
        x = x[0] if x else None
    return d


def ke_multipolygon(coords):
    """Path sumber: Polygon (3 tingkat) atau MultiPolygon (4 tingkat), urutan [lat, lng]."""
    d = kedalaman(coords)
    polys = [coords] if d == 3 else coords
    out = []
    for poly in polys:
        rings = []
        for ring in poly:
            r = [[pt[1], pt[0]] for pt in ring]
            if r and r[0] != r[-1]:
                r.append(r[0])
            rings.append(r)
        out.append(rings)
    return out


def _dp(pts, tol):
    """Douglas-Peucker iteratif."""
    n = len(pts)
    if n < 3:
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
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, idx = d2, i
        if best > tol2 and idx > 0:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]


def luas(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))) / 2


def sederhanakan(mp, tol, nd, min_area):
    out = []
    for poly in mp:
        rings = []
        for k, ring in enumerate(poly):
            r = _dp(ring, tol)
            if len(r) < 4:
                continue
            if k == 0 and luas(r) < min_area:
                break  # pulau sangat kecil dibuang
            rings.append([[round(x, nd), round(y, nd)] for x, y in r])
        if rings:
            out.append(rings)
    if not out:  # jangan sampai wilayah hilang: ambil poligon terbesar tanpa ambang luas
        big = max(mp, key=lambda p: luas(p[0]))
        r = _dp(big[0], tol / 4)
        out = [[[[round(x, nd), round(y, nd)] for x, y in r]]]
    return out


def bbox(mp):
    xs = [p[0] for poly in mp for ring in poly for p in ring]
    ys = [p[1] for poly in mp for ring in poly for p in ring]
    return [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]


# Nama lama di buku -> nama resmi saat ini (Kepmendagri 2025)
ALIAS_KAB = {
    "MAMUJU UTARA": "PASANGKAYU",
    "TOBA SAMOSIR": "TOBA",
}


def norm(s: str) -> str:
    """Kunci pencocokan: huruf besar, tanpa 'Kabupaten'/'Administrasi', tanpa spasi."""
    s = s.upper().replace(".", " ").replace(",", " ").replace("-", " ")
    s = re.sub(r"\bKABUPATEN\b|\bADMINISTRASI\b", " ", s)
    s = re.sub(r"\bKEP\b", "KEPULAUAN", s)
    s = " ".join(s.split())
    s = ALIAS_KAB.get(s, s)
    return s.replace(" ", "")


def main(src, workdir, datadir):
    src, work, data = Path(src), Path(workdir), Path(datadir)
    (data / "geo").mkdir(parents=True, exist_ok=True)

    prov_rows = [r for f in sorted(src.glob("prov_*.sql")) for r in baca_sql(f)]
    kab_rows = [r for f in sorted(src.glob("kab_*.sql")) for r in baca_sql(f)]
    print("sumber: provinsi", len(prov_rows), "kab/kota", len(kab_rows))

    # --- Provinsi
    prov_csv = list(csv.DictReader(open(work / "irbi_provinsi.csv", encoding="utf-8")))
    kode_prov = {}
    for kode, nama, *_ in prov_rows:
        kode_prov[nama.upper()] = kode
    for r in prov_csv:
        nm = NAMA_PROV_IRBI.get(r["provinsi"], r["provinsi"])
        r["kode"] = kode_prov[nm]

    # --- Kab/kota: cocokkan nama dalam provinsi yang sama
    kab_csv = list(csv.DictReader(open(work / "irbi_kabkota.csv", encoding="utf-8")))
    prov_kode_by_nama = {r["provinsi"]: r["kode"] for r in prov_csv}
    sumber = {}
    for kode, nama, lat, lng, _ in kab_rows:
        sumber.setdefault(kode.split(".")[0], {})[norm(nama)] = (kode, nama)
    kode_kab, gagal = {}, []
    for r in kab_csv:
        pk = prov_kode_by_nama[r["provinsi"]]
        cand = sumber.get(pk, {})
        key = norm(r["kabkota"])
        hit = cand.get(key)
        if not hit and not key.startswith("KOTA"):
            hit = cand.get(norm("KOTA " + r["kabkota"]))  # mis. JAKARTA BARAT
        if not hit:
            gagal.append((r["provinsi"], r["kabkota"], sorted(cand)[:60]))
            continue
        kode_kab[(r["provinsi"], r["kabkota"])] = hit
        r["kode"] = hit[0]
        r["nama_resmi"] = hit[1]
    for g in gagal:
        print("  ! gagal cocok:", g[0], "|", g[1])
        print("      kandidat:", ", ".join(g[2]))
    if gagal:
        sys.exit(1)
    assert len({r["kode"] for r in kab_csv}) == 514

    # --- GeoJSON web
    def fitur(rows, tol, nd, min_area, props_fn):
        feats = []
        for kode, nama, lat, lng, coords in rows:
            mp = sederhanakan(ke_multipolygon(coords), tol, nd, min_area)
            feats.append({"type": "Feature", "properties": props_fn(kode, nama, lat, lng, mp),
                          "geometry": {"type": "MultiPolygon", "coordinates": mp}})
        return {"type": "FeatureCollection", "features": feats}

    def pprops(kode, nama, lat, lng, mp):
        return {"kode": kode, "nama": nama, "lat": round(lat, 4), "lng": round(lng, 4), "bbox": bbox(mp)}

    gj_prov = fitur(prov_rows, 0.006, 4, 0.00002, pprops)
    gj_kab = fitur(kab_rows, 0.003, 4, 0.000005, pprops)
    # versi detail untuk peta cetak (SVG/PDF)
    gj_prov_d = fitur(prov_rows, 0.0012, 5, 0.000002, pprops)
    gj_kab_d = fitur(kab_rows, 0.0008, 5, 0.000001, pprops)
    for name, gj in [("provinsi", gj_prov), ("kabkota", gj_kab),
                     ("provinsi_detail", gj_prov_d), ("kabkota_detail", gj_kab_d)]:
        path = data / "geo" / f"{name}.geojson"
        path.write_text(json.dumps(gj, separators=(",", ":")), encoding="utf-8")
        print(f"{path}: {len(gj['features'])} fitur, {path.stat().st_size/1e6:.2f} MB")

    # --- Tulis CSV final ke data/
    prov_fields = ["kode", "no", "provinsi", "irbi_seb", "irbi_2025", "kelas"]
    with open(data / "irbi_provinsi.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=prov_fields)
        w.writeheader()
        for r in prov_csv:
            w.writerow({k: r[k] for k in prov_fields})

    kab_fields = ["kode", "peringkat", "kabkota", "provinsi", "skor", "kelas", "nama_resmi"]
    with open(data / "irbi_kabkota.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=kab_fields)
        w.writeheader()
        for r in kab_csv:
            w.writerow({k: r[k] for k in kab_fields})

    anc = list(csv.DictReader(open(work / "irbi_ancaman.csv", encoding="utf-8")))
    anc_fields = ["ancaman", "peringkat", "kode", "kabkota", "provinsi", "skor", "kelas"]
    with open(data / "irbi_ancaman.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=anc_fields)
        w.writeheader()
        for r in anc:
            r["kode"] = kode_kab[(r["provinsi"], r["kabkota"])][0]
            w.writerow({k: r[k] for k in anc_fields})
    print("CSV ditulis ke", data)


if __name__ == "__main__":
    main(*sys.argv[1:4])
