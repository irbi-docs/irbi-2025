#!/usr/bin/env python3
"""Pasca-render: menata navigasi edisi HTML seperti buku (dijalankan Quarto setelah semua halaman selesai).

1. Bilah sisi kiri dikelompokkan seperti buku cetak (Bagian awal, Pengantar, ..., Referensi & lampiran)
   memakai <details>, dengan label pendek, penanda halaman aktif, dan kaki bilah.
2. Tombol Sebelumnya/Berikutnya serta <link rel="prev/next"> mengikuti urutan bilah sisi itu.
3. Halaman Daftar Isi (daftar-isi.html) dibuat dari kerangka index.html. Buku Quarto hanya merender bab, dan
   daftar isi buku cetak (dengan nomor halaman cetak) tidak boleh ikut ke PDF yang sudah punya daftar isinya
   sendiri.
4. Setiap halaman diberi kelas <body> (irbi-hal-*, irbi-bagian-*) dan baris kredit halaman buku cetak.
5. Blok judul tambahan (lambang dan nilai provinsi, dibuat scripts/bangun.py) dipindah ke dalam blok judul.

Hanya memakai pustaka standar Python. Aman dijalankan berulang: halaman yang sudah ditata dikenali dan ditata
ulang dari datanya sendiri. Hanya mengubah HTML, PDF tidak tersentuh.
"""
import html
import os
import posixpath
import re
import sys
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
_keluaran = os.environ.get("QUARTO_PROJECT_OUTPUT_DIR")
KELUARAN = Path(_keluaran) if _keluaran else AKAR / "_book"
if not KELUARAN.is_absolute():
    KELUARAN = AKAR / KELUARAN

JUDUL_BUKU = "Indeks Risiko Bencana Indonesia Tahun 2025"
SUMBER = "Buku IRBI 2025, BNPB"

# Kelompok bilah sisi, urut seperti buku. "awalan" menarik semua halaman di folder itu (urut sesuai _quarto.yml).
GRUP = [
    {"id": "awal", "label": "Bagian awal", "isi": ["index.html", "daftar-isi.html", "jelajah.html"]},
    {"id": "pengantar", "label": "Pengantar", "isi": ["tim-redaksi.html", "ringkasan-eksekutif.html", "sambutan.html"]},
    {"id": "dasar", "label": "Pendahuluan & metodologi", "isi": ["pendahuluan.html", "metodologi.html"]},
    {"id": "hasil", "label": "Hasil IRBI", "isi": ["hasil-provinsi.html", "hasil-kabkota.html"]},
    {"id": "provinsi", "label": "Profil 38 provinsi", "awalan": "provinsi/", "tutup": True},
    {"id": "ancaman", "label": "11 jenis ancaman", "awalan": "ancaman/", "tutup": True},
    {"id": "akhir", "label": "Referensi & lampiran",
     "isi": ["daftar-pustaka.html", "unduhan.html", "studio.html", "panduan-edit.html"]},
]
GRUP_SISA = "akhir"  # halaman baru yang belum masuk kelompok mana pun ditaruh di sini, jadi tidak pernah hilang

# Label bilah sisi yang lebih pendek dari judul halaman.
LABEL = {
    "index.html": "Sampul",
    "daftar-isi.html": "Daftar Isi",
    "sambutan.html": "Sambutan",
    "hasil-kabkota.html": "Indeks Kabupaten/Kota",
    "provinsi/index.html": "Ikhtisar 38 provinsi",
    "ancaman/index.html": "Ikhtisar 11 ancaman",
}

