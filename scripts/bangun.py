#!/usr/bin/env python3
"""Pra-render buku digital IRBI 2025.

Dijalankan otomatis oleh Quarto sebelum render (lihat `pre-render` di _quarto.yml),
atau manual:  python3 scripts/bangun.py

Membaca data di folder data/ lalu membuat:
  _gen/...                    potongan Markdown (tabel, ringkasan, peta) yang di-include halaman .qmd
  assets/data/irbi-data.js    data untuk peta & tabel interaktif (HTML)
  assets/data/irbi-geo.js     batas wilayah untuk peta interaktif (HTML)
  assets/data/irbi-geo-detail.js, irbi-aset.js   geometri detail & logo untuk PDF yang dibuat di peramban
  peta/svg/*.svg              peta & grafik statis (versi PDF buku)
  peta/pdf/*.pdf              peta siap unduh lengkap dengan judul, keterangan, dan tabel

Hanya memakai pustaka standar Python 3.9+.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import peta_svg as ps  # noqa: E402

DATA = ROOT / "data"
GEN = ROOT / "_gen"
PETA = ROOT / "peta"
ASET_DATA = ROOT / "assets" / "data"
VERSI_CACHE = "3"
TAHUN = 2025

KELAS = ["TINGGI", "SEDANG", "RENDAH"]
SUMBER_PETA = ("Sumber: Buku Indeks Risiko Bencana Indonesia (IRBI) 2025, BNPB · Batas wilayah: Kepmendagri "
               "No. 300.2.2-2430 Tahun 2025 (data cahyadsn/wilayah_boundaries)")
PARAMETER_PETA = [
    "Indeks Bahaya BNPB 2021",
    "Hasil Proyeksi IRBI 2025–2045: Indeks Jiwa Terpapar, Indeks Kerugian, dan Indeks Kerusakan "
    "Lingkungan Proyeksi 2025",
    "Indeks Kapasitas Daerah (IKD) 2025",
]

PERINGATAN: list[str] = []


def warna_brand() -> dict[str, str]:
    """Baca palet sederhana dari _brand.yml (tanpa pustaka YAML): nama: "#RRGGBB"."""
    path = ROOT / "_brand.yml"
    hasil = {}
    if path.exists():
        dalam_palet = False
        for baris in path.read_text(encoding="utf-8").splitlines():
            if re.match(r"^\s{2}palette:\s*$", baris):
                dalam_palet = True
                continue
            if dalam_palet:
                if baris.strip() and not baris.startswith("    "):
                    dalam_palet = False
                    continue
                m = re.match(r'^\s{4}([\w-]+):\s*"?(#[0-9A-Fa-f]{6})"?', baris)
                if m:
                    hasil[m.group(1)] = m.group(2).upper()
    return hasil


BRAND = warna_brand()
for _k, _n in (("TINGGI", "tinggi"), ("SEDANG", "sedang"), ("RENDAH", "rendah")):
    if _n in BRAND:
        ps.WARNA_KELAS[_k] = BRAND[_n]
if "tanpa" in BRAND:
    ps.WARNA_TANPA_DATA = BRAND["tanpa"]
WARNA_PRIMER = BRAND.get("teal", "#0B3C49")


def peringatan(msg: str) -> None:
    PERINGATAN.append(msg)


# --------------------------------------------------------------------------- util
def angka(x: float, nd: int = 2) -> str:
    """Format angka gaya Indonesia: 1.234,56"""
    s = f"{x:,.{nd}f}"
    return s.replace(",", "§").replace(".", ",").replace("§", ".")


def slugify(s: str) -> str:
    s = s.lower().replace("&", " dan ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


AKRONIM = {"DKI", "DI", "II", "III", "IV"}


def judul(s: str) -> str:
    """'KOTA BANDA ACEH' -> 'Kota Banda Aceh'; 'DKI JAKARTA' -> 'DKI Jakarta'."""
    kata = []
    for w in s.split():
        if w in AKRONIM:
            kata.append(w)
        else:
            kata.append("-".join(p.capitalize() for p in w.split("-")))
    t = " ".join(kata)
    return re.sub(r"\bDan\b", "dan", t)


def baca_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]


def ke_float(s: str, konteks: str) -> float | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        return float(s)
    except ValueError:
        peringatan(f"{konteks}: nilai '{s}' bukan angka, baris diabaikan")
        return None


def tulis(path: Path, isi: str) -> bool:
    """Tulis hanya jika berubah (agar Quarto preview tidak memicu render ulang tanpa perlu)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == isi:
        return False
    path.write_text(isi, encoding="utf-8")
    return True


