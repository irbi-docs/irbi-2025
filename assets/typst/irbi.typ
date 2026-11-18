// Fungsi bantu Typst untuk versi PDF buku IRBI 2025.
// Dipanggil dari potongan yang dibuat scripts/bangun.py (_gen/*.md).

#let irbi-warna = (
  TINGGI: rgb("#E5242A"),
  SEDANG: rgb("#FFE433"),
  RENDAH: rgb("#2EAD4B"),
)
#let irbi-teal = rgb("#0B3C49")
#let irbi-emas = rgb("#A68B5B")
#let irbi-abu = rgb("#55656D")

#show figure.where(kind: table): set figure.caption(position: top)
#show figure.where(kind: table): set block(breakable: true)

#let irbi-tabel(
  judul: none,
  lebar: auto,
  rata: auto,
  ukuran: 8.5pt,
  kepala: (),
  kelas-kolom: none,
  baris: (),
) = figure(
  kind: table,
  caption: judul,
  {
    set text(size: ukuran)
    set par(justify: false)
    table(
      columns: lebar,
      align: rata,
      stroke: 0.4pt + rgb("#B8C7CD"),
      inset: (x: 5pt, y: 3pt),
      fill: (x, y) => if y == 0 { irbi-teal } else if calc.even(y) { rgb("#EEF3F5") } else { white },
      table.header(..kepala.map(k => text(fill: white, weight: "bold", k))),
      ..baris
        .map(b => b
          .enumerate()
          .map(((i, v)) => {
            if kelas-kolom != none and i == kelas-kolom {
              table.cell(
                fill: irbi-warna.at(v, default: white),
                text(weight: "bold", fill: if v == "SEDANG" { black } else { white }, v),
              )
            } else { v }
          }))
        .flatten(),
    )
  },
)

#let irbi-kartu(items) = block(width: 100%, breakable: false, grid(
  columns: (1fr,) * calc.min(items.len(), 3),
  gutter: 6pt,
  ..items.map(((lbl, nilai, sub, kelas)) => {
    let c = irbi-warna.at(kelas, default: irbi-teal)
    block(
      width: 100%,
      inset: (x: 8pt, y: 7pt),
      radius: 3pt,
      fill: rgb("#F6F8F9"),
      stroke: (left: 3.5pt + c, rest: 0.5pt + rgb("#C9D3D7")),
      {
        set par(justify: false, leading: 0.45em)
        text(size: 7pt, fill: irbi-abu, weight: "bold", upper(lbl))
        linebreak()
        text(size: 15pt, weight: "bold", fill: irbi-teal, nilai)
        linebreak()
        text(size: 7.5pt, fill: irbi-abu, sub)
      },
    )
  }),
))