# Halaman buku cetak (daftar isi buku IRBI 2025, hlm. iii–iv).
HAL_BUKU = {
    "daftar-isi.html": "iii–iv",
    "tim-redaksi.html": "i–ii",
    "ringkasan-eksekutif.html": "8–9",
    "sambutan.html": "12–13",
    "pendahuluan.html": "14–17",
    "metodologi.html": "17–31",
    "hasil-provinsi.html": "32–39",
    "hasil-kabkota.html": "40–57",
    "provinsi/index.html": "58–209",
    "ancaman/index.html": "210–375",
    "daftar-pustaka.html": "376–379",
}
PROV_HAL = {  # kode provinsi -> halaman pertama babnya di buku cetak (tiap bab 4 halaman)
    "11": 58, "12": 62, "13": 66, "14": 70, "15": 74, "16": 78, "17": 82, "18": 86, "19": 90, "21": 94,
    "31": 98, "32": 102, "33": 106, "34": 110, "35": 114, "36": 118, "51": 122, "52": 126, "53": 130,
    "61": 134, "62": 138, "63": 142, "64": 146, "65": 150, "71": 154, "72": 158, "73": 162, "74": 166,
    "75": 170, "76": 174, "81": 178, "82": 182, "92": 186, "91": 190, "94": 194, "93": 198, "95": 202, "96": 206,
}
ANCAMAN_HAL = {
    "banjir": "212–229", "gempabumi": "230–247", "tsunami": "248–259", "letusan-gunungapi": "260–265",
    "banjir-bandang": "266–281", "gelombang-ekstrem-abrasi": "282–293", "kebakaran-hutan-lahan": "294–309",
    "tanah-longsor": "310–325", "kekeringan": "326–343", "likuefaksi": "344–357", "cuaca-ekstrem": "358–375",
}

esc = lambda s: html.escape(s, quote=True)


def halaman_buku(jalur):
    if jalur in HAL_BUKU:
        return HAL_BUKU[jalur]
    m = re.match(r"provinsi/(\d\d)-", jalur)
    if m and m.group(1) in PROV_HAL:
        a = PROV_HAL[m.group(1)]
        return f"{a}–{a + 3}"
    m = re.match(r"ancaman/([\w-]+)\.html$", jalur)
    if m:
        return ANCAMAN_HAL.get(m.group(1))
    return None


# ------------------------------------------------------------------ alat bantu HTML
def blok(teks, mulai, tag):
    """Batas elemen <tag ...> yang dimulai di indeks `mulai`, dengan menghitung tag bersarang."""
    buka = re.compile(rf"<{tag}[\s>]|</{tag}>")
    dalam = 0
    for m in buka.finditer(teks, mulai):
        if m.group(0).startswith("</"):
            dalam -= 1
            if dalam == 0:
                return mulai, m.end()
        else:
            dalam += 1
    raise ValueError(f"<{tag}> tidak tertutup")


def ganti_blok(teks, penanda, tag, baru):
    i = teks.find(penanda)
    if i < 0:
        return teks, False
    a, b = blok(teks, i, tag)
    return teks[:a] + baru + teks[b:], True


def relatif(dari, ke):
    r = posixpath.relpath(ke, posixpath.dirname(dari) or ".")
    return r if r.startswith("../") else "./" + r


def ke_akar(dari, href):
    href = href.split("#")[0]
    return posixpath.normpath(posixpath.join(posixpath.dirname(dari), href))


# ------------------------------------------------------------------ daftar bab dari bilah sisi
STOK = re.compile(r'<a href="([^"]+)" class="sidebar-item-text sidebar-link(?: active)?">\s*'
                  r'<span class="(?:chapter-title|menu-text)"[^>]*>(.*?)</span>', re.S)
MILIK = re.compile(r'<a href="[^"]*" class="sidebar-link irbi-nav-link[^"]*"[^>]*?'
                   r'data-irbi-href="([^"]+)" data-irbi-judul="([^"]*)"')


def ambil_bab(teks, jalur):
    """[(jalur dari akar, judul)] sesuai urutan bilah sisi; mengenali bilah bawaan Quarto maupun hasil skrip ini."""
    i = teks.find('<div class="sidebar-menu-container')
    if i < 0:
        return []
    a, b = blok(teks, i, "div")
    isi = teks[a:b]
    if "data-irbi-nav" in isi:
        bab = [(h, html.unescape(j)) for h, j in MILIK.findall(isi)]
    else:
        bab = [(ke_akar(jalur, h), html.unescape(re.sub(r"<[^>]+>", "", j)).strip()) for h, j in STOK.findall(isi)]
    terlihat, hasil = set(), []
    for h, j in bab:
        if h != "daftar-isi.html" and h not in terlihat:
            terlihat.add(h)
            hasil.append((h, j))
    return hasil


