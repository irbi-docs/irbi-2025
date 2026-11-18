"""Ekstraksi tabel IRBI 2025 dari teks PDF (sekali pakai).

Membaca hasil `pdftotext -layout` dari BUKU IRBI 2025.pdf lalu menulis:
  data/irbi_provinsi.csv   - 38 provinsi (kolom SEB dan 2025)
  data/irbi_kabkota.csv    - 514 kabupaten/kota (skor & kelas multi-bahaya)
  data/irbi_ancaman.csv    - skor & kelas per jenis ancaman (format panjang)

Skrip ini hanya dipakai saat konversi awal dari PDF. Setelah itu, CSV di folder
data/ adalah sumber utama yang boleh diedit langsung.

Pemakaian:
  pdftotext -layout "BUKU IRBI 2025.pdf" _work/buku.txt
  python3 scripts/ekstraksi/ekstrak_tabel.py _work/buku.txt data/
"""
import csv
import re
import sys
from pathlib import Path

PROVINSI = [
    "ACEH", "SUMATERA UTARA", "SUMATERA BARAT", "RIAU", "JAMBI", "SUMATERA SELATAN",
    "BENGKULU", "LAMPUNG", "KEPULAUAN BANGKA BELITUNG", "KEPULAUAN RIAU", "DKI JAKARTA",
    "JAWA BARAT", "JAWA TENGAH", "DAERAH ISTIMEWA YOGYAKARTA", "JAWA TIMUR", "BANTEN",
    "BALI", "NUSA TENGGARA BARAT", "NUSA TENGGARA TIMUR", "KALIMANTAN BARAT",
    "KALIMANTAN TENGAH", "KALIMANTAN SELATAN", "KALIMANTAN TIMUR", "KALIMANTAN UTARA",
    "SULAWESI UTARA", "SULAWESI TENGAH", "SULAWESI SELATAN", "SULAWESI TENGGARA",
    "GORONTALO", "SULAWESI BARAT", "MALUKU", "MALUKU UTARA", "PAPUA", "PAPUA BARAT",
    "PAPUA SELATAN", "PAPUA TENGAH", "PAPUA PEGUNUNGAN", "PAPUA BARAT DAYA",
]

# Halaman (1-based) bagian per ancaman, sesuai daftar isi buku.
ANCAMAN = [
    ("banjir", "Banjir", 212, 227),
    ("gempabumi", "Gempabumi", 230, 245),
    ("tsunami", "Tsunami", 248, 256),
    ("letusan-gunungapi", "Letusan Gunungapi", 260, 263),
    ("banjir-bandang", "Banjir Bandang", 266, 278),
    ("gelombang-ekstrem-abrasi", "Gelombang Ekstrem dan Abrasi", 282, 291),
    ("kebakaran-hutan-lahan", "Kebakaran Hutan dan Lahan", 294, 307),
    ("tanah-longsor", "Tanah Longsor", 310, 323),
    ("kekeringan", "Kekeringan", 326, 341),
    ("likuefaksi", "Likuefaksi", 344, 355),
    ("cuaca-ekstrem", "Cuaca Ekstrem", 358, 373),
]

KELAS = r"(TINGGI|SEDANG|RENDAH)"
PROV_ALT = "|".join(sorted((re.escape(p) for p in PROVINSI), key=len, reverse=True))
ROW_KAB_PROV = re.compile(
    rf"^\s*(\d+)\.?\s+(.+?)\s+({PROV_ALT})\s+(\d+(?:[.,]\d+)?)\s+{KELAS}\s*$"
)
ROW_KAB = re.compile(rf"^\s*(\d+)\.?\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+{KELAS}\s*$")
ROW_PROV = re.compile(rf"^\s*(\d+)\s+({PROV_ALT})\s+(\d+,\d+)\s+(\d+,\d+)\s*$")


def angka(s: str) -> float:
    return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)


def kelas_dari_skor(skor: float) -> str:
    if skor > 176.0:
        return "TINGGI"
    if skor >= 14.67:
        return "SEDANG"
    return "RENDAH"


