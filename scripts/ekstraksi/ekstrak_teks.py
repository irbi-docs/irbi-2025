"""Ekstraksi teks naratif per halaman dengan urutan baca dua kolom (sekali pakai).

Masukan : hasil `pdftotext -bbox-layout` (HTML berisi blok/baris/kata + koordinat)
Keluaran: satu berkas teks per halaman di folder tujuan, paragraf dipisah baris kosong.

Pemakaian:
  pdftotext -bbox-layout "BUKU IRBI 2025.pdf" _work/buku_bbox.html
  python3 -I scripts/ekstraksi/ekstrak_teks.py _work/buku_bbox.html _work/teks
"""
import html
import re
import sys
from pathlib import Path

BLOCK = re.compile(r'<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</block>', re.S)
LINE = re.compile(r"<line[^>]*>(.*?)</line>", re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")


def gabung_baris(lines):
    out = ""
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if not out:
            out = ln
        elif out.endswith(("-", "–")) and ln[:1].islower():
            out += ln  # kata majemuk terpotong: utara- / timur -> utara-timur
        elif out.endswith("–"):
            out += ln
        else:
            out += " " + ln
    return re.sub(r"\s+", " ", out)


def blok_halaman(pg, width):
    blocks = []
    for b in BLOCK.finditer(pg):
        x0, y0, x1, y1 = map(float, b.groups()[:4])
        lines = [" ".join(html.unescape(w) for w in WORD.findall(l)) for l in LINE.findall(b.group(5))]
        txt = gabung_baris(lines)
        if not txt or re.fullmatch(r"\d{1,3}", txt):  # nomor halaman
            continue
        col = 0 if x0 < width / 2 - 10 else 1
        if x1 - x0 > width * 0.6:  # blok selebar halaman (judul)
            col = -1
        blocks.append((col, y0, x0, txt))
    # judul (col -1) mengikuti posisi y; sisanya kolom kiri lalu kanan
    blocks.sort(key=lambda b: (0 if b[0] == -1 else 1, b[0], b[1], b[2]) if b[0] == -1 else (1, b[0], b[1], b[2]))
    paras = []
    for col, y, x, txt in blocks:
        # sambung paragraf yang terbelah antar kolom (diawali huruf kecil / angka lanjutan)
        if paras and (txt[:1].islower() or (not paras[-1].rstrip().endswith((".", ":", "?", "!", "”", '"'))
                                            and txt[:1].isalnum() and len(paras[-1]) > 80)):
            paras[-1] += " " + txt
        else:
            paras.append(txt)
    return paras


def main(src, dst):
    s = Path(src).read_text(encoding="utf-8")
    out = Path(dst)
    out.mkdir(parents=True, exist_ok=True)
    for i, m in enumerate(re.finditer(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', s, re.S), 1):
        paras = blok_halaman(m.group(3), float(m.group(1)))
        (out / f"p{i:03d}.txt").write_text("\n\n".join(paras) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
