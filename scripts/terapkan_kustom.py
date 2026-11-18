#!/usr/bin/env python3
"""Terapkan paket kustomisasi Studio ke berkas sumber, agar PDF buku & peta baku ikut berubah.

Pemakaian:
  python3 scripts/terapkan_kustom.py irbi-kustom-YYYYMMDD.json      (dari Studio › Simpan › Ekspor paket)
  python3 scripts/terapkan_kustom.py assets/kustom/irbi-kustom.js     (paket terbit)
  python3 scripts/terapkan_kustom.py paket.json --coba                (pratinjau tanpa menulis berkas)

Yang diterapkan:
  data.kabkota / data.provinsi / data.ancaman  -> data/irbi_*.csv (skor & kelas dihitung ulang dari ambang)
  data.ambang                                   -> data/jenis_indeks.csv (kelas indeks terkait dihitung ulang)
  tampilan.primer / aksen / kelas               -> palet _brand.yml (teal, emas, tinggi, sedang, rendah)
  teks                                          -> paragraf/judul yang cocok di berkas .qmd
Pengaturan tampilan lain (huruf, ukuran, peta, animasi) hanya berlaku di HTML; terbitkan lewat
assets/kustom/irbi-kustom.js bila ingin berlaku untuk semua pembaca.
Hanya pustaka standar Python 3.9+.
"""
from __future__ import annotations

import csv
import html
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def baca_paket(path: Path) -> dict:
    teks = path.read_text(encoding="utf-8").lstrip("﻿")
    if path.suffix == ".js":
        m = re.search(r"=\s*(\{.*\})\s*;?\s*$", teks, re.S)
        if not m:
            raise SystemExit(f"Tidak menemukan objek paket di {path}")
        teks = m.group(1)
    p = json.loads(teks)
    if p.get("format") not in (None, "irbi-kustom"):
        raise SystemExit("Berkas bukan paket kustomisasi IRBI.")
    return p