def susun(bab):
    judul = dict(bab)
    judul["daftar-isi.html"] = "Daftar Isi"
    dipakai, grup = set(), []
    for g in GRUP:
        if "awalan" in g:
            jalur = [h for h, _ in bab if h.startswith(g["awalan"])]
            jalur.sort(key=lambda h: (not h.endswith("/index.html"),))  # ikhtisar dulu, sisanya urut buku
        else:
            jalur = [h for h in g["isi"] if h in judul]
        grup.append(dict(g, item=[{"jalur": h, "judul": judul[h], "label": LABEL.get(h, judul[h])} for h in jalur]))
        dipakai.update(jalur)
    sisa = [h for h, _ in bab if h not in dipakai]
    if sisa:
        g = next(g for g in grup if g["id"] == GRUP_SISA)
        g["item"] += [{"jalur": h, "judul": judul[h], "label": LABEL.get(h, judul[h])} for h in sisa]
    return [g for g in grup if g["item"]]


# ------------------------------------------------------------------ potongan HTML
def nav_html(jalur, grup):
    o = ['<div class="sidebar-menu-container irbi-nav" data-irbi-nav="1">',
         '<p class="irbi-nav-kepala">Isi buku</p>']
    for g in grup:
        aktif = any(it["jalur"] == jalur for it in g["item"])
        buka = " open" if (aktif or not g.get("tutup")) else ""
        o.append(f'<details class="irbi-nav-grup" data-grup="{g["id"]}"{buka}><summary>{esc(g["label"])}</summary><ul>')
        for it in g["item"]:
            ini = it["jalur"] == jalur
            kelas = "sidebar-link irbi-nav-link" + (" active" if ini else "")
            kini = ' aria-current="page"' if ini else ""
            o.append(f'<li><a href="{relatif(jalur, it["jalur"])}" class="{kelas}"{kini} '
                     f'data-irbi-href="{esc(it["jalur"])}" data-irbi-judul="{esc(it["judul"])}">{esc(it["label"])}</a></li>')
        o.append("</ul></details>")
    o.append('<p class="irbi-nav-kaki"><span class="irbi-nav-titik" aria-hidden="true"></span>Edisi digital interaktif'
             f'<small>Sumber: {SUMBER}.</small></p></div>')
    return "".join(o)


def pager_html(jalur, datar):
    jalurs = [it["jalur"] for it in datar]
    if jalur not in jalurs:
        return None, None, None
    i = jalurs.index(jalur)
    sblm = datar[i - 1] if i > 0 else None
    brkt = datar[i + 1] if i + 1 < len(datar) else None
    o = ['<nav class="page-navigation irbi-pager" aria-label="Halaman sebelumnya dan berikutnya">']
    o.append('<div class="nav-page nav-page-previous">')
    if sblm:
        o.append(f'<a href="{relatif(jalur, sblm["jalur"])}" class="pagination-link" rel="prev">'
                 f'<small><i class="bi bi-arrow-left-short" aria-hidden="true"></i> Sebelumnya</small>'
                 f'<strong>{esc(sblm["label"])}</strong></a>')
    o.append('</div><div class="nav-page nav-page-next">')
    if brkt:
        o.append(f'<a href="{relatif(jalur, brkt["jalur"])}" class="pagination-link" rel="next">'
                 f'<small>Berikutnya <i class="bi bi-arrow-right-short" aria-hidden="true"></i></small>'
                 f'<strong>{esc(brkt["label"])}</strong></a>')
    o.append("</div></nav>")
    return "".join(o), sblm, brkt


def kredit_html(jalur):
    if jalur == "index.html":
        return ""
    hal = halaman_buku(jalur)
    kiri = f"{SUMBER} · halaman {hal}" if hal else "Edisi digital IRBI 2025 · halaman khusus web"
    return f'<footer class="irbi-kredit"><span>{esc(kiri)}</span><span>Indeks Risiko Bencana Indonesia</span></footer>'


# ------------------------------------------------------------------ halaman Daftar Isi
def entri(href, judul, hal, utama=False):
    h = f'<span class="irbi-di-hal">{esc(hal)}</span>' if hal else '<span class="irbi-di-hal irbi-di-web">web</span>'
    li = '<li class="utama">' if utama else "<li>"
    return (f'{li}<a href="{href}"><span class="irbi-di-teks">{esc(judul)}</span>'
            f'<span class="irbi-di-titik" aria-hidden="true"></span>{h}</a></li>')


