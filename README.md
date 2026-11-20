# IRBI 2025 — Edisi Digital Interaktif (Quarto)

Konversi *BUKU IRBI 2025.pdf* menjadi buku digital dengan [Quarto](https://quarto.org) 1.11:

- **Tampilan buku digital:** bilah atas berlambang IR/BI dengan kotak cari, isi buku berkelompok di bilah kiri
  (seperti buku cetak), halaman berbentuk kertas dengan blok judul bab, paragraf serif berkolom dengan huruf
  awal besar, panel "Pada halaman ini", tombol *Sebelumnya*/*Berikutnya*, halaman Sampul (sampul asli),
  Daftar Isi bernomor halaman cetak, dan Tim Redaksi. Mode terang/gelap, mode baca, grafik interaktif, dan
  kartu ringkasan tetap ada. Navigasi disusun `scripts/pasca_render.py`, kolom teks oleh
  `assets/lua/kolom-teks.lua`; keduanya hanya mengubah HTML, PDF buku tidak berubah.
- **Jelajah Data** (`jelajah.qmd`): filter menurut indeks (multi-bahaya + 11 ancaman), provinsi, kelas
  risiko, rentang skor, dan nama. Filter tersebut menyaring peta Leaflet, tabel, KPI, grafik, dan profil
  wilayah secara bersamaan, dan statusnya tersimpan di URL sehingga bisa dibagikan. Komponen yang sama
  dipakai di halaman hasil, provinsi, dan ancaman.
- **PDF sesuai filter:** dibuat langsung di peramban (jsPDF + svg2pdf.js + jspdf-autotable). Isinya peta
  vektor berketerangan (legenda, skala, arah utara, inset lokasi), ringkasan filter dan statistik,
  klasifikasi kelas, parameter, serta tabel data lengkap (skor dan kelas semua indeks).
- **Laporan lengkap seperti buku** (`assets/js/irbi-laporan.js`): PDF A4 sesuai filter, berisi sampul, daftar
  isi, ringkasan dengan narasi yang dihitung dari data, pendahuluan dan metodologi buku, peta, grafik, profil
  provinsi dan kabupaten/kota, penutup, serta lampiran. Teks buku diekstrak oleh `scripts/bangun.py` ke
  `assets/data/irbi-teks.js`, jadi laporan otomatis mengikuti teks dan data edisi yang sedang dibangun.
- **Studio** (`studio.qmd` + panel di setiap halaman): ubah **data**, **tampilan**, dan **teks** langsung di
  aplikasi, tanpa mengedit kode dan tanpa server. Perubahan bisa diekspor/impor sebagai paket JSON atau
  diterbitkan untuk semua pembaca lewat `assets/kustom/irbi-kustom.js`.
- **PDF buku lengkap** (`_book/IRBI-2025.pdf`, Typst) dan **51 peta baku** (`peta/pdf/`).

## Menjalankan

```bash
cd app
./jalankan.sh preview   # pratinjau langsung, diperbarui otomatis
./jalankan.sh render    # bangun semua ke _book/
```

`jalankan.sh` memakai Quarto sistem bila ada; bila tidak, memakai salinan portabel di `.tools/quarto`.
Folder `.tools/` tidak ikut repositori, jadi setelah *clone* pasang [Quarto](https://quarto.org/docs/get-started/)
1.11 atau lebih baru (Typst sudah termasuk). Prasyarat lain hanya Python 3.9 atau lebih baru (tanpa paket
tambahan). Hasil di `_book/` bisa dibuka langsung (`_book/index.html`, tanpa server) atau diunggah ke
hosting statis.

## Mengedit

**Tanpa kode:** gunakan Studio (tombol di pojok kanan bawah).

| Studio | Fungsi |
|---|---|
| Tampilan | pratinjau langsung; gaya baca siap pakai (Seperti buku, Nyaman dibaca, Kontras tinggi, Ringkas, Klasik); tema & warna (kode hex, cek kontras, acak/aksen serasi); palet kelas (termasuk ramah buta warna); nuansa kertas (putih, krem, sepia), spasi baris, kolom, perataan, kontras teks, huruf awal besar; huruf judul/paragraf/antarmuka & ukuran teks; kepala berwarna, kepadatan, sudut, animasi; mode gelap; peta dasar. Setiap perubahan bisa diurungkan (Ctrl/⌘+Z), dibandingkan dengan bawaan (tahan **Bandingkan**), disimpan sebagai *gaya saya*, atau diekspor/impor sebagai berkas tampilan |
| Teks | mode edit langsung: klik paragraf atau judul di halaman mana pun |
| Data | lembar kerja skor & ambang (edit sel, tempel dari Excel, urungkan/ulangi, impor/ekspor CSV) |
| Simpan | ekspor/impor paket `.json`, atau terbitkan `irbi-kustom.js` untuk semua pembaca |

Lapisan data: data buku → paket terbit (`assets/kustom/irbi-kustom.js`) → kustomisasi lokal peramban.
Untuk memasukkan paket ke sumber (agar PDF buku ikut berubah):
`python3 scripts/terapkan_kustom.py paket.json` (tambahkan `--coba` untuk pratinjau), lalu render.

**Lewat sumber:**

| Yang diubah | Berkas |
|---|---|
| Teks bab | `*.qmd`, `provinsi/*.qmd`, `ancaman/*.qmd` |
| Angka, kelas, ambang | `data/irbi_kabkota.csv`, `irbi_provinsi.csv`, `irbi_ancaman.csv`, `jenis_indeks.csv` |
| Warna (termasuk kelas risiko), huruf, logo | `_brand.yml` |
| Daftar bab & navigasi | `_quarto.yml` |
| Gaya web | `assets/css/irbi.scss` (variabel desain), `irbi-gelap.scss` |
| Perilaku web | `assets/js/irbi-*.js` (inti, peta, jelajah, grafik, pdf, studio, editor, statis) |
| Kelompok navigasi, Daftar Isi, nomor halaman cetak | `scripts/pasca_render.py` (`GRUP`, `HAL_BUKU`) |
| Paragraf berkolom (HTML) | `assets/lua/kolom-teks.lua`; nonaktifkan per halaman dengan `irbi-kolom: false` |
| Tampilan PDF | `assets/typst/irbi.typ`, `typst-show.typ`, `scripts/templat_peta.typ` |

`_gen/`, `peta/`, dan `assets/data/` dibuat ulang otomatis oleh `scripts/bangun.py` setiap kali render,
termasuk sidik versi aset di `assets/html/kepala.html` agar peramban tidak memakai berkas lama, jadi jangan
diedit manual. `_gen/` tetap disimpan di repositori karena Quarto membaca berkas *include* sebelum skrip
pre-render berjalan (tanpanya clone baru gagal dirender); `peta/`, `assets/data/`, dan `_book/` tidak
disimpan (lihat `.gitignore`).

## Sumber & lisensi pihak ketiga

- Teks, tabel, dan nilai: *BUKU IRBI 2025.pdf* (BNPB). Skrip konversi sekali pakai ada di `scripts/ekstraksi/`.
- Batas wilayah: [cahyadsn/wilayah_boundaries](https://github.com/cahyadsn/wilayah_boundaries) (MIT),
  sesuai Kepmendagri No. 300.2.2-2430 Tahun 2025.
- Leaflet 1.9.4 (BSD-2), jsPDF 4.2.1, svg2pdf.js 2.8.1, dan jspdf-autotable 5.0.8 (MIT) disertakan di
  `assets/vendor/`. Lisensi dan versinya ada di masing-masing folder; integritas paket npm sudah diverifikasi.
- Folder `_work/` dan `.venv/` hanya berkas kerja proses konversi, tidak ikut repositori, dan aman dihapus.