def baca_halaman(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").split("\f")


# Koreksi nama yang salah ketik / memakai nama lama di buku.
KOREKSI_NAMA = {
    "KEP, SIAU TAGULANDANG BIARO": "KEP. SIAU TAGULANDANG BIARO",
    "MALUKU TENGGARA BARAT": "KEPULAUAN TANIMBAR",
    "BOLAANG MONGONDOW SE-": "BOLAANG MONGONDOW SELATAN",
}


def _lengkapi_provinsi(m):
    """'KEPULAUAN BANGKA BELI-' -> 'KEPULAUAN BANGKA BELITUNG' (nama provinsi terpotong)."""
    segs = re.split(r"\s{2,}", m.group(1))
    prefix = segs[-1].strip()
    cocok = [p for p in PROVINSI if p.startswith(prefix)]
    if len(cocok) == 1:
        segs[-1] = cocok[0]
    return "   ".join(segs)


def gabung_baris_terpotong(lines):
    """Menangani baris tabel yang terbelah dua (provinsi terpotong ke baris berikutnya)."""
    out, i = [], 0
    while i < len(lines):
        line = re.sub(r"^(\s*\d+\.?\s+.+?)-(?=\s+\d)", _lengkapi_provinsi, lines[i])
        # contoh: '167   PINRANG                 SULAWESI' + '   216SELATAN   16.80   TINGGI'
        if (re.match(r"^\s*\d+\.?\s+[A-Z]", line) and not re.search(r"\d\s+" + KELAS, line)
                and i + 1 < len(lines) and re.search(r"\s" + KELAS + r"\s*$", lines[i + 1])
                and not re.match(r"^\s*\d+\.?\s+[A-Z]", lines[i + 1])):
            nxt = re.sub(r"^\s*\d*", "", lines[i + 1])  # buang nomor halaman yang menempel
            line = line.rstrip() + " " + nxt.strip()
            line = re.sub(r"(\S+)\s+(\d+(?:[.,]\d+)?)\s+" + KELAS,
                          lambda m: f"{m.group(1)}   {m.group(2)}   {m.group(3)}", line)
            i += 1
        out.append(line)
        i += 1
    return out


def parse_rows(pages, start, end, with_prov=True):
    rows, bad = [], []
    for p in range(start, end + 1):
        for line in gabung_baris_terpotong(pages[p - 1].splitlines()):
            m = (ROW_KAB_PROV if with_prov else ROW_KAB).match(line)
            if m:
                g = list(m.groups())
                g[1] = " ".join(g[1].split())
                g[1] = KOREKSI_NAMA.get(g[1], g[1])
                rows.append((p, tuple(g)))
            elif re.match(r"^\s*\d+\.?\s+[A-Z]", line) and not re.search(r"KABUPATEN/KOTA", line):
                bad.append((p, line))
    return rows, bad


def cek_urutan(nama, rows):
    nos = [int(r[1][0]) for r in rows]
    gaps = [(a, b) for a, b in zip(nos, nos[1:]) if b != a + 1]
    if nos and (nos[0] != 1 or gaps):
        print(f"  ! {nama}: urutan tidak kontinu, mulai={nos[0]} celah={gaps[:10]}")


def main(txt, outdir):
    pages = baca_halaman(Path(txt))
    out = Path(outdir)

    # 1. Provinsi (halaman 36)
    prov = []
    for line in pages[36 - 1].splitlines():
        m = ROW_PROV.match(line)
        if m:
            no, nama, seb, v25 = m.groups()
            prov.append({"no": int(no), "provinsi": nama, "irbi_seb": angka(seb),
                         "irbi_2025": angka(v25), "kelas": kelas_dari_skor(angka(v25))})
    assert len(prov) == 38, len(prov)
    with open(out / "irbi_provinsi.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(prov[0]))
        w.writeheader()
        w.writerows(prov)
    print(f"provinsi: {len(prov)} baris")

    # 2. Kabupaten/kota multi-bahaya (halaman 40-55)
    rows, bad = parse_rows(pages, 40, 55)
    cek_urutan("kabkota", rows)
    for b in bad:
        print("  ? tidak terbaca:", b)
    kab = []
    for _, (no, nama, provinsi, skor, kelas) in rows:
        kab.append({"peringkat": int(no), "kabkota": " ".join(nama.split()),
                    "provinsi": provinsi, "skor": angka(skor), "kelas": kelas})
    print(f"kabkota: {len(kab)} baris")

    # 3. Tabel per provinsi (bab provinsi) untuk validasi silang
    per_prov = {}
    for p in range(58, 210):
        head = pages[p - 1]
        m = re.search(r"Tabel nilai indeks risiko (?:Provinsi )?(.+?) Tahun 2025", head)
        if not m:
            continue
        r, b = parse_rows(pages, p, p, with_prov=False)
        for _, (no, nama, skor, kelas) in r:
            per_prov.setdefault(m.group(1).strip().upper(), {})[" ".join(nama.split())] = (angka(skor), kelas)
        for x in b:
            print("  ? tidak terbaca (bab provinsi):", x)
    n_cross = sum(len(v) for v in per_prov.values())
    beda = []
    idx = {(k["provinsi"], k["kabkota"]): k for k in kab}
    alias = {"ACEH": "ACEH", "DAERAH ISTIMEWA YOGYAKARTA": "DAERAH ISTIMEWA YOGYAKARTA"}
    for pv, d in per_prov.items():
        pkey = alias.get(pv, pv)
        for nama, (skor, kelas) in d.items():
            k = idx.get((pkey, nama))
            if not k:
                beda.append(("tidak ada di tabel nasional", pv, nama, skor))
            elif abs(k["skor"] - skor) > 0.005 or k["kelas"] != kelas:
                beda.append(("nilai beda", pv, nama, skor, k["skor"], kelas, k["kelas"]))
    print(f"validasi silang bab provinsi: {n_cross} baris, {len(beda)} perbedaan")
    for x in beda[:40]:
        print("   ", x)

    with open(out / "irbi_kabkota.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(kab[0]))
        w.writeheader()
        w.writerows(kab)

    # 4. Per ancaman
    anc = []
    for slug, label, a, b in ANCAMAN:
        rows, bad = parse_rows(pages, a, b)
        cek_urutan(slug, rows)
        for x in bad:
            print(f"  ? tidak terbaca ({slug}):", x)
        for _, (no, nama, provinsi, skor, kelas) in rows:
            anc.append({"ancaman": slug, "peringkat": int(no), "kabkota": " ".join(nama.split()),
                        "provinsi": provinsi, "skor": angka(skor), "kelas": kelas})
        print(f"ancaman {slug}: {len(rows)} baris")
    with open(out / "irbi_ancaman.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(anc[0]))
        w.writeheader()
        w.writerows(anc)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