def daftar_isi_html(bab):
    judul = dict(bab)
    ada = lambda h: h in judul
    # urut seperti buku cetak (nomor halaman), bukan urut kode wilayah
    prov = sorted((h for h, _ in bab if h.startswith("provinsi/") and not h.endswith("index.html")),
                  key=lambda h: PROV_HAL.get(h.split("/")[1][:2], 999))
    anc = [h for h, _ in bab if h.startswith("ancaman/") and not h.endswith("index.html")]

    def nama_prov(h):
        n = judul[h]
        return "Pemerintah Aceh" if n == "Aceh" else "Provinsi " + n

    grup = [
        ("di-pengantar", None, None, [
            ("./ringkasan-eksekutif.html", "Ringkasan Eksekutif", "8–9", True),
            ("./sambutan.html", "Sambutan Kepala BNPB", "12–13", True)]),
        ("di-pendahuluan", "Pendahuluan", ("./pendahuluan.html", "14–17"), [
            ("./pendahuluan.html#latar-belakang", "Latar Belakang", "14–15", False),
            ("./pendahuluan.html#ruang-lingkup", "Ruang Lingkup", "16–17", False),
            ("./pendahuluan.html#tujuan", "Tujuan", "16–17", False)]),
        ("di-metodologi", "Metodologi", ("./metodologi.html", "17–31"), [
            ("./metodologi.html#metodologi-pengkajian-risiko", "Metodologi Pengkajian Risiko", "17–19", False),
            ("./metodologi.html#metodologi-analisis-data", "Metodologi Analisis Data", "20–23", False),
            ("./metodologi.html#metodologi-analisis-tingkat-risiko-bencana-kabupatenkota",
             "Metodologi Analisis Tingkat Risiko Bencana Kabupaten/Kota", "24–31", False)]),
        ("di-analisis", "Analisis Data", ("./hasil-provinsi.html", "32–57"), [
            ("./hasil-provinsi.html#indeks-risiko-bencana-tingkat-provinsi", "Tabel Indeks Risiko Bencana Provinsi", "34–39", False),
            ("./hasil-kabkota.html", "Tabel Indeks Risiko Bencana Kabupaten/Kota", "40–57", False)]),
        ("di-provinsi", "Indeks Risiko Bencana 2025", ("./provinsi/index.html", "58–209"),
         [("./" + h, nama_prov(h), halaman_buku(h), False) for h in prov]),
        ("di-ancaman", "Tabel dan Peta Indeks Risiko per Ancaman", ("./ancaman/index.html", "212–375"),
         [("./" + h, judul[h], halaman_buku(h), False) for h in anc]),
        ("di-pustaka", "Daftar Pustaka", ("./daftar-pustaka.html", "376–379"), []),
        ("di-digital", "Edisi digital", None, [
            (f"./{h}", t, halaman_buku(h), False) for h, t in [
                ("index.html", "Sampul dan pengantar edisi digital"), ("tim-redaksi.html", "Tim Redaksi"),
                ("jelajah.html", "Jelajah Data"), ("unduhan.html", "Unduhan"), ("studio.html", "Studio"),
                ("panduan-edit.html", "Panduan Mengedit")] if ada(h)]),
    ]
    o = ['<header id="title-block-header" class="quarto-title-block default">',
         '<div class="quarto-title"><h1 class="title"><span class="chapter-title">Daftar Isi</span></h1></div></header>',
         '<div class="irbi-di">',
         '<p class="irbi-di-pengantar">Susunan isi mengikuti buku cetak IRBI 2025. Angka di kanan adalah nomor '
         'halaman buku cetak; klik judulnya untuk membuka bagian yang sama di edisi digital ini.</p>',
         '<div class="irbi-di-kolom">']
    toc = []
    for gid, gjudul, gtaut, isi in grup:
        if gjudul is None and not isi:
            continue
        o.append(f'<section class="irbi-di-grup" id="{gid}">')
        if gjudul:
            href, hal = gtaut if gtaut else (None, None)
            teks = f'<a href="{href}">{esc(gjudul)}</a>' if href else esc(gjudul)
            o.append(f'<h2 class="irbi-di-judul">{teks}{f"<span>{esc(hal)}</span>" if hal else ""}</h2>')
            toc.append((gid, gjudul))
        else:
            toc.append((gid, "Pengantar"))
        if isi:
            o.append("<ol>" + "".join(entri(*e) for e in isi) + "</ol>")
        o.append("</section>")
    o.append("</div></div>")
    return "".join(o), toc


