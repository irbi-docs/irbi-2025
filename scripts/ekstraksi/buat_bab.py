"""Menyusun bab naratif (.qmd) dari teks buku (sekali pakai, tidak menimpa berkas yang ada).

Pemakaian:
  python3 -I scripts/ekstraksi/buat_bab.py _work/teks
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEKS: Path


def rapi(t: str) -> str:
    t = t.replace("I ndonesia", "Indonesia")
    t = re.sub(r"–\s+(\d)", r"–\1", t)
    t = re.sub(r"(\d)\s+–(\d)", r"\1–\2", t)
    t = re.sub(r"\s+([,.;:)])", r"\1", t)
    t = re.sub(r"\(\s+", "(", t)
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()


def P(page: int) -> list[str]:
    raw = (TEKS / f"p{page:03d}.txt").read_text(encoding="utf-8")
    return [rapi(p) for p in raw.split("\n\n") if p.strip()]


def tulis(nama: str, isi: str):
    path = ROOT / nama
    if path.exists():
        print("lewati (sudah ada):", nama)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(isi.strip() + "\n", encoding="utf-8")
    print("dibuat:", nama)


def daftar_bernomor(par: str) -> str:
    """'... yaitu: 1. Bahaya ... 2. Kerentanan ... 3. Kapasitas ...' -> pembuka + daftar."""
    m = re.match(r"(.*?:)\s*(1\..*)$", par)
    if not m:
        return par
    items = re.split(r"\s(?=\d\.\s)", m.group(2))
    return m.group(1) + "\n\n" + "\n".join(items)


def main(teks_dir):
    global TEKS
    TEKS = Path(teks_dir)

    # ---------------- Ringkasan eksekutif (hal. 8–11)
    p9, p10 = P(9), P(10)
    gabung = p9[-1] + " " + p10[0]
    par = p9[:-1] + [gabung] + p10[1:]
    kutipan = "Penurunan risiko sebesar 1,03% pada tahun 2025 adalah sinyal awal ketangguhan, sebuah langkah nyata menuju Indonesia yang lebih resilien."
    tulis("ringkasan-eksekutif.qmd", f"""
---
title: "Ringkasan Eksekutif"
---

![](assets/img/foto-ringkasan.jpg){{.irbi-foto-bab fig-alt="Foto dokumentasi kebencanaan"}}

{chr(10).join(p + chr(10) for p in par)}
::: {{.irbi-kutipan}}
{kutipan}
:::
""")

    # ---------------- Sambutan (hal. 12–13)
    p13 = P(13)
    isi = [p for p in p13 if p not in ("Jakarta,", "Mei", "2026") and not p.startswith("Letjen")]
    tulis("sambutan.qmd", f"""
---
title: "Sambutan Kepala BNPB"
---

![Letjen TNI Dr. Suharyanto, S.Sos., M.M., Kepala BNPB](assets/img/kepala-bnpb.png){{.irbi-potret fig-alt="Foto Kepala BNPB" width=1.8in}}

{chr(10).join(p + chr(10) for p in isi)}
::: {{.irbi-ttd}}
Jakarta, Mei 2026

**Letjen TNI Dr. Suharyanto, S.Sos., M.M.**\\
Kepala Badan Nasional Penanggulangan Bencana
:::
""")

    # ---------------- Pendahuluan (hal. 14–17)
    lb = P(15)
    rl = [p for p in P(16) if p != "RUANG LINGKUP"]
    rl[0] = daftar_bernomor(rl[0])
    p17 = P(17)
    i_pk = p17.index("PENGKAJIAN RISIKO")
    tj = [p for p in p17[:i_pk] if p != "TUJUAN"]
    tulis("pendahuluan.qmd", f"""
---
title: "Pendahuluan"
---

![](assets/img/foto-pendahuluan.jpg){{.irbi-foto-bab fig-alt="Foto dokumentasi kebencanaan"}}

## Latar Belakang

{chr(10).join(p + chr(10) for p in lb)}
## Ruang Lingkup

{chr(10).join(p + chr(10) for p in rl)}
## Tujuan