def ts(s: str) -> str:
    """String literal Typst."""
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def esc(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


# --------------------------------------------------------------------------- data
class Jenis:
    def __init__(self, r: dict):
        self.slug = r["slug"]
        self.nama = r["nama"]
        self.batas_sedang = float(r["batas_sedang"])
        self.batas_tinggi = float(r["batas_tinggi"])
        self.tampilkan_rentang = r.get("tampilkan_rentang", "").lower() in ("ya", "y", "true", "1")
        self.keterangan = r.get("keterangan", "")

    def kelas(self, skor: float) -> str:
        if skor > self.batas_tinggi:
            return "TINGGI"
        if skor >= self.batas_sedang:
            return "SEDANG"
        return "RENDAH"

    def rentang(self) -> dict[str, str]:
        if not self.tampilkan_rentang:
            return {k: "" for k in KELAS}
        return {
            "RENDAH": f"< {angka(self.batas_sedang)}",
            "SEDANG": f"{angka(self.batas_sedang)} – {angka(self.batas_tinggi)}",
            "TINGGI": f"> {angka(self.batas_tinggi)}",
        }


class Data:
    def __init__(self):
        self.jenis = {r["slug"]: Jenis(r) for r in baca_csv(DATA / "jenis_indeks.csv")}
        self.irbi = self.jenis["irbi"]
        self.ancaman = [j for s, j in self.jenis.items() if s != "irbi"]
        geo_prov = json.loads((DATA / "geo" / "provinsi.geojson").read_text(encoding="utf-8"))
        geo_kab = json.loads((DATA / "geo" / "kabkota.geojson").read_text(encoding="utf-8"))
        self.geo_prov = geo_prov
        self.geo_kab = geo_kab
        self.geo_info_kab = {f["properties"]["kode"]: f["properties"] for f in geo_kab["features"]}
        self.geo_info_prov = {f["properties"]["kode"]: f["properties"] for f in geo_prov["features"]}
        self._muat_provinsi()
        self._muat_kabkota()
        self._muat_ancaman()

    def _muat_provinsi(self):
        rows = []
        for i, r in enumerate(baca_csv(DATA / "irbi_provinsi.csv"), 2):
            kode = r.get("kode", "")
            skor = ke_float(r.get("irbi_2025", ""), f"irbi_provinsi.csv baris {i}")
            if not kode or skor is None:
                continue
            if kode not in self.geo_info_prov:
                peringatan(f"irbi_provinsi.csv baris {i}: kode provinsi '{kode}' tidak ada di data batas wilayah")
            kelas = r.get("kelas", "").upper() or self.irbi.kelas(skor)
            if kelas != self.irbi.kelas(skor):
                peringatan(f"Provinsi {r['provinsi']}: kelas '{kelas}' tidak sesuai ambang untuk skor {skor}")
            nama = r["provinsi"].upper()
            rows.append({
                "kode": kode, "provinsi": nama, "nama": judul(nama),
                "seb": ke_float(r.get("irbi_seb", ""), f"irbi_provinsi.csv baris {i}"),
                "skor": skor, "kelas": kelas,
                "slug": slugify(nama), "halaman": f"provinsi/{kode}-{slugify(nama)}.html",
            })
        rows.sort(key=lambda r: r["kode"])
        urut = sorted(rows, key=lambda r: -r["skor"])
        for n, r in enumerate(urut, 1):
            r["peringkat"] = n
        self.provinsi = rows
        self.prov_by_kode = {r["kode"]: r for r in rows}
        self.prov_by_nama = {r["provinsi"]: r for r in rows}

    def _muat_kabkota(self):
        rows = []
        for i, r in enumerate(baca_csv(DATA / "irbi_kabkota.csv"), 2):
            kode = r.get("kode", "")
            skor = ke_float(r.get("skor", ""), f"irbi_kabkota.csv baris {i}")
            if not kode or skor is None:
                continue
            prov = self.prov_by_kode.get(kode.split(".")[0])
            if not prov:
                peringatan(f"irbi_kabkota.csv baris {i}: provinsi untuk kode '{kode}' tidak ditemukan")
                continue
            if kode not in self.geo_info_kab:
                peringatan(f"irbi_kabkota.csv baris {i}: kode '{kode}' tidak ada di data batas wilayah (tidak dipetakan)")
            kelas = r.get("kelas", "").upper() or self.irbi.kelas(skor)
            if kelas != self.irbi.kelas(skor):
                peringatan(f"Kab/kota {r['kabkota']}: kelas '{kelas}' tidak sesuai ambang untuk skor {skor}")
            rows.append({"kode": kode, "kabkota": r["kabkota"].upper(), "prov_kode": prov["kode"],
                         "provinsi": prov["provinsi"], "skor": skor, "kelas": kelas,
                         "peringkat_buku": r.get("peringkat", "")})
        rows.sort(key=lambda r: (-r["skor"], r["kabkota"]))
        for n, r in enumerate(rows, 1):
            r["peringkat"] = n
        kode_dup = [k for k in {r["kode"] for r in rows} if sum(1 for x in rows if x["kode"] == k) > 1]
        for k in kode_dup:
            peringatan(f"irbi_kabkota.csv: kode '{k}' muncul lebih dari sekali")
        self.kabkota = rows
        self.kab_by_kode = {r["kode"]: r for r in rows}
        # Di buku IRBI 2025, nilai provinsi = rata-rata skor kab/kota di provinsi tersebut.
        for p in self.provinsi:
            skor = [r["skor"] for r in rows if r["prov_kode"] == p["kode"]]
            if skor and abs(statistics.mean(skor) - p["skor"]) > 0.02:
                peringatan(f"Provinsi {p['nama']}: nilai {angka(p['skor'])} di irbi_provinsi.csv berbeda dari "
                           f"rata-rata {len(skor)} kab/kota ({angka(statistics.mean(skor))})")

    def _muat_ancaman(self):
        per = {j.slug: [] for j in self.ancaman}
        for i, r in enumerate(baca_csv(DATA / "irbi_ancaman.csv"), 2):
            j = self.jenis.get(r.get("ancaman", ""))
            if not j or j.slug == "irbi":
                peringatan(f"irbi_ancaman.csv baris {i}: jenis ancaman '{r.get('ancaman')}' tidak dikenal")
                continue
            skor = ke_float(r.get("skor", ""), f"irbi_ancaman.csv baris {i}")
            kab = self.kab_by_kode.get(r.get("kode", ""))
            if skor is None or not kab:
                if not kab:
                    peringatan(f"irbi_ancaman.csv baris {i}: kode '{r.get('kode')}' tidak ada di irbi_kabkota.csv")
                continue
            kelas = r.get("kelas", "").upper() or j.kelas(skor)
            per[j.slug].append({"kode": kab["kode"], "kabkota": kab["kabkota"], "prov_kode": kab["prov_kode"],
                                "provinsi": kab["provinsi"], "skor": skor, "kelas": kelas,
                                "peringkat_buku": int(r["peringkat"]) if r.get("peringkat", "").isdigit() else None})
        for slug, rows in per.items():
            # pertahankan urutan buku bila ada, selain itu urut skor
            rows.sort(key=lambda r: (r["peringkat_buku"] if r["peringkat_buku"] else 10**6, -r["skor"]))
            if any(r["peringkat_buku"] is None for r in rows):
                rows.sort(key=lambda r: -r["skor"])
            for n, r in enumerate(rows, 1):
                r["peringkat"] = n
        self.per_ancaman = per

    # ---- turunan
    def kab_provinsi(self, kode_prov: str) -> list[dict]:
        return [r for r in self.kabkota if r["prov_kode"] == kode_prov]

    @staticmethod
    def hitung_kelas(rows) -> dict[str, int]:
        c = {k: 0 for k in KELAS}
        for r in rows:
            c[r["kelas"]] = c.get(r["kelas"], 0) + 1
        return c


# --------------------------------------------------------------------------- data JS (HTML interaktif)
def bangun_data_js(d: Data):
    data = {
        "tahun": TAHUN,
        "jenis": [{"slug": j.slug, "nama": j.nama, "batas_sedang": j.batas_sedang, "batas_tinggi": j.batas_tinggi,
                   "rentang": j.tampilkan_rentang, "keterangan": j.keterangan} for j in d.jenis.values()],
        "warna": {**ps.WARNA_KELAS, "TANPA": ps.WARNA_TANPA_DATA, "PRIMER": WARNA_PRIMER},
        "parameter": PARAMETER_PETA, "sumber": SUMBER_PETA,
        "provinsi": [{"kode": r["kode"], "nama": r["nama"], "nama_buku": r["provinsi"], "seb": r["seb"],
                      "skor": r["skor"], "kelas": r["kelas"],
                      "peringkat": r["peringkat"], "halaman": r["halaman"],
                      "pdf": f"peta/pdf/peta-irbi-2025-prov-{r['slug']}.pdf"} for r in d.provinsi],
        "kabkota": [{"kode": r["kode"], "nama": r["kabkota"], "prov": r["prov_kode"], "skor": r["skor"],
                     "kelas": r["kelas"], "peringkat": r["peringkat"]} for r in d.kabkota],
        "ancaman": {slug: {r["kode"]: [r["skor"], r["kelas"], r["peringkat"]] for r in rows}
                    for slug, rows in d.per_ancaman.items()},
        "pdf": {"provinsi": "peta/pdf/peta-irbi-2025-nasional-provinsi.pdf",
                "irbi": "peta/pdf/peta-irbi-2025-nasional-kabkota.pdf",
                **{j.slug: f"peta/pdf/peta-irbi-2025-ancaman-{j.slug}.pdf" for j in d.ancaman}},
        "halaman_ancaman": {j.slug: f"ancaman/{j.slug}.html" for j in d.ancaman},
    }
    js = "/* Dibuat otomatis oleh scripts/bangun.py dari folder data/ — jangan diedit langsung. */\n"
    js += "window.IRBI_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    tulis(ASET_DATA / "irbi-data.js", js)
    geo = {"provinsi": d.geo_prov, "kabkota": d.geo_kab}
    gjs = "/* Batas wilayah: Kepmendagri No. 300.2.2-2430/2025, sumber cahyadsn/wilayah_boundaries (MIT). */\n"
    gjs += "window.IRBI_GEO = " + json.dumps(geo, separators=(",", ":")) + ";\n"
    tulis(ASET_DATA / "irbi-geo.js", gjs)
    # geometri detail untuk peta PDF yang dibuat di peramban (dimuat hanya saat membuat PDF)
    detail = {"provinsi": json.loads((DATA / "geo" / "provinsi_detail.geojson").read_text(encoding="utf-8")),
              "kabkota": json.loads((DATA / "geo" / "kabkota_detail.geojson").read_text(encoding="utf-8"))}
    tulis(ASET_DATA / "irbi-geo-detail.js", "/* Batas wilayah detail untuk PDF. Sumber sama dengan irbi-geo.js. */\n"
          "window.IRBI_GEO_DETAIL = " + json.dumps(detail, separators=(",", ":")) + ";\n")
    # logo untuk kepala PDF (base64 agar bekerja tanpa server)
    import base64
    logo = ROOT / "assets" / "img" / "logo-bnpb.png"
    if logo.exists():
        b64 = base64.b64encode(logo.read_bytes()).decode()
        tulis(ASET_DATA / "irbi-aset.js", "/* Aset gambar untuk PDF peramban. */\nwindow.IRBI_ASET = " +
              json.dumps({"logo": "data:image/png;base64," + b64}) + ";\n")


# --------------------------------------------------------------------------- tabel
def tabel(judul_tabel: str, kepala: list[str], baris: list[list[str]], kelas_kol: int | None,
          lebar_typst: str, rata_typst: str, nama_berkas: str, atribut_html: str = "",
          kolom_angka: tuple[int, ...] = (), kolom_prov: int | None = None, label: str = "",
          ukuran_typst: str = "8.5pt", id_html: str = "", kode: list[str] | None = None,
          diadopsi: bool = False) -> str:
    """Satu tabel dalam dua versi: HTML (diadopsi komponen Jelajah bila diadopsi=True) dan Typst (PDF)."""
    h = [f'<div class="irbi-tabel-wrap"><table class="irbi-tabel" data-quarto-disable-processing="true" '
         + (f'id="{id_html}" ' if id_html else "") + ('data-diadopsi="ya" ' if diadopsi else "")
         + f'data-nama-berkas="{esc(nama_berkas)}"'
         + (f' data-kolom-provinsi="{kolom_prov}"' if kolom_prov is not None else "")
         + (f" {atribut_html}" if atribut_html else "") + ">",
         f"<caption>{esc(judul_tabel)}</caption><thead><tr>"]
    for i, k in enumerate(kepala):
        attr = ' data-tipe="angka"' if i in kolom_angka else ""
        h.append(f"<th{attr}>{esc(k)}</th>")
    h.append("</tr></thead><tbody>")
    for n, b in enumerate(baris):
        kls = b[kelas_kol] if kelas_kol is not None else ""
        attr_kode = f' data-kode="{kode[n]}"' if kode else ""
        h.append(f'<tr data-kelas="{kls}"{attr_kode}>')
        for i, v in enumerate(b):
            if i == kelas_kol:
                h.append(f'<td><span class="kelas kelas-{kls.lower()}">{esc(v)}</span></td>')
            elif i in kolom_angka:
                h.append(f'<td class="angka">{esc(v)}</td>')
            else:
                h.append(f"<td>{esc(v)}</td>")
        h.append("</tr>")
    h.append("</tbody></table></div>")
    html = "".join(h)

    t = [f"#irbi-tabel(", f"  judul: {ts(judul_tabel)},", f"  lebar: {lebar_typst},", f"  rata: {rata_typst},",
         f"  ukuran: {ukuran_typst},",
         "  kepala: (" + ", ".join(ts(k) for k in kepala) + ",),",
         f"  kelas-kolom: {kelas_kol if kelas_kol is not None else 'none'},",
         "  baris: ("]
    for b in baris:
        t.append("    (" + ", ".join(ts(v) for v in b) + ",),")
    t.append("  ),")
    t.append(")" + (f" <{label}>" if label else ""))
    typst = "\n".join(t)
    return f"```{{=html}}\n{html}\n```\n\n```{{=typst}}\n{typst}\n```\n"


def blok_peta(*, rel: str, svg: str, caption: str, label: str, atribut: dict) -> str:
    """HTML: komponen Jelajah (filter + KPI + peta, mengadopsi tabel halaman). PDF: peta SVG statis."""
    attrs = " ".join(f'data-{k}="{esc(str(v))}"' for k, v in atribut.items())
    return (f'```{{=html}}\n<div class="irbi-jelajah" data-tata="sematan" {attrs}></div>\n```\n\n'
            f'::: {{.content-visible when-format="typst"}}\n'
            f'![{caption}]({rel}{svg}){{#{label} width=100%}}\n:::\n')


def kartu(items: list[tuple[str, str, str, str]], spec: str = "") -> str:
    """items: (label, nilai, sub, kelas-css). spec: penanda agar kartu dihitung ulang di peramban (data-kartu)."""
    h = ['<div class="irbi-kartu-grid"' + (f' data-kartu="{spec}"' if spec else "") + '>']
    for lbl, nilai, sub, k in items:
        h.append(f'<div class="irbi-kartu {k}"><div class="irbi-kartu-label">{esc(lbl)}</div>'
                 f'<div class="irbi-kartu-nilai">{esc(nilai)}</div>'
                 f'<div class="irbi-kartu-sub">{esc(sub)}</div></div>')
    h.append("</div>")
    t = "#irbi-kartu((" + ", ".join(f"({ts(a)}, {ts(b)}, {ts(c)}, {ts(k.replace('kelas-', '').upper())})"
                                    for a, b, c, k in items) + ",))"
    return f"```{{=html}}\n{''.join(h)}\n```\n\n```{{=typst}}\n{t}\n```\n"


# --------------------------------------------------------------------------- peta statis
class PembuatPeta:
    def __init__(self, d: Data):
        self.d = d
        gp = json.loads((DATA / "geo" / "provinsi_detail.geojson").read_text(encoding="utf-8"))
        gk = json.loads((DATA / "geo" / "kabkota_detail.geojson").read_text(encoding="utf-8"))
        self.prov_geom = {f["properties"]["kode"]: f for f in gp["features"]}
        self.kab_geom = {f["properties"]["kode"]: f for f in gk["features"]}
        self.batas = [{"geom": f["geometry"]["coordinates"], "bbox": f["properties"]["bbox"]}
                      for f in gp["features"]]
        self.konteks = [{"geom": f["geometry"]["coordinates"], "bbox": f["properties"]["bbox"]}
                        for f in gk["features"]]
        src = (ROOT / "scripts" / "peta_svg.py").read_bytes() + VERSI_CACHE.encode()
        src += str((DATA / "geo" / "kabkota_detail.geojson").stat().st_size).encode()
        self.sidik_dasar = hashlib.sha1(src).hexdigest()
        self.cache_path = PETA / ".cache.json"
        try:
            self.cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception:
            self.cache = {}
        self.quarto = cari_quarto()
        self.dibuat = 0
        self.pdf_dibuat = 0
        self.pdf_gagal: list[str] = []

    def simpan_cache(self):
        tulis(self.cache_path, json.dumps(self.cache, indent=0, sort_keys=True))

    def _kompilasi_pdf(self, id_: str, pdf_path: Path) -> bool:
        if not self.quarto:
            self.pdf_gagal.append(f"{id_} (perintah quarto tidak ditemukan)")
            return False
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [self.quarto, "typst", "compile", str(ROOT / "scripts" / "templat_peta.typ"), str(pdf_path),
               "--root", str(ROOT), "--input", f"id={id_}"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            self.pdf_gagal.append(f"{id_}: {(r.stderr or r.stdout).strip()[:400]}")
            return False
        self.pdf_dibuat += 1
        return True

    def fokus_kab(self, rows: list[dict], label=False):
        out = []
        for r in rows:
            f = self.kab_geom.get(r["kode"])
            if not f:
                continue
            p = f["properties"]
            out.append({"geom": f["geometry"]["coordinates"], "kelas": r.get("kelas"),
                        "label": judul(r["kabkota"]) if label else None, "lonlat": (p["lng"], p["lat"])})
        return out

    @staticmethod
    def gabung_bbox(bbs):
        return [min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs)]

    def legend(self, jenis: Jenis, rows):
        c = Data.hitung_kelas(rows)
        rg = jenis.rentang()
        return [(k, rg[k], c[k]) for k in ["RENDAH", "SEDANG", "TINGGI"]]

    def peta_provinsi(self, prov: dict):
        rows = self.d.kab_provinsi(prov["kode"])
        bbs = [self.kab_geom[r["kode"]]["properties"]["bbox"] for r in rows if r["kode"] in self.kab_geom]
        bbox = self.gabung_bbox(bbs) if bbs else self.prov_geom[prov["kode"]]["properties"]["bbox"]
        spec = {"bbox": bbox, "keterangan_judul": f"Indeks Risiko Bencana {TAHUN}",
                "keterangan_kelas": self.legend(self.d.irbi, rows), "label": True}
        fokus = self.fokus_kab(rows, label=True)
        meta = {
            "judul": f"Peta Indeks Risiko Bencana di {('Provinsi ' if prov['provinsi'] not in ('ACEH', 'DAERAH ISTIMEWA YOGYAKARTA') else '') + prov['nama']}",
            "subjudul": f"Indeks Risiko Bencana Indonesia (IRBI) Tahun {TAHUN}",
            "sorotan": {"label": f"Nilai IRB provinsi tahun {TAHUN}", "nilai": angka(prov["skor"]),
                        "kelas": prov["kelas"]},
            "tabel_judul": f"Skor Risiko Bencana di {prov['nama']} Tahun {TAHUN}",
            "tabel": [[str(i), r["kabkota"], angka(r["skor"]), r["kelas"]] for i, r in enumerate(rows, 1)],
            "klasifikasi": [[k, self.d.irbi.rentang()[k]] for k in ["RENDAH", "SEDANG", "TINGGI"]],
            "parameter": PARAMETER_PETA, "sumber": SUMBER_PETA,
        }
        spec_hash = {**spec, "fokus": [(r["kode"], r["kelas"]) for r in rows]}
        self._peta_dengan_hash(f"prov-{prov['slug']}", spec, spec_hash, fokus, meta)

    def _peta_dengan_hash(self, id_, spec, spec_hash, fokus, meta):
        # spec_hash dipakai sebagai sidik; spec dipakai untuk render
        sidik = hashlib.sha1((self.sidik_dasar + json.dumps(spec_hash, sort_keys=True, ensure_ascii=False, default=str)
                              + json.dumps(meta, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()
        svg_path = PETA / "svg" / f"{id_}.svg"
        pdf_path = PETA / "pdf" / f"peta-irbi-2025-{id_}.pdf"
        tulis(PETA / "meta" / f"{id_}.json", json.dumps(meta, ensure_ascii=False, indent=1))
        if self.cache.get(id_) == sidik and svg_path.exists() and pdf_path.exists():
            return
        svg = ps.render(fitur_fokus=fokus, fitur_konteks=self.konteks, batas_provinsi=self.batas, **spec,
                        sumber=SUMBER_PETA)
        tulis(svg_path, svg)
        self.dibuat += 1
        if self._kompilasi_pdf(id_, pdf_path):
            self.cache[id_] = sidik

    def peta_nasional_kab(self, id_: str, jenis: Jenis, rows: list[dict], judul_peta: str):
        semua = {r["kode"]: r for r in rows}
        fokus = []
        for kode, f in self.kab_geom.items():
            r = semua.get(kode)
            p = f["properties"]
            fokus.append({"geom": f["geometry"]["coordinates"], "kelas": r["kelas"] if r else None,
                          "label": None, "lonlat": (p["lng"], p["lat"])})
        tanpa = sum(1 for k in self.kab_geom if k not in semua)
        spec = {"bbox": [94.9, -11.1, 141.1, 6.2], "keterangan_judul": jenis.nama if jenis.slug != "irbi"
                else f"Indeks Risiko Bencana {TAHUN}", "keterangan_kelas": self.legend(jenis, rows),
                "tampil_tanpa_data": tanpa, "label": False, "ukuran": (1800, 980), "pad": 0.0}
        top = sorted(rows, key=lambda r: -r["skor"])[:15]
        meta = {
            "judul": judul_peta,
            "subjudul": f"Indeks Risiko Bencana Indonesia (IRBI) Tahun {TAHUN} · Tingkat Kabupaten/Kota",
            "sorotan": {"label": "Jumlah kabupaten/kota dinilai", "nilai": str(len(rows)), "kelas": ""},
            "tabel_judul": "15 kabupaten/kota dengan skor tertinggi",
            "tabel": [[str(i), f"{r['kabkota']} ({judul(r['provinsi'])})", angka(r["skor"]), r["kelas"]]
                      for i, r in enumerate(top, 1)],
            "klasifikasi": [[k, jenis.rentang()[k]] for k in ["RENDAH", "SEDANG", "TINGGI"]],
            "parameter": PARAMETER_PETA, "sumber": SUMBER_PETA,
        }
        spec_hash = {**spec, "fokus": sorted((r["kode"], r["kelas"]) for r in rows)}
        self._peta_dengan_hash(id_, spec, spec_hash, fokus, meta)

    def peta_nasional_provinsi(self):
        fokus = []
        for r in self.d.provinsi:
            f = self.prov_geom.get(r["kode"])
            if not f:
                continue
            p = f["properties"]
            fokus.append({"geom": f["geometry"]["coordinates"], "kelas": r["kelas"], "label": None,
                          "lonlat": (p["lng"], p["lat"])})
        spec = {"bbox": [94.9, -11.1, 141.1, 6.2], "keterangan_judul": f"Indeks Risiko Bencana {TAHUN}",
                "keterangan_kelas": self.legend(self.d.irbi, self.d.provinsi), "label": False,
                "ukuran": (1800, 980), "pad": 0.0}
        meta = {
            "judul": f"Peta Indeks Risiko Bencana Tingkat Provinsi Tahun {TAHUN}",
            "subjudul": f"Indeks Risiko Bencana Indonesia (IRBI) Tahun {TAHUN}",
            "sorotan": {"label": "Rata-rata IRBI kab/kota (dihitung dari tabel)",
                        "nilai": angka(statistics.mean(r["skor"] for r in self.d.kabkota)), "kelas": ""},
            "tabel_judul": f"Indeks Risiko Bencana Provinsi Tahun {TAHUN}",
            "tabel": [[str(i), r["provinsi"], angka(r["skor"]), r["kelas"]]
                      for i, r in enumerate(sorted(self.d.provinsi, key=lambda r: -r["skor"]), 1)],
            "klasifikasi": [[k, self.d.irbi.rentang()[k]] for k in ["RENDAH", "SEDANG", "TINGGI"]],
            "parameter": PARAMETER_PETA, "sumber": SUMBER_PETA,
        }
        spec_hash = {**spec, "fokus": [(r["kode"], r["kelas"]) for r in self.d.provinsi]}
        self._peta_dengan_hash("nasional-provinsi", spec, spec_hash, fokus, meta)


def cari_quarto() -> str | None:
    kandidat = [os.environ.get("QUARTO_BIN"), shutil.which("quarto"),
                str(ROOT / ".tools" / "quarto" / "bin" / "quarto")]
    qp = os.environ.get("QUARTO_BIN_PATH")
    if qp:
        kandidat.insert(0, str(Path(qp) / "quarto"))
    for k in kandidat:
        if k and Path(k).exists():
            return k
    return None


# --------------------------------------------------------------------------- grafik SVG
def grafik_provinsi(d: Data) -> str:
    rows = sorted(d.provinsi, key=lambda r: -r["skor"])
    W, top, rh, left = 1400, 70, 30, 380
    H = top + rh * len(rows) + 70
    maks = max(max(r["skor"], r["seb"] or 0) for r in rows) * 1.08
    sx = (W - left - 120) / maks
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
         f'font-family="{ps.FONT}">', f'<rect width="{W}" height="{H}" fill="#fff"/>']
    for v in range(0, int(maks) + 1, 50):
        x = left + v * sx
        o.append(f'<line x1="{x:.1f}" y1="{top - 10}" x2="{x:.1f}" y2="{H - 50}" stroke="#E3E6E8"/>')
        o.append(f'<text x="{x:.1f}" y="{H - 28}" font-size="16" text-anchor="middle" fill="#55656D">{v}</text>')
    for batas, teks in [(d.irbi.batas_tinggi, f"Ambang tinggi ({angka(d.irbi.batas_tinggi)})")]:
        x = left + batas * sx
        o.append(f'<line x1="{x:.1f}" y1="{top - 30}" x2="{x:.1f}" y2="{H - 50}" stroke="#B3261E" '
                 f'stroke-dasharray="6 5" stroke-width="2"/>')
        o.append(f'<text x="{x + 6:.1f}" y="{top - 34}" font-size="16" fill="#B3261E">{teks}</text>')
    for i, r in enumerate(rows):
        y = top + i * rh
        o.append(f'<text x="{left - 12}" y="{y + 20}" font-size="16" text-anchor="end" fill="#1F2D33">'
                 f'{esc(r["nama"])}</text>')
        o.append(f'<rect x="{left}" y="{y + 5}" width="{r["skor"] * sx:.1f}" height="{rh - 10}" rx="3" '
                 f'fill="{ps.WARNA_KELAS[r["kelas"]]}" stroke="#00000033"/>')
        o.append(f'<text x="{left + r["skor"] * sx + 8:.1f}" y="{y + 20}" font-size="15" fill="#1F2D33">'
                 f'{angka(r["skor"])}</text>')
        if r["seb"]:
            cx = left + r["seb"] * sx
            o.append(f'<circle cx="{cx:.1f}" cy="{y + rh / 2:.1f}" r="5.5" fill="#0B3C49" stroke="#fff" '
                     f'stroke-width="1.5"/>')
    ly = 22
    o.append(f'<rect x="{left}" y="{ly}" width="22" height="16" fill="{ps.WARNA_KELAS["TINGGI"]}"/>'
             f'<text x="{left + 30}" y="{ly + 14}" font-size="16">Tinggi</text>'
             f'<rect x="{left + 110}" y="{ly}" width="22" height="16" fill="{ps.WARNA_KELAS["SEDANG"]}" stroke="#0002"/>'
             f'<text x="{left + 140}" y="{ly + 14}" font-size="16">Sedang</text>'
             f'<circle cx="{left + 240}" cy="{ly + 8}" r="6" fill="#0B3C49"/>'
             f'<text x="{left + 252}" y="{ly + 14}" font-size="16">Nilai kolom SEB</text>')
    o.append(f'<text x="{left}" y="{H - 6}" font-size="15" fill="#55656D">Nilai Indeks Risiko Bencana</text>')
    o.append("</svg>")
    return "\n".join(o)


def grafik_donat(bagian: list[tuple[str, float, str, str]], judul_tengah: str, sub_tengah: str) -> str:
    """bagian: (label, nilai, warna, teks-kanan)"""
    import math
    W, H, cx, cy, R, r0 = 900, 420, 210, 210, 180, 105
    total = sum(b[1] for b in bagian) or 1
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
         f'font-family="{ps.FONT}">', f'<rect width="{W}" height="{H}" fill="#fff"/>']
    a0 = -math.pi / 2
    for lbl, v, warna, _ in bagian:
        a1 = a0 + 2 * math.pi * v / total
        large = 1 if a1 - a0 > math.pi else 0
        p = (f"M{cx + R * math.cos(a0):.2f} {cy + R * math.sin(a0):.2f} "
             f"A{R} {R} 0 {large} 1 {cx + R * math.cos(a1):.2f} {cy + R * math.sin(a1):.2f} "
             f"L{cx + r0 * math.cos(a1):.2f} {cy + r0 * math.sin(a1):.2f} "
             f"A{r0} {r0} 0 {large} 0 {cx + r0 * math.cos(a0):.2f} {cy + r0 * math.sin(a0):.2f}Z")
        o.append(f'<path d="{p}" fill="{warna}" stroke="#fff" stroke-width="3"/>')
        a0 = a1
    o.append(f'<text x="{cx}" y="{cy + 4}" font-size="44" font-weight="bold" text-anchor="middle" '
             f'fill="#0B3C49">{esc(judul_tengah)}</text>')
    o.append(f'<text x="{cx}" y="{cy + 34}" font-size="18" text-anchor="middle" fill="#55656D">'
             f'{esc(sub_tengah)}</text>')
    y = 120
    for lbl, v, warna, kanan in bagian:
        o.append(f'<rect x="450" y="{y - 22}" width="30" height="30" rx="4" fill="{warna}" stroke="#0002"/>')
        o.append(f'<text x="495" y="{y}" font-size="24" fill="#1F2D33" font-weight="bold">{esc(lbl)}</text>')
        o.append(f'<text x="495" y="{y + 28}" font-size="19" fill="#55656D">{esc(kanan)}</text>')
        y += 90
    o.append("</svg>")
    return "\n".join(o)


def grafik_ancaman(d: Data) -> str:
    W, left, top, rh = 1400, 330, 60, 44
    rows = d.ancaman
    H = top + rh * len(rows) + 60
    total = max(len(v) for v in d.per_ancaman.values()) or 1
    sx = (W - left - 120) / 514
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
         f'font-family="{ps.FONT}">', f'<rect width="{W}" height="{H}" fill="#fff"/>']
    x = left
    for k, lbl in [("TINGGI", "Tinggi"), ("SEDANG", "Sedang"), ("RENDAH", "Rendah")]:
        o.append(f'<rect x="{x}" y="18" width="22" height="16" fill="{ps.WARNA_KELAS[k]}" stroke="#0002"/>'
                 f'<text x="{x + 30}" y="32" font-size="17">{lbl}</text>')
        x += 120
    o.append(f'<rect x="{x}" y="18" width="22" height="16" fill="{ps.WARNA_TANPA_DATA}"/>'
             f'<text x="{x + 30}" y="32" font-size="17">Tidak dinilai/tidak terpapar</text>')
    for i, j in enumerate(rows):
        y = top + i * rh
        c = Data.hitung_kelas(d.per_ancaman[j.slug])
        o.append(f'<text x="{left - 12}" y="{y + 27}" font-size="17" text-anchor="end" fill="#1F2D33">'
                 f'{esc(j.nama)}</text>')
        x = left
        for k in ["TINGGI", "SEDANG", "RENDAH"]:
            w = c[k] * sx
            if w > 0:
                o.append(f'<rect x="{x:.1f}" y="{y + 6}" width="{w:.1f}" height="{rh - 12}" '
                         f'fill="{ps.WARNA_KELAS[k]}" stroke="#fff"/>')
                if w > 34:
                    o.append(f'<text x="{x + w / 2:.1f}" y="{y + 28}" font-size="15" text-anchor="middle" '
                             f'fill="{"#fff" if k != "SEDANG" else "#1F2D33"}">{c[k]}</text>')
            x += w
        sisa = 514 - sum(c.values())
        if sisa > 0:
            o.append(f'<rect x="{x:.1f}" y="{y + 6}" width="{sisa * sx:.1f}" height="{rh - 12}" '
                     f'fill="{ps.WARNA_TANPA_DATA}" stroke="#fff"/>')
    o.append(f'<text x="{left}" y="{H - 16}" font-size="15" fill="#55656D">Jumlah kabupaten/kota per kelas '
             f'risiko (total 514)</text>')
    o.append("</svg>")
    return "\n".join(o)


# --------------------------------------------------------------------------- halaman turunan
def ringkasan_nasional(d: Data) -> str:
    c = Data.hitung_kelas(d.kabkota)
    cp = Data.hitung_kelas(d.provinsi)
    rata = statistics.mean(r["skor"] for r in d.kabkota)
    top = d.kabkota[0]
    topp = max(d.provinsi, key=lambda r: r["skor"])
    return kartu([
        ("Rata-rata IRBI kab/kota", angka(rata), "dihitung dari tabel 514 kab/kota", ""),
        ("Kab/kota kelas tinggi", str(c["TINGGI"]), f"{c['SEDANG']} sedang · {c['RENDAH']} rendah", "kelas-tinggi"),
        ("Provinsi kelas tinggi", str(cp["TINGGI"]), f"{cp['SEDANG']} sedang · {cp['RENDAH']} rendah", "kelas-tinggi"),
        ("Skor kab/kota tertinggi", angka(top["skor"]), f"{judul(top['kabkota'])}, {judul(top['provinsi'])}", ""),
        ("Skor provinsi tertinggi", angka(topp["skor"]), topp["nama"], ""),
    ], spec="nasional")


def tulis_gen(d: Data):
    irbi = d.irbi
    # --- nasional: provinsi
    baris = [[str(i), r["provinsi"], angka(r["seb"]) if r["seb"] is not None else "–", angka(r["skor"]), r["kelas"]]
             for i, r in enumerate(d.provinsi, 1)]
    tulis(GEN / "tabel-provinsi.md", tabel(
        f"Tabel Indeks Risiko Bencana Tahun {TAHUN} Tingkat Provinsi", ["No", "Provinsi", "SEB", str(TAHUN), "Kelas"],
        baris, 4, "(auto, 1fr, auto, auto, auto)", "(center, left, right, right, center)",
        f"irbi-{TAHUN}-provinsi.csv", kolom_angka=(0, 2, 3), label="tbl-irbi-provinsi",
        id_html="irbi-tabel-provinsi", kode=[r["kode"] for r in d.provinsi], diadopsi=True))
    tulis(GEN / "peta-provinsi.md", blok_peta(
        rel="", svg="peta/svg/nasional-provinsi.svg",
        caption=f"Peta Indeks Risiko Bencana Tingkat Provinsi Tahun {TAHUN}", label="fig-peta-provinsi",
        atribut={"tingkat": "provinsi", "tabel": "irbi-tabel-provinsi",
                 "judul": f"Indeks Risiko Bencana Tingkat Provinsi {TAHUN}"}))
    tulis(GEN / "ringkasan-nasional.md", ringkasan_nasional(d))

    # --- nasional: kab/kota
    baris = [[str(r["peringkat"]), r["kabkota"], r["provinsi"], angka(r["skor"]), r["kelas"]] for r in d.kabkota]
    tulis(GEN / "tabel-kabkota.md", tabel(
        f"Tabel Indeks Risiko Bencana Kabupaten/Kota Tahun {TAHUN}",
        ["No", "Kabupaten/Kota", "Provinsi", "Skor", "Kelas Risiko"], baris, 4,
        "(auto, 1fr, 1fr, auto, auto)", "(center, left, left, right, center)",
        f"irbi-{TAHUN}-kabkota.csv", kolom_angka=(0, 3), kolom_prov=2, label="tbl-irbi-kabkota",
        ukuran_typst="7.5pt", id_html="irbi-tabel-kabkota", kode=[r["kode"] for r in d.kabkota], diadopsi=True))
    tulis(GEN / "peta-kabkota.md", blok_peta(
        rel="", svg="peta/svg/nasional-kabkota.svg",
        caption=f"Peta Indeks Risiko Bencana Kabupaten/Kota Tahun {TAHUN}", label="fig-peta-kabkota",
        atribut={"tingkat": "kabkota", "indeks": "irbi", "tabel": "irbi-tabel-kabkota",
                 "judul": f"Indeks Risiko Bencana Kabupaten/Kota {TAHUN}"}))

    # --- provinsi
    for r in d.provinsi:
        rows = d.kab_provinsi(r["kode"])
        c = Data.hitung_kelas(rows)
        nama_tabel = r["nama"] if r["provinsi"] in ("ACEH", "DAERAH ISTIMEWA YOGYAKARTA") else f"Provinsi {r['nama']}"
        base = GEN / "provinsi" / r["kode"]
        top = rows[0] if rows else None
        tulis(base.with_name(f"{r['kode']}-ringkasan.md"), kartu([
            (f"Nilai IRB {TAHUN}", angka(r["skor"]), f"Kelas {r['kelas'].capitalize()}",
             f"kelas-{r['kelas'].lower()}"),
            ("Peringkat provinsi", f"{r['peringkat']} / {len(d.provinsi)}", "urut dari skor tertinggi", ""),
            ("Jumlah kabupaten/kota", str(len(rows)),
             " · ".join(f"{c[k]} {k.lower()}" for k in KELAS if c[k]), ""),
            ("Skor kab/kota tertinggi", angka(top["skor"]) if top else "–", judul(top["kabkota"]) if top else "", ""),
        ], spec=f"prov:{r['kode']}"))
        baris = [[str(i), k["kabkota"], angka(k["skor"]), k["kelas"]] for i, k in enumerate(rows, 1)]
        tulis(base.with_name(f"{r['kode']}-tabel.md"), tabel(
            f"Tabel nilai indeks risiko {nama_tabel} Tahun {TAHUN}", ["No", "Kabupaten/Kota", "IRB", "Kelas Risiko"],
            baris, 3, "(auto, 1fr, auto, auto)", "(center, left, right, center)",
            f"irbi-{TAHUN}-{r['slug']}.csv", kolom_angka=(0, 2), label=f"tbl-irbi-{r['kode']}",
            id_html=f"irbi-tabel-{r['kode']}", kode=[k["kode"] for k in rows], diadopsi=True))
        tulis(base.with_name(f"{r['kode']}-peta.md"), blok_peta(
            rel="../", svg=f"peta/svg/prov-{r['slug']}.svg",
            caption=f"Peta Indeks Risiko Bencana di {nama_tabel} Tahun {TAHUN}", label=f"fig-peta-{r['kode']}",
            atribut={"tingkat": "kabkota", "prov": r["kode"], "kunci-prov": "ya", "indeks": "irbi",
                     "tabel": f"irbi-tabel-{r['kode']}", "judul": f"Indeks Risiko Bencana di {nama_tabel} {TAHUN}"}))

    # --- per ancaman
    for j in d.ancaman:
        rows = d.per_ancaman[j.slug]
        c = Data.hitung_kelas(rows)
        base = GEN / "ancaman"
        top = rows[0] if rows else None
        tulis(base / f"{j.slug}-ringkasan.md", kartu([
            ("Kab/kota dinilai", str(len(rows)), f"dari {len(d.kabkota)} kab/kota", ""),
            ("Kelas tinggi", str(c["TINGGI"]), f"{c['TINGGI'] / max(len(rows), 1) * 100:.1f}% dari yang dinilai".replace(".", ","),
             "kelas-tinggi"),
            ("Kelas sedang", str(c["SEDANG"]), f"{c['SEDANG'] / max(len(rows), 1) * 100:.1f}%".replace(".", ","),
             "kelas-sedang"),
            ("Kelas rendah", str(c["RENDAH"]), f"{c['RENDAH'] / max(len(rows), 1) * 100:.1f}%".replace(".", ","),
             "kelas-rendah"),
            ("Skor tertinggi", angka(top["skor"]) if top else "–",
             f"{judul(top['kabkota'])}, {judul(top['provinsi'])}" if top else "", ""),
        ], spec=f"ancaman:{j.slug}"))
        baris = [[str(r["peringkat"]), r["kabkota"], r["provinsi"], angka(r["skor"]), r["kelas"]] for r in rows]
        tulis(base / f"{j.slug}-tabel.md", tabel(
            f"Indeks Risiko Bencana {j.nama} Tahun {TAHUN}", ["No", "Kabupaten/Kota", "Provinsi", "Skor", "Kelas Risiko"],
            baris, 4, "(auto, 1fr, 1fr, auto, auto)", "(center, left, left, right, center)",
            f"irbi-{TAHUN}-{j.slug}.csv", kolom_angka=(0, 3), kolom_prov=2, label=f"tbl-irbi-{j.slug}",
            ukuran_typst="7.5pt", id_html=f"irbi-tabel-{j.slug}", kode=[r["kode"] for r in rows], diadopsi=True))
        tulis(base / f"{j.slug}-peta.md", blok_peta(
            rel="../", svg=f"peta/svg/ancaman-{j.slug}.svg",
            caption=f"Peta Indeks Risiko Bencana {j.nama} Tahun {TAHUN}", label=f"fig-peta-{j.slug}",
            atribut={"tingkat": "kabkota", "indeks": j.slug, "tabel": f"irbi-tabel-{j.slug}",
                     "judul": f"Indeks Risiko Bencana {j.nama} {TAHUN}"}))

    tulis_navigasi(d)

    # --- daftar unduhan
    u = ["| Peta | PDF |", "|---|---|",
         f"| Indeks Risiko Bencana Tingkat Provinsi | [Unduh](peta/pdf/peta-irbi-2025-nasional-provinsi.pdf) |",
         f"| Indeks Risiko Bencana Kabupaten/Kota | [Unduh](peta/pdf/peta-irbi-2025-nasional-kabkota.pdf) |"]
    for j in d.ancaman:
        u.append(f"| Risiko Bencana {j.nama} | [Unduh](peta/pdf/peta-irbi-2025-ancaman-{j.slug}.pdf) |")
    for r in d.provinsi:
        u.append(f"| {r['nama']} | [Unduh](peta/pdf/peta-irbi-2025-prov-{r['slug']}.pdf) |")
    tulis(GEN / "daftar-unduhan-peta.md", "\n".join(u) + "\n\n: Daftar peta PDF siap unduh {#tbl-unduhan-peta}\n")


def tulis_navigasi(d: Data):
    # --- kartu provinsi (halaman provinsi/index.qmd)
    h = ['<div class="irbi-prov-grid">']
    for r in d.provinsi:
        k = r["kelas"].lower()
        h.append(f'<a class="irbi-prov-kartu" data-kode="{r["kode"]}" href="{r["kode"]}-{r["slug"]}.html">'
                 f'<img src="../assets/img/lambang/{r["kode"]}.png" alt="" loading="lazy">'
                 f'<span class="irbi-prov-nama">{esc(r["nama"])}</span>'
                 f'<span class="irbi-prov-nilai">{angka(r["skor"])}</span>'
                 f'<span class="kelas kelas-{k}">{r["kelas"].capitalize()}</span></a>')
    h.append("</div>")
    tulis(GEN / "kartu-provinsi.md", "```{=html}\n" + "".join(h) + "\n```\n")

    # --- ringkasan ancaman (halaman ancaman/index.qmd)
    h = ['<div class="irbi-ancaman-grid">']
    baris = []
    for j in d.ancaman:
        rows = d.per_ancaman[j.slug]
        c = Data.hitung_kelas(rows)
        n = max(len(rows), 1)
        bar = "".join(f'<span class="seg kelas-{k.lower()}" style="width:{c[k] / n * 100:.2f}%" '
                      f'title="{k.capitalize()}: {c[k]}"></span>' for k in KELAS if c[k])
        h.append(f'<a class="irbi-ancaman-kartu" data-slug="{j.slug}" href="{j.slug}.html"><span class="judul">{esc(j.nama)}</span>'
                 f'<span class="sub">{len(rows)} kab/kota dinilai · {c["TINGGI"]} tinggi</span>'
                 f'<span class="irbi-bar">{bar}</span></a>')
        baris.append([j.nama, str(len(rows)), str(c["TINGGI"]), str(c["SEDANG"]), str(c["RENDAH"])])
    h.append("</div>")
    typ = ["#irbi-tabel(", f"  judul: {ts('Jumlah kabupaten/kota per kelas risiko untuk setiap jenis ancaman')},",
           "  lebar: (1fr, auto, auto, auto, auto),", "  rata: (left, right, right, right, right),",
           "  ukuran: 9pt,", "  kepala: (\"Jenis ancaman\", \"Dinilai\", \"Tinggi\", \"Sedang\", \"Rendah\",),",
           "  kelas-kolom: none,", "  baris: ("]
    typ += ["    (" + ", ".join(ts(v) for v in b) + ",)," for b in baris]
    typ += ["  ),", ") <tbl-ringkasan-ancaman>"]
    tulis(GEN / "ringkasan-ancaman.md",
          "```{=html}\n" + "".join(h) + "\n```\n\n```{=typst}\n" + "\n".join(typ) + "\n```\n")

    # --- catatan bila angka di narasi provinsi tidak sama dengan tabel
    for r in d.provinsi:
        qmd = ROOT / "provinsi" / f"{r['kode']}-{r['slug']}.qmd"
        catatan = ""
        if qmd.exists():
            teks = qmd.read_text(encoding="utf-8")
            m = re.search(r"kelas risiko\s+(\w+)\s+dengan nilai\s+(\d+(?:\.\d{3})*,\d+)", teks, re.I)
            if m:
                nilai_narasi = float(m.group(2).replace(".", "").replace(",", "."))
                kelas_narasi = m.group(1).upper()
                if abs(nilai_narasi - r["skor"]) > 0.011 or kelas_narasi != r["kelas"]:
                    rows = d.kab_provinsi(r["kode"])
                    rata = statistics.mean(k["skor"] for k in rows) if rows else None
                    alasan = (" Nilai tabel sama dengan rata-rata skor kabupaten/kota di provinsi ini"
                              f" ({angka(rata)})." if rata is not None and abs(rata - r["skor"]) < 0.05 else "")
                    catatan = (
                        '::: {.callout-warning appearance="simple"}\n## Catatan edisi digital\n\n'
                        f"Narasi di atas (dari buku asli) menyebut nilai **{m.group(2)}** (kelas "
                        f"{m.group(1).lower()}), sedangkan tabel IRBI provinsi mencatat **{angka(r['skor'])}** "
                        f"(kelas {r['kelas'].lower()}).{alasan} Ringkasan, peta, dan tabel di halaman ini memakai "
                        f"nilai tabel. Narasi dapat diperbaiki pada berkas `provinsi/{qmd.name}`.\n:::\n")
        tulis(GEN / "provinsi" / f"{r['kode']}-catatan.md", catatan or "<!-- tidak ada catatan -->\n")


def bangun_peta(d: Data):
    pp = PembuatPeta(d)
    pp.peta_nasional_provinsi()
    pp.peta_nasional_kab("nasional-kabkota", d.irbi, d.kabkota,
                         f"Peta Indeks Risiko Bencana Kabupaten/Kota Tahun {TAHUN}")
    for j in d.ancaman:
        pp.peta_nasional_kab(f"ancaman-{j.slug}", j, d.per_ancaman[j.slug],
                             f"Peta Indeks Risiko Bencana {j.nama} Tahun {TAHUN}")
    for r in d.provinsi:
        pp.peta_provinsi(r)
    pp.simpan_cache()
    # grafik
    tulis(PETA / "svg" / "grafik-provinsi.svg", grafik_provinsi(d))
    tulis(PETA / "svg" / "grafik-ancaman.svg", grafik_ancaman(d))
    ikd = baca_csv(DATA / "ikd_2025.csv")
    # kapasitas tinggi = baik (hijau), rendah = perlu perhatian (merah)
    warna = {"TINGGI": ps.WARNA_KELAS["RENDAH"], "SEDANG": ps.WARNA_KELAS["SEDANG"], "RENDAH": ps.WARNA_KELAS["TINGGI"]}
    tulis(PETA / "svg" / "grafik-ikd.svg", grafik_donat(
        [(f"Kelas {r['kelas'].capitalize()}", int(r["jumlah"]), warna[r["kelas"].upper()],
          f"{r['jumlah']} kab/kota · {r['persen']}%") for r in ikd], "IKD", "kelas kapasitas 2025"))
    return pp


def sinkron_warna_typst():
    """Samakan warna kelas & warna utama di templat Typst dengan _brand.yml."""
    peta = {"TINGGI": ps.WARNA_KELAS["TINGGI"], "SEDANG": ps.WARNA_KELAS["SEDANG"], "RENDAH": ps.WARNA_KELAS["RENDAH"]}
    for berkas in (ROOT / "assets" / "typst" / "irbi.typ", ROOT / "scripts" / "templat_peta.typ"):
        if not berkas.exists():
            continue
        teks = berkas.read_text(encoding="utf-8")
        baru = teks
        for k, v in peta.items():
            baru = re.sub(rf'({k}:\s*rgb\(")#[0-9A-Fa-f]{{6}}("\))', rf"\g<1>{v}\g<2>", baru)
        baru = re.sub(r'(#let (?:irbi-)?teal = rgb\(")#[0-9A-Fa-f]{6}("\))', rf"\g<1>{WARNA_PRIMER}\g<2>", baru)
        if baru != teks:
            berkas.write_text(baru, encoding="utf-8")


def versi_aset():
    """Sidik isi JS & data → dipasang di assets/html/kepala.html agar peramban tidak memakai berkas lama (cache)."""
    h = hashlib.sha1()
    for pola in ("assets/js/*.js", "assets/data/*.js", "assets/vendor/jspdf/*.js"):
        for f in sorted(ROOT.glob(pola)):
            h.update(f.name.encode()); h.update(f.read_bytes())
    versi = h.hexdigest()[:10]
    kepala = ROOT / "assets" / "html" / "kepala.html"
    teks = kepala.read_text(encoding="utf-8")
    baru = re.sub(r"window\.IRBI_VERSI = '[^']*';", f"window.IRBI_VERSI = '{versi}';", teks)
    if baru != teks:
        kepala.write_text(baru, encoding="utf-8")
    return versi


def main():
    sinkron_warna_typst()
    d = Data()
    bangun_data_js(d)
    tulis_gen(d)
    pp = bangun_peta(d)
    versi_aset()
    print(f"[bangun] {len(d.provinsi)} provinsi, {len(d.kabkota)} kab/kota, "
          f"{sum(len(v) for v in d.per_ancaman.values())} baris ancaman · peta baru: {pp.dibuat}, "
          f"PDF baru: {pp.pdf_dibuat}")
    for p in pp.pdf_gagal:
        print("[bangun] PDF gagal:", p)
    for w in PERINGATAN:
        print("[bangun] PERINGATAN:", w)


if __name__ == "__main__":
    main()