def buat_daftar_isi(t, bab):
    konten, toc = daftar_isi_html(bab)
    t = re.sub(r"<title>.*?</title>", f"<title>Daftar Isi – {esc(JUDUL_BUKU)}</title>", t, count=1, flags=re.S)
    i = t.find('<main class="content"')
    j = t.find("</main>", i)
    kepala = t[i:t.find(">", i) + 1]
    m = re.search(r'<a onclick="window.scrollTo\(0, 0\); return false;" role="button" id="quarto-back-to-top">.*?</a>',
                  t[i:j], re.S)
    t = t[:i] + kepala + "\n" + konten + "\n" + (m.group(0) if m else "") + t[j:]
    toc_html = ('<nav id="TOC" role="doc-toc" aria-labelledby="toc-title" class="toc-active">'
                '<h2 id="toc-title">Pada halaman ini</h2><ul class="collapse">' +
                "".join(f'<li><a href="#{g}" id="toc-{g}" class="nav-link" data-scroll-target="#{g}">{esc(n)}</a></li>'
                        for g, n in toc) + "</ul></nav>")
    t, ok = ganti_blok(t, '<nav id="TOC"', "nav", toc_html)
    if not ok:
        t = t.replace('<div id="quarto-margin-sidebar" class="sidebar margin-sidebar">',
                      '<div id="quarto-margin-sidebar" class="sidebar margin-sidebar">' + toc_html, 1)
    t, _ = ganti_blok(t, '<nav class="quarto-page-breadcrumbs" aria-label="Jalur">', "nav",
                      '<nav class="quarto-page-breadcrumbs" aria-label="Jalur"><ol class="breadcrumb"><li class="breadcrumb-item">'
                      '<a href="./daftar-isi.html">Daftar Isi</a></li></ol></nav>')
    return t


# ------------------------------------------------------------------ penataan per halaman
def kelas_body(t, jalur, gid):
    nama = "sampul" if jalur == "index.html" else re.sub(r"[^a-z0-9]+", "-", jalur[:-5].lower()).strip("-")
    tambah = [f"irbi-hal-{nama}"] + ([f"irbi-bagian-{gid}"] if gid else [])
    if 'class="irbi-judul-ekstra' in t:
        tambah.append("irbi-ada-judul-ekstra")

    def ganti(m):
        lama = [k for k in m.group(1).split() if not k.startswith(("irbi-hal-", "irbi-bagian-", "irbi-ada-"))]
        return f'<body class="{" ".join(lama + tambah)}"'
    return re.sub(r'<body class="([^"]*)"', ganti, t, count=1)


def pindah_judul_ekstra(t):
    m = re.search(r'<div class="irbi-judul-ekstra".*?<!--/irbi-judul-ekstra-->', t, re.S)
    if not m:
        return t
    i = t.find('<header id="title-block-header"')
    if i < 0 or i < m.start() and t.find("</header>", i) > m.start():
        return t  # sudah di dalam blok judul
    potong = m.group(0)
    t = t[:m.start()] + t[m.end():]
    j = t.find("</header>", i)
    t = t[:j] + potong + "\n" + t[j:]
    t = t.replace('<header id="title-block-header" class="quarto-title-block default"',
                  '<header id="title-block-header" class="quarto-title-block default irbi-judul-plus"', 1)
    # lambang yang terpasang sebagai gambar di awal isi sudah tampil di blok judul
    return re.sub(r'<p>(?:<a [^>]*>)?<img [^>]*class="irbi-lambang[^"]*"[^>]*>(?:</a>)?</p>\s*', "", t, count=1)