{chr(10).join(p + chr(10) for p in tj)}""")

    # ---------------- Metodologi (hal. 17–31)
    pk = p17[i_pk + 1:]
    # hal. 18 tersusun dua kolom yang bertumpuk; disusun ulang secara manual dari tata letak asli
    pk_lanjut = [
        pk[-1] + " sosial budaya, fisik, ekonomi dan lingkungan.",
        "Kapasitas adalah gabungan dari semua kekuatan, karakteristik, dan sumber daya yang tersedia dalam "
        "sebuah komunitas, masyarakat, atau organisasi yang dapat digunakan untuk melaksanakan tindakan guna "
        "mengurangi tingkat ancaman dan/atau tingkat kerugian akibat bencana serta mencapai tujuan "
        "penanggulangan bencana yang telah disepakati.",
        "Interaksi ketiga komponen tersebut digunakan untuk menghitung potensi risiko bencana, yang meliputi "
        "sebaran bahaya, potensi jiwa terpapar, kerugian harta benda, kerusakan lingkungan, serta kapasitas "
        "penanggulangan bencana. Secara matematis, potensi risiko diformulasikan sebagai berikut:",
        "$$\nRisiko\\ (R) \\approx Bahaya\\ (H) \\times \\frac{Kerentanan\\ (V)}{Kapasitas\\ (C)}\n$$",
        "Secara umum, tahapan pengkajian risiko bencana mencakup akuisisi data, pengolahan dan analisis data, "
        "serta penyajian hasil kajian dalam bentuk indeks secara tabular dan spasial. Pengkajian risiko bencana "
        "dilaksanakan berdasarkan prinsip-prinsip berikut:",
        "1) Menggunakan data dan informasi yang mengutamakan sumber resmi dari lembaga yang berwenang;\n"
        "2) Mengintegrasikan analisis probabilitas kejadian bencana berdasarkan masukan dari walidata, para "
        "pakar, dan kearifan lokal;\n"
        "3) Proses analisis harus mampu menghasilkan estimasi jumlah jiwa terpapar, kerugian harta benda, "
        "kerusakan lingkungan terpapar;\n"
        "4) Hasil kajian risiko dapat diterjemahkan menjadi kebijakan pengurangan risiko bencana.",
    ]
    pk = pk[:-1] + pk_lanjut
    ad = [p for p in P(20) if p != "ANALISIS DATA"] + P(21)
    ad = [p.replace("dapat dilihat pada halaman 22—23.", "dapat dilihat pada bagian Penilaian IKD Tahun 2025 berikut.")
          for p in ad]
    p24 = [p for p in P(24) if p != "ANALISIS TINGKAT RISIKO BENCANA KABUPATEN/KOTA"]
    p25 = P(25)
    skoring = p25[-1]
    p25 = p25[:-1]
    tulis("metodologi.qmd", f"""
---
title: "Metodologi"
---

![](assets/img/foto-metodologi.jpg){{.irbi-foto-bab fig-alt="Foto udara wilayah terdampak banjir bandang"}}

## Metodologi Pengkajian Risiko

{chr(10).join(p + chr(10) for p in pk)}
## Metodologi Analisis Data

{chr(10).join(p + chr(10) for p in ad)}
{{{{< include _metodologi-tabel.qmd >}}}}
""")
    (ROOT / "_work").mkdir(exist_ok=True)
    (ROOT / "_work" / "metodologi_tingkat_risiko.txt").write_text(
        "\n\n".join(p24 + p25 + [skoring]), encoding="utf-8")

    # ---------------- Hasil analisis (hal. 34–36)
    h = [p for p in P(34) if not p.startswith("HASIL")]
    h = [p for p in h if p != "Perhitungan IRBI Tahun 2025"]
    p35 = P(35)
    (ROOT / "_work" / "hasil.txt").write_text("\n\n".join(h + p35), encoding="utf-8")

    # ---------------- Daftar pustaka (hal. 376–379)
    lines = []
    for p in range(376, 380):
        lines += P(p)
    s = " ".join(l for l in lines if l not in ("Daftar Pustaka",))
    s = rapi(s)
    bagian = re.split(r"\s(?=[A-E]\.\s(?:Dokumen|Publikasi|Jurnal|Buku))", " " + s)
    out = ["---", 'title: "Daftar Pustaka"', "---", ""]
    for b in bagian:
        b = b.strip()
        if not b:
            continue
        m = re.match(r"([A-E])\.\s(Dokumen RPJMD \(Rencana Pembangunan Jangka Menengah Daerah\)|Publikasi Badan "
                     r"Pusat Statistik \(Provinsi dalam Angka\)|Jurnal / Artikel Ilmiah|Buku / Disertasi|Dokumen "
                     r"Kementerian)\s*(.*)$", b)
        if not m:
            print("bagian pustaka tidak dikenali:", b[:80])
            continue
        out.append(f"## {m.group(1)}. {m.group(2)}\n")
        entri = re.split(r"(?<=\.)\s+(?=[A-Z][^():]{0,160}?\(\d{4}\))", m.group(3))
        rapih = []
        for e in entri:
            if rapih and not re.search(r"\(\d{4}\)", e):
                rapih[-1] += " " + e
            else:
                rapih.append(e)
        out.append("::: {.irbi-pustaka}")
        out.extend(rapih_e for rapih_e in rapih)
        out.append(":::\n")
    teks = "\n".join(out)
    teks = teks.replace("::: {.irbi-pustaka}\n", "::: {.irbi-pustaka}\n\n")
    teks = re.sub(r"(?m)^(?!#|:::|---|title|$)(.+)$", r"\1\n", teks)
    tulis("daftar-pustaka.qmd", teks)


if __name__ == "__main__":
    main(sys.argv[1])
