// Templat PDF satu halaman untuk setiap peta (A4 lanskap).
// Dikompilasi oleh scripts/bangun.py:
//   quarto typst compile scripts/templat_peta.typ keluaran.pdf --root . --input id=<id-peta>
// Isi diambil dari peta/meta/<id>.json dan gambar peta dari peta/svg/<id>.svg.

#let id = sys.inputs.at("id")
#let m = json("/peta/meta/" + id + ".json")
#let warna = (TINGGI: rgb("#E5242A"), SEDANG: rgb("#FFE433"), RENDAH: rgb("#2EAD4B"))
#let teal = rgb("#0B3C49")
#let emas = rgb("#A68B5B")
#let abu = rgb("#55656D")

#set document(title: m.judul, author: "Badan Nasional Penanggulangan Bencana (BNPB)")
#set page(paper: "a4", flipped: true, margin: (x: 9mm, top: 8mm, bottom: 8mm))
#set text(font: ("Arial", "Helvetica", "Libertinus Serif"), size: 7.5pt, lang: "id")
#set par(justify: false, leading: 0.5em)

#let sel-kelas(v) = table.cell(
  fill: warna.at(v, default: white),
  text(weight: "bold", fill: if v == "SEDANG" { black } else { white }, v),
)

// ---------- kepala
#block(width: 100%, fill: teal, inset: (x: 9pt, y: 6pt), radius: 3pt, grid(
  columns: (auto, 1fr, auto),
  gutter: 10pt,
  align: horizon,
  box(fill: white, radius: 3pt, inset: 3pt, image("/assets/img/logo-bnpb.png", height: 12mm)),
  [
    #text(fill: white, size: 15pt, weight: "bold", upper(m.judul)) \
    #text(fill: rgb("#D3E2E7"), size: 8.5pt, m.subjudul)
  ],
  align(right, text(fill: rgb("#D3E2E7"), size: 7.5pt)[Badan Nasional\ Penanggulangan Bencana]),
))
#v(4pt)

#let n = m.tabel.len()
#let uk = if n > 30 { 6.3pt } else if n > 20 { 6.8pt } else { 7.5pt }
#let iy = if n > 30 { 1.6pt } else { 2.4pt }

#grid(
  columns: (1fr, 78mm),
  gutter: 7pt,
  // ---------- kolom kiri: peta + keterangan tambahan
  [
    #block(stroke: 0.6pt + rgb("#B8C7CD"), inset: 2pt, image("/peta/svg/" + id + ".svg", width: 100%))
    #v(3pt)
    #grid(
      columns: (auto, 1fr),
      gutter: 9pt,
      [
        #text(weight: "bold", fill: teal)[Klasifikasi Kelas Risiko]
        #v(-2pt)
        #if m.klasifikasi.all(((k, r)) => r == "") {
          table(
            columns: (auto,),
            inset: (x: 5pt, y: 2.2pt),
            stroke: 0.4pt + rgb("#B8C7CD"),
            ..m.klasifikasi.map(((k, r)) => sel-kelas(k)),
          )
          text(size: 6.5pt, fill: abu)[Kelas mengikuti tabel per ancaman di buku IRBI 2025.]
        } else {
          table(
            columns: (auto, auto),
            inset: (x: 5pt, y: 2.2pt),
            stroke: 0.4pt + rgb("#B8C7CD"),
            table.header(text(weight: "bold")[Kelas], text(weight: "bold")[Rentang skor]),
            ..m.klasifikasi.map(((k, r)) => (sel-kelas(k), r)).flatten(),
          )
        }
      ],
      [
        #text(weight: "bold", fill: teal)[Parameter yang digunakan dalam penyusunan IRB #m.at("tahun", default: "2025"):]
        #v(-2pt)
        #enum(..m.parameter.map(p => [#p]), spacing: 2pt)
        #v(1pt)
        #text(size: 6.5pt, fill: abu, m.sumber)
      ],
    )
  ],
  // ---------- kolom kanan: sorotan + tabel
  [
    #block(
      width: 100%,
      fill: rgb("#F6F8F9"),
      stroke: (left: 4pt + warna.at(m.sorotan.kelas, default: emas), rest: 0.5pt + rgb("#C9D3D7")),
      inset: 7pt,
      radius: 3pt,
      [
        #text(size: 7pt, fill: abu, weight: "bold", upper(m.sorotan.label)) \
        #text(size: 17pt, weight: "bold", fill: teal, m.sorotan.nilai)
        #if m.sorotan.kelas != "" { text(size: 10pt, weight: "bold", fill: abu)[ (#m.sorotan.kelas)] }
      ],
    )
    #v(2pt)
    #align(center, text(weight: "bold", size: 8.5pt, fill: teal, m.tabel_judul))
    #v(-3pt)
    #set text(size: uk)
    #table(
      columns: (auto, 1fr, auto, auto),
      align: (center, left, right, center),
      inset: (x: 3.5pt, y: iy),
      stroke: 0.35pt + rgb("#B8C7CD"),
      fill: (x, y) => if y == 0 { teal } else if calc.even(y) { rgb("#EEF3F5") } else { white },
      table.header(..("No", "Wilayah", "Skor", "Kelas").map(h => text(fill: white, weight: "bold", h))),
      ..m.tabel.map(((no, nama, skor, kelas)) => (no, nama, skor, sel-kelas(kelas))).flatten(),
    )
  ],
)
