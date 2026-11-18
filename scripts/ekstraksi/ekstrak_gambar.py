"""Ekstraksi gambar dari BUKU IRBI 2025.pdf (sekali pakai).

Memakai `pdfimages` (poppler) untuk mengambil gambar asli, lalu Pillow untuk
menggabungkan soft-mask (transparansi) dan memperkecil ukuran agar ringan di web.

Pemakaian:
  .venv/bin/python scripts/ekstraksi/ekstrak_gambar.py "../BUKU IRBI 2025.pdf" assets/img
"""
import csv
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

# (halaman, indeks gambar di halaman, nama berkas, ukuran maks px, punya soft-mask?)
GAMBAR = [
    (1, 0, "sampul.jpg", 1800, False),
    (1, 1, "logo-bnpb.png", 300, True),
    (8, 0, "foto-ringkasan.jpg", 1600, False),
    (11, 0, "foto-kutipan.jpg", 1600, False),
    (12, 4, "kepala-bnpb.png", 1200, True),
    (14, 0, "foto-pendahuluan.jpg", 1600, False),
    (19, 0, "foto-metodologi.jpg", 1600, False),
    (22, 0, "peta-ikd-2025.jpg", 2400, False),
    (32, 0, "dokumentasi.jpg", 1800, False),
    (35, 0, "foto-hasil.jpg", 1600, False),
    (210, 0, "foto-ancaman.jpg", 1600, False),
]


def ambil(pdf, page, tmp):
    out = Path(tmp) / f"p{page}"
    subprocess.run(["pdfimages", "-f", str(page), "-l", str(page), "-png", pdf, str(out)], check=True)
    return sorted(Path(tmp).glob(f"p{page}-*.png"))


def simpan(files, idx, mask, dst, maxpx):
    im = Image.open(files[idx]).convert("RGB")
    nxt = Image.open(files[idx + 1]) if mask and idx + 1 < len(files) else None
    if nxt is not None and nxt.mode in ("L", "1") and nxt.size == im.size:
        im.putalpha(nxt.convert("L"))  # soft-mask (transparansi)
    im.thumbnail((maxpx, maxpx), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.suffix == ".jpg":
        im.convert("RGB").save(dst, quality=80, optimize=True, progressive=True)
    else:
        im.save(dst, optimize=True)
    print(f"{dst} {im.size}")


def main(pdf, outdir, provinsi_csv="data/irbi_provinsi.csv"):
    out = Path(outdir)
    with tempfile.TemporaryDirectory() as tmp:
        for page, idx, name, maxpx, mask in GAMBAR:
            if (out / name).exists():
                continue
            simpan(ambil(pdf, page, tmp), idx, mask, out / name, maxpx)
        # Lambang provinsi: gambar pertama di halaman pembuka tiap bab provinsi (58, 62, ..., 206)
        prov = list(csv.DictReader(open(provinsi_csv, encoding="utf-8")))
        for i, r in enumerate(prov):
            page = 58 + 4 * i
            if (out / "lambang" / f"{r['kode']}.png").exists():
                continue
            files = ambil(pdf, page, tmp)
            simpan(files, 0, True, out / "lambang" / f"{r['kode']}.png", 220)


if __name__ == "__main__":
    main(*sys.argv[1:])
