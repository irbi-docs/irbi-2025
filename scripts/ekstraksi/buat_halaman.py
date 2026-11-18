"""Membuat halaman .qmd provinsi & ancaman dari teks buku (sekali pakai).

Tidak menimpa berkas yang sudah ada — setelah dibuat, berkas .qmd adalah sumber
utama dan boleh diedit bebas.

Pemakaian:
  python3 -I scripts/ekstraksi/buat_halaman.py _work/teks
"""
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from bangun import judul, slugify, angka  # noqa: E402


def rapikan(t: str) -> str:
    t = re.sub(r"km\s*2\s*\.", "km².", t)
    t = re.sub(r"km\s*2\b", "km²", t)
    t = re.sub(r"\s+([,.;:)])", r"\1", t)
    t = re.sub(r"\(\s+", "(", t)
    t = t.replace(" ,", ",")
    return re.sub(r"\s{2,}", " ", t).strip()


def pecah_paragraf(paras):
    """Pisahkan paragraf gabungan pada pola khas teks provinsi."""
    out = []
    for p in paras:
        p = re.sub(r"(\(BPS(?:[^)]*)?\)\.?)\s+(?=[A-Z])", r"\1\n\n", p)
        p = re.sub(r"(\(RPJMD[^)]*\)\.?|\(Rencana Pembangunan[^)]*\)\.?)\s+(?=[A-Z])", r"\1\n\n", p)
        p = re.sub(r"\s+(Berdasarkan Data dan Informasi Bencana)", r"\n\n\1", p)
        out.extend(x.strip() for x in p.split("\n\n") if x.strip())
    return out


def halaman_provinsi(teks_dir: Path, prov, i):
    page = 58 + 4 * i
    raw = (teks_dir / f"p{page:03d}.txt").read_text(encoding="utf-8")
    paras = [p.strip() for p in raw.split("\n\n") if p.strip()]
    body, ancaman, ambil_ancaman = [], "", False
    for p in paras:
        if p.startswith("INDEKS RISIKO BENCANA TAHUN") or re.fullmatch(r"(PROVINSI |DAERAH ISTIMEWA )?[A-Z .]+", p):
            continue
        if p.startswith("Ancaman Bencana"):
            ambil_ancaman = True
            sisa = p.split(":", 1)[1].strip() if ":" in p else ""
            if sisa:
                ancaman = sisa
            continue
        if ambil_ancaman and not ancaman:
            ancaman = p
            continue
        body.append(rapikan(p))
    body = pecah_paragraf(body)
    return body, rapikan(ancaman)


def main(teks_dir):
    teks_dir = Path(teks_dir)
    prov = list(csv.DictReader(open(ROOT / "data" / "irbi_provinsi.csv", encoding="utf-8")))
    (ROOT / "provinsi").mkdir(exist_ok=True)
    laporan = []
    for i, r in enumerate(prov):
        nama = judul(r["provinsi"])
        slug = slugify(r["provinsi"])
        path = ROOT / "provinsi" / f"{r['kode']}-{slug}.qmd"
        body, ancaman = halaman_provinsi(teks_dir, r, i)
        # cek angka IRB di narasi vs tabel
        m = re.search(r"nilai\s+(\d+,\d+)", " ".join(body))
        if m and m.group(1) != angka(float(r["irbi_2025"])):
            laporan.append(f"{nama}: narasi menyebut {m.group(1)}, tabel {angka(float(r['irbi_2025']))}")
        if path.exists():
            continue
        teks = "\n\n".join(body)
        isi = f"""---
title: "{nama}"
---

![](../assets/img/lambang/{r['kode']}.png){{.irbi-lambang fig-alt="Lambang {nama}" width=0.8in}}

{{{{< include /_gen/provinsi/{r['kode']}-ringkasan.md >}}}}

## Profil Wilayah

{teks}

::: {{.callout-note appearance="simple" icon=false}}
## Ancaman Bencana

{ancaman}
:::

## Peta Indeks Risiko Bencana

{{{{< include /_gen/provinsi/{r['kode']}-peta.md >}}}}

## Tabel Nilai Indeks Risiko

{{{{< include /_gen/provinsi/{r['kode']}-tabel.md >}}}}
"""
        path.write_text(isi, encoding="utf-8")
    for x in laporan:
        print("selisih narasi:", x)

    jenis = list(csv.DictReader(open(ROOT / "data" / "jenis_indeks.csv", encoding="utf-8")))
    (ROOT / "ancaman").mkdir(exist_ok=True)
    for j in jenis:
        if j["slug"] == "irbi":
            continue
        path = ROOT / "ancaman" / f"{j['slug']}.qmd"
        if path.exists():
            continue
        isi = f"""---
title: "{j['nama']}"
---

Bagian ini menyajikan Indeks Risiko Bencana {j['nama'].lower()} tahun 2025 untuk setiap kabupaten/kota
yang dinilai, diurutkan dari skor tertinggi. Kabupaten/kota yang tidak tercantum pada tabel tidak dinilai
untuk jenis ancaman ini dan ditampilkan abu-abu pada peta.

{{{{< include /_gen/ancaman/{j['slug']}-ringkasan.md >}}}}

## Peta Indeks Risiko Bencana {j['nama']}

{{{{< include /_gen/ancaman/{j['slug']}-peta.md >}}}}

## Tabel Indeks Risiko Bencana {j['nama']}

{{{{< include /_gen/ancaman/{j['slug']}-tabel.md >}}}}
"""
        path.write_text(isi, encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1])
