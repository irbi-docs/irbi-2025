--[[ kolom-teks.lua: hanya berlaku untuk HTML (PDF Typst tidak berubah).

Paragraf dan daftar yang berurutan dikelompokkan menjadi <div class="irbi-teks">, sehingga CSS dapat menatanya
dalam kolom seperti halaman buku cetak. Komponen lain (foto, rumus, tabel, peta, kartu, callout, kode) memutus
kelompok dan tetap selebar halaman. Kelompok teks pertama di halaman diberi kelas irbi-awal (huruf awal besar).

Kelompok yang terlalu pendek dibiarkan satu kolom. Nonaktifkan per halaman dengan `irbi-kolom: false` di front
matter. Pembaca juga bisa memilih satu kolom lewat Studio › Tampilan.
]]

local MIN_HURUF = 520

local function hanya_gambar_atau_rumus(para)
  for _, el in ipairs(para.content) do
    if el.t == 'Image' then return true end
    if el.t == 'Math' and el.mathtype == 'DisplayMath' then return true end
  end
  return false
end

local function prosa(b)
  if b.t == 'Para' then return not hanya_gambar_atau_rumus(b) end
  return b.t == 'BulletList' or b.t == 'OrderedList' or b.t == 'LineBlock'
end

-- Div yang isinya boleh ditata ulang (pembungkus format), bukan komponen seperti callout atau sel kode.
local function pembungkus(div)
  for _, c in ipairs(div.classes) do
    if c ~= 'content-visible' and c ~= 'content-hidden' then return false end
  end
  return true
end

local function panjang(blocks)
  local n = 0
  for _, b in ipairs(blocks) do n = n + #pandoc.utils.stringify(b) end
  return n
end

local kelompokkan

kelompokkan = function(blocks, st)
  local hasil, run = pandoc.List(), pandoc.List()
  local function tutup()
    if #run == 0 then return end
    if panjang(run) >= MIN_HURUF then
      local kelas = { 'irbi-teks' }
      if not st.awal and run[1].t == 'Para' and pandoc.utils.stringify(run[1]):match('^%u') then
        table.insert(kelas, 'irbi-awal')
      end
      hasil:insert(pandoc.Div(run, pandoc.Attr('', kelas)))
    else
      hasil:extend(run)
    end
    st.awal = true
    run = pandoc.List()
  end
  for _, b in ipairs(blocks) do
    if prosa(b) then
      run:insert(b)
    else
      tutup()
      if b.t == 'Div' and pembungkus(b) then
        b.content = kelompokkan(b.content, st)
      end
      hasil:insert(b)
    end
  end
  tutup()
  return hasil
end

function Pandoc(doc)
  if not quarto.doc.is_format('html') then return nil end
  local opsi = doc.meta['irbi-kolom']
  if opsi == false or (opsi ~= nil and pandoc.utils.stringify(opsi) == 'false') then return nil end
  doc.blocks = kelompokkan(doc.blocks, { awal = false })
  return doc
end