def navbar_aktif(t, jalur):
    """Quarto menandai tautan bilah atas pertama di folder yang sama sebagai aktif; tandai hanya halaman yang benar."""
    i = t.find('<header id="quarto-header"')
    if i < 0:
        return t
    a, b = blok(t, i, "header")

    def ganti(m):
        href = m.group(2)
        cocok = not href.startswith(("http:", "https:", "#")) and ke_akar(jalur, href) == jalur
        return f'<a class="nav-link{" active" if cocok else ""}" href="{href}"' + (' aria-current="page"' if cocok else "")
    return t[:a] + re.sub(r'<a class="nav-link( active)?" href="([^"]*)"(?: aria-current="page")?', ganti, t[a:b]) + t[b:]


def tata(t, jalur, grup, datar):
    gid = next((g["id"] for g in grup if any(it["jalur"] == jalur for it in g["item"])), None)
    t = navbar_aktif(t, jalur)
    t, _ = ganti_blok(t, '<div class="sidebar-menu-container', "div", nav_html(jalur, grup))
    t, _ = ganti_blok(t, '<div class="pt-lg-2 mt-2 text-left sidebar-header', "div", "")
    t = kelas_body(t, jalur, gid)
    pager, sblm, brkt = pager_html(jalur, datar)
    if pager:
        t, ok = ganti_blok(t, '<nav class="page-navigation', "nav", pager)
        t = re.sub(r'<link href="[^"]*" rel="(?:prev|next)">\n?', "", t)
        tautan = "".join(f'<link href="{relatif(jalur, x["jalur"])}" rel="{r}">\n' for r, x in (("prev", sblm), ("next", brkt)) if x)
        t = t.replace('<meta name="quarto:offset"', tautan + '<meta name="quarto:offset"', 1)
    # bilah kanan: blok "Navigasi" di bawah "Pada halaman ini"
    t = re.sub(r'<div class="irbi-toc-nav">.*?</div>', "", t, flags=re.S)
    i = t.find('<div id="quarto-margin-sidebar"')
    if i >= 0:
        a, b = blok(t, i, "div")
        nav = (f'<div class="irbi-toc-nav"><strong>Navigasi</strong><a href="#">Kembali ke atas ↑</a>'
               f'<a href="{relatif(jalur, "daftar-isi.html")}">Daftar isi</a></div>')
        t = t[:b - 6] + nav + t[b - 6:]
    t = re.sub(r'<footer class="irbi-kredit">.*?</footer>', "", t, flags=re.S)
    kredit = kredit_html(jalur)
    if kredit:
        k = t.find('<a onclick="window.scrollTo(0, 0); return false;" role="button" id="quarto-back-to-top">')
        if k < 0:
            k = t.find("</main>")
        if k >= 0:
            t = t[:k] + kredit + t[k:]
    return pindah_judul_ekstra(t)


def main():
    if not KELUARAN.is_dir():
        print(f"pasca_render: folder keluaran {KELUARAN} tidak ada, dilewati", file=sys.stderr)
        return
    berkas = sorted(p for p in KELUARAN.rglob("*.html") if "site_libs" not in p.relative_to(KELUARAN).parts)
    teks = {p.relative_to(KELUARAN).as_posix(): p.read_text(encoding="utf-8") for p in berkas}
    bab = []
    for jalur in ["index.html"] + sorted(teks):
        if jalur in teks:
            bab = ambil_bab(teks[jalur], jalur)
            if bab:
                break
    if not bab:
        print("pasca_render: bilah sisi buku tidak ditemukan, dilewati", file=sys.stderr)
        return
    if "index.html" in teks:
        teks["daftar-isi.html"] = buat_daftar_isi(teks["index.html"], bab)
    grup = susun(bab)
    datar = [it for g in grup for it in g["item"]]
    for jalur, t in teks.items():
        if '<div class="sidebar-menu-container' not in t:
            continue  # bukan halaman buku (mis. berkas HTML lepas)
        baru = tata(t, jalur, grup, datar)
        (KELUARAN / jalur).write_text(baru, encoding="utf-8")
    print(f"pasca_render: {len(datar)} halaman di {len(grup)} kelompok navigasi; daftar-isi.html dibuat")


if __name__ == "__main__":
    main()