def baca_csv(path: Path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        return list(r), r.fieldnames


def tulis_csv(path: Path, rows, fields, coba: bool):
    if coba:
        return
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def angka(s) -> float:
    s = str(s).strip()
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    return float(s)


def kelas_dari(skor: float, sedang: float, tinggi: float) -> str:
    return "TINGGI" if skor > tinggi else ("SEDANG" if skor >= sedang else "RENDAH")


def fmt(x: float) -> str:
    return f"{x:.4f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------------------------------------- data
def terapkan_data(p: dict, coba: bool, laporan: list[str]):
    d = p.get("data") or {}
    ubah_kab = {k: v for k, v in (d.get("kabkota") or {}).items() if v is not None}
    ubah_prov = {k: v for k, v in (d.get("provinsi") or {}).items() if v is not None}
    ubah_anc = {s: {k: v for k, v in (m or {}).items() if v is not None} for s, m in (d.get("ancaman") or {}).items()}
    ambang = d.get("ambang") or {}

    jenis_rows, jenis_f = baca_csv(DATA / "jenis_indeks.csv")
    jenis = {}
    for r in jenis_rows:
        if r["slug"] in ambang:
            a = ambang[r["slug"]]
            r["batas_sedang"], r["batas_tinggi"] = fmt(float(a["batas_sedang"])), fmt(float(a["batas_tinggi"]))
            r["keterangan"] = (r.get("keterangan") or "") + " (ambang diubah melalui Studio)"
            laporan.append(f"ambang {r['slug']}: sedang ≥ {r['batas_sedang']}, tinggi > {r['batas_tinggi']}")
        jenis[r["slug"]] = (angka(r["batas_sedang"]), angka(r["batas_tinggi"]))
    if ambang:
        tulis_csv(DATA / "jenis_indeks.csv", jenis_rows, jenis_f, coba)

    # kab/kota multi-bahaya
    kab_rows, kab_f = baca_csv(DATA / "irbi_kabkota.csv")
    s, t = jenis["irbi"]
    n = 0
    for r in kab_rows:
        if r["kode"] in ubah_kab:
            r["skor"] = fmt(float(ubah_kab[r["kode"]]))
            n += 1
        if r["kode"] in ubah_kab or "irbi" in ambang:
            r["kelas"] = kelas_dari(angka(r["skor"]), s, t)
    if n or "irbi" in ambang:
        kab_rows.sort(key=lambda r: -angka(r["skor"]))
        for i, r in enumerate(kab_rows, 1):
            r["peringkat"] = str(i)
        tulis_csv(DATA / "irbi_kabkota.csv", kab_rows, kab_f, coba)
        laporan.append(f"irbi_kabkota.csv: {n} skor diperbarui")

    # provinsi: nilai eksplisit, atau rata-rata kab/kota bila ada kab/kota yang diubah (sama seperti di aplikasi)
    prov_rows, prov_f = baca_csv(DATA / "irbi_provinsi.csv")
    np_ = 0
    for r in prov_rows:
        kode = r["kode"]
        anak = [k for k in kab_rows if k["kode"].split(".")[0] == kode]
        if kode in ubah_prov:
            r["irbi_2025"] = fmt(float(ubah_prov[kode]))
            np_ += 1
        elif any(k["kode"] in ubah_kab for k in anak):
            r["irbi_2025"] = f"{statistics.mean(angka(k['skor']) for k in anak):.2f}"
            np_ += 1
            laporan.append(f"provinsi {r['provinsi']}: nilai dihitung ulang dari rata-rata kab/kota = {r['irbi_2025']}")
        else:
            continue
        r["kelas"] = kelas_dari(angka(r["irbi_2025"]), s, t)
    if "irbi" in ambang:
        for r in prov_rows:
            r["kelas"] = kelas_dari(angka(r["irbi_2025"]), s, t)
    if np_ or "irbi" in ambang:
        tulis_csv(DATA / "irbi_provinsi.csv", prov_rows, prov_f, coba)
        laporan.append(f"irbi_provinsi.csv: {np_} nilai diperbarui")

    # per ancaman
    anc_rows, anc_f = baca_csv(DATA / "irbi_ancaman.csv")
    na = 0
    for r in anc_rows:
        slug = r["ancaman"]
        m = ubah_anc.get(slug, {})
        if r["kode"] in m:
            r["skor"] = fmt(float(m[r["kode"]]))
            na += 1
        if r["kode"] in m or slug in ambang:
            s2, t2 = jenis.get(slug, (5.33, 12.0))
            r["kelas"] = kelas_dari(angka(r["skor"]), s2, t2)
    if na or any(sl != "irbi" for sl in ambang):
        urut = {}
        for r in anc_rows:
            urut.setdefault(r["ancaman"], []).append(r)
        anc_rows = []
        for slug, rows in urut.items():
            rows.sort(key=lambda r: -angka(r["skor"]))
            for i, r in enumerate(rows, 1):
                r["peringkat"] = str(i)
            anc_rows.extend(rows)
        tulis_csv(DATA / "irbi_ancaman.csv", anc_rows, anc_f, coba)
        laporan.append(f"irbi_ancaman.csv: {na} skor diperbarui")


# ---------------------------------------------------------------------------------------------- tampilan
def terapkan_tampilan(p: dict, coba: bool, laporan: list[str]):
    t = p.get("tampilan") or {}
    peta = {"teal": t.get("primer"), "emas": t.get("aksen")}
    for k, nama in (("TINGGI", "tinggi"), ("SEDANG", "sedang"), ("RENDAH", "rendah")):
        peta[nama] = (t.get("kelas") or {}).get(k)
    peta = {k: v for k, v in peta.items() if v and re.fullmatch(r"#[0-9A-Fa-f]{6}", v)}
    if peta:
        path = ROOT / "_brand.yml"
        teks = path.read_text(encoding="utf-8")
        for nama, warna in peta.items():
            teks, n = re.subn(rf'^(\s{{4}}{re.escape(nama)}:\s*)"#[0-9A-Fa-f]{{6}}"', rf'\g<1>"{warna.upper()}"', teks, flags=re.M)
            if n:
                laporan.append(f"_brand.yml: {nama} = {warna.upper()}")
        if not coba:
            path.write_text(teks, encoding="utf-8")
    lain = sorted(k for k in t if k not in ("primer", "aksen", "kelas"))
    if lain:
        laporan.append("tampilan khusus HTML (tidak diubah di sumber): " + ", ".join(lain))


# ---------------------------------------------------------------------------------------------- teks
def html_ke_md(h: str) -> str:
    h = re.sub(r"<br\s*/?>", " ", h, flags=re.I)
    h = re.sub(r"<(b|strong)>(.*?)</\1>", r"**\2**", h, flags=re.I | re.S)
    h = re.sub(r"<(i|em)>(.*?)</\1>", r"*\2*", h, flags=re.I | re.S)
    h = re.sub(r"<code>(.*?)</code>", r"`\1`", h, flags=re.I | re.S)
    h = re.sub(r'<a [^>]*href="([^"]*)"[^>]*>(.*?)</a>', r"[\2](\1)", h, flags=re.I | re.S)
    h = re.sub(r"<[^>]+>", "", h)
    return re.sub(r"\s+", " ", html.unescape(h)).strip()


def polos(md: str) -> str:
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", md)
    t = re.sub(r"[*_`]", "", t)
    t = re.sub(r"\{[^}]*\}", "", t)
    return re.sub(r"\s+", " ", t).strip()


PENANDA = re.compile(r"^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|:\s+))")


def terapkan_teks(p: dict, coba: bool, laporan: list[str]):
    teks = {k: v for k, v in (p.get("teks") or {}).items() if v}
    ok, gagal = 0, []
    for kunci, e in teks.items():
        halaman = e.get("halaman") or kunci.split("::")[0]
        qmd = ROOT / re.sub(r"\.html$", ".qmd", halaman)
        asli = polos(e.get("asli") or "")
        baru = html_ke_md(e.get("html") or "")
        if not qmd.exists() or not asli:
            gagal.append(f"{halaman}: berkas sumber tidak ditemukan")
            continue
        isi = qmd.read_text(encoding="utf-8")
        blok = re.split(r"(\n\s*\n)", isi)
        cocok = []
        for i, b in enumerate(blok):
            if i % 2:
                continue
            baris = [ln for ln in b.split("\n")]
            # paragraf utuh, atau satu baris (judul/butir daftar)
            kandidat = [(None, b)] + [(j, ln) for j, ln in enumerate(baris)]
            for j, c in kandidat:
                m = PENANDA.match(c)
                tanpa = c[m.end():] if m else c
                if polos(tanpa.replace("\n", " ")) == asli:
                    cocok.append((i, j, m.group(1) if m else ""))
                    break
        if len(cocok) != 1:
            gagal.append(f"{halaman}: {'tidak ditemukan' if not cocok else 'lebih dari satu kecocokan'} — \"{asli[:70]}…\"")
            continue
        i, j, penanda = cocok[0]
        if j is None:
            blok[i] = penanda + baru
        else:
            baris = blok[i].split("\n")
            baris[j] = penanda + baru
            blok[i] = "\n".join(baris)
        if not coba:
            qmd.write_text("".join(blok), encoding="utf-8")
        ok += 1
    if teks:
        laporan.append(f"teks: {ok} diterapkan ke .qmd, {len(gagal)} perlu dicek manual")
        for g in gagal:
            laporan.append("  - " + g)


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    coba = "--coba" in argv
    paket = baca_paket(Path(argv[1]))
    laporan: list[str] = []
    terapkan_data(paket, coba, laporan)
    terapkan_tampilan(paket, coba, laporan)
    terapkan_teks(paket, coba, laporan)
    print(("[pratinjau] " if coba else "") + "Paket diterapkan ke sumber:" if laporan else "Paket tidak berisi perubahan.")
    for l in laporan:
        print(" •", l)
    if laporan and not coba:
        print("\nLangkah berikut: ./jalankan.sh render  (lalu hapus/arsipkan assets/kustom/irbi-kustom.js bila sudah tidak perlu)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
