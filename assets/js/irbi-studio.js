/* IRBI 2025 — Studio: ubah tampilan, teks, dan data langsung di aplikasi (tanpa server/basis data).
 * Perubahan disimpan di peramban (localStorage) dan dapat diekspor/diimpor sebagai paket JSON, atau
 * diterbitkan untuk semua pembaca sebagai berkas assets/kustom/irbi-kustom.js.
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.studio) return;
  var S = I.kustom;

  var BAWAAN = { primer: '#153B30', aksen: '#C47A36', kelas: { TINGGI: '#E5242A', SEDANG: '#FFE433', RENDAH: '#2EAD4B' },
    fontJudul: 'Instrument Sans', fontIsi: 'Georgia', ukuran: 16, radius: 12, kepadatan: 'lega', kolom: 'buku',
    peta: { dasar: 'otomatis', opasitas: 0.82, label: true, batas: true }, animasi: true };
  var TEMA = [
    { id: 'buku', nama: 'Buku', primer: '#153B30', aksen: '#C47A36' },
    { id: 'bnpb', nama: 'BNPB', primer: '#0B3C49', aksen: '#A68B5B' },
    { id: 'samudra', nama: 'Samudra', primer: '#0B4F8A', aksen: '#1FA2C7' },
    { id: 'hutan', nama: 'Hutan', primer: '#1E4D3A', aksen: '#B08D57' },
    { id: 'senja', nama: 'Senja', primer: '#6B2D5C', aksen: '#E07A3F' },
    { id: 'grafit', nama: 'Grafit', primer: '#2B2F36', aksen: '#8C9BAB' },
    { id: 'siaga', nama: 'Siaga', primer: '#7A1F1F', aksen: '#D4A017' }
  ];
  var PALET = [
    { id: 'bnpb', nama: 'Standar BNPB', TINGGI: '#E5242A', SEDANG: '#FFE433', RENDAH: '#2EAD4B' },
    { id: 'ramah', nama: 'Ramah buta warna', TINGGI: '#D55E00', SEDANG: '#F0E442', RENDAH: '#0072B2' },
    { id: 'lembut', nama: 'Lembut', TINGGI: '#E76F51', SEDANG: '#F4D35E', RENDAH: '#6BBF8A' },
    { id: 'tegas', nama: 'Kontras tinggi', TINGGI: '#B00020', SEDANG: '#F2C200', RENDAH: '#007A33' }
  ];

  function nilaiT(jalur) {
    var b = BAWAAN;
    jalur.split('.').forEach(function (k) { b = b && b[k]; });
    return I.tampilan.nilai(jalur, b);
  }
  /** Simpan satu nilai tampilan; nilai sama dengan bawaan → dihapus agar paket tetap ringkas. */
  function aturT(jalur, nilai) {
    var b = BAWAAN;
    jalur.split('.').forEach(function (k) { b = b && b[k]; });
    S.ubah('tampilan', function (l) {
      var o = l.tampilan, ks = jalur.split('.');
      for (var i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
      var akhir = ks[ks.length - 1];
      if (nilai === b || (typeof b === 'string' && String(nilai).toLowerCase() === b.toLowerCase())) delete o[akhir];
      else o[akhir] = nilai;
      if (ks.length > 1 && !Object.keys(l.tampilan[ks[0]] || {}).length) delete l.tampilan[ks[0]];
    });
  }

  // ================================================================== impor CSV (dipakai Studio & Studio Data)
  function imporCSV(teks) {
    var rows = I.parseCSV(teks);
    if (!rows.length) throw new Error('Berkas CSV kosong atau tidak terbaca.');
    var kol = Object.keys(rows[0]);
    var punya = function (k) { return kol.indexOf(k) >= 0; };
    var D = I.D, ubah = [];
    var catat = function (indeks, kode, nilai) {
      var v = I.angka(nilai);
      if (isNaN(v)) return;
      var a = I.nilai(indeks, kode);
      if (!a) return;
      if (Math.abs(a.skor - v) > 1e-9) ubah.push({ indeks: indeks, kode: kode, dari: a.skor, ke: v, asli: a.asli.skor });
    };
    var ambang = [];
    if (punya('slug') && punya('batas_sedang') && punya('batas_tinggi')) {
      rows.forEach(function (r) {
        var j = D.idx.jenis[r.slug];
        if (!j) return;
        var s = I.angka(r.batas_sedang), t = I.angka(r.batas_tinggi);
        var e = I.jenis(r.slug);
        if (!isNaN(s) && !isNaN(t) && (Math.abs(s - e.batas_sedang) > 1e-9 || Math.abs(t - e.batas_tinggi) > 1e-9)) ambang.push({ slug: r.slug, batas_sedang: s, batas_tinggi: t });
      });
    } else if (punya('ancaman') && punya('kode') && punya('skor')) {
      rows.forEach(function (r) { if (D.ancaman[r.ancaman]) catat(r.ancaman, r.kode, r.skor); });
    } else if (punya('kode') && (punya('irbi_2025') || punya('skor')) && rows.every(function (r) { return /^\d{2}$/.test(r.kode); })) {
      rows.forEach(function (r) { catat('provinsi', r.kode, punya('irbi_2025') ? r.irbi_2025 : r.skor); });
    } else if (punya('kode') && kol.some(function (k) { return /_skor$/.test(k); })) {
      rows.forEach(function (r) {
        D.jenis.forEach(function (j) { if (punya(j.slug + '_skor') && r[j.slug + '_skor'] !== '') catat(j.slug, r.kode, r[j.slug + '_skor']); });
      });
    } else if (punya('kode') && punya('skor')) {
      rows.forEach(function (r) { catat('irbi', r.kode, r.skor); });
    } else {
      throw new Error('Kolom CSV tidak dikenali. Gunakan format berkas data/ (kode, skor, …), CSV dari Jelajah Data, atau jenis_indeks.csv.');
    }
    return { ubah: ubah, ambang: ambang, baris: rows.length };
  }
  function terapkanImpor(hasil) {
    S.ubah('data', function (l) {
      hasil.ubah.forEach(function (u) {
        var wadah = u.indeks === 'provinsi' ? l.data.provinsi : u.indeks === 'irbi' ? l.data.kabkota : (l.data.ancaman[u.indeks] = l.data.ancaman[u.indeks] || {});
        wadah[u.kode] = Math.abs(u.ke - u.asli) < 1e-9 ? null : u.ke;
      });
      hasil.ambang.forEach(function (a) { l.data.ambang[a.slug] = { batas_sedang: a.batas_sedang, batas_tinggi: a.batas_tinggi }; });
    });
  }
  function ringkasImpor(h) {
    var per = {};
    h.ubah.forEach(function (u) { per[u.indeks] = (per[u.indeks] || 0) + 1; });
    var bag = Object.keys(per).map(function (k) { return per[k] + ' ' + (k === 'provinsi' ? 'nilai provinsi' : I.namaIndeks(k, true).toLowerCase()); });
    if (h.ambang.length) bag.push(h.ambang.length + ' ambang kelas');
    return bag.join(', ');
  }
  function pilihBerkas(terima, fn) {
    var inp = I.el('input', { type: 'file', accept: terima, style: 'display:none' });
    inp.addEventListener('change', function () { if (inp.files[0]) fn(inp.files[0]); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  }
  function alurImporCSV(file) {
    return I.bacaBerkas(file).then(function (teks) {
      var h = imporCSV(teks);
      if (!h.ubah.length && !h.ambang.length) { I.toast('Tidak ada nilai yang berbeda dari data saat ini (' + h.baris + ' baris dibaca).', 'info', 5000); return false; }
      if (!confirm('Impor "' + file.name + '": ' + ringkasImpor(h) + ' akan diubah. Lanjutkan?')) return false;
      terapkanImpor(h);
      I.toast('Impor selesai: ' + I.esc(ringkasImpor(h)) + '.', 'sukses', 5000);
      return true;
    }).catch(function (e) { I.toast('Impor gagal: ' + I.esc(e.message), 'galat', 7000); return false; });
  }

  // ================================================================== paket (ekspor/impor/terbit)
  function tanggalBerkas() { var d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function eksporPaket() {
    I.unduh(JSON.stringify(S.paket(), null, 2), 'irbi-kustom-' + tanggalBerkas() + '.json', 'application/json');
    I.toast('Paket kustomisasi diekspor.', 'sukses');
  }
  function imporPaket() {
    pilihBerkas('.json,application/json', function (file) {
      I.bacaBerkas(file).then(function (teks) {
        var o = JSON.parse(teks);
        if (!o || (o.format && o.format !== 'irbi-kustom') || (!o.data && !o.tampilan && !o.teks)) throw new Error('Bukan paket kustomisasi IRBI.');
        var n = S.jumlah({ data: Object.assign({ kabkota: {}, provinsi: {}, ancaman: {}, ambang: {} }, o.data || {}), tampilan: o.tampilan || {}, teks: o.teks || {} });
        if (!confirm('Impor paket "' + file.name + '" (' + n.data + ' perubahan data, ' + n.tampilan + ' pengaturan tampilan, ' + n.teks + ' perubahan teks)? Kustomisasi lokal saat ini akan diganti.')) return;
        S.ganti(o);
        I.toast('Paket diimpor dan diterapkan.', 'sukses');
      }).catch(function (e) { I.toast('Impor paket gagal: ' + I.esc(e.message), 'galat', 7000); });
    });
  }
  function terbitkan() {
    var p = S.paket();
    var js = '/* Paket kustomisasi IRBI 2025 — dibuat oleh Studio ' + new Date().toISOString() + '.\n' +
      ' * Letakkan berkas ini di folder assets/kustom/ situs (mis. _book/assets/kustom/irbi-kustom.js)\n' +
      ' * agar perubahan berlaku untuk semua pembaca, tanpa server. Hapus berkas untuk membatalkan. */\n' +
      'window.IRBI_KUSTOM_TERBIT = ' + JSON.stringify(p) + ';\n';
    I.unduh(js, 'irbi-kustom.js', 'text/javascript;charset=utf-8');
    I.toast('Berkas <b>irbi-kustom.js</b> diunduh. Salin ke folder <code>assets/kustom/</code> situs Anda.', 'sukses', 8000);
  }

  // ================================================================== panel
  var panel = null;
  function bangunPanel() {
    panel = I.el('div', { class: 'irbi-studio', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'irbi-studio-judul', tabindex: '-1' });
    panel.innerHTML =
      '<header class="irbi-studio-kepala"><div><h2 id="irbi-studio-judul"><i class="bi bi-palette2"></i> Studio</h2>' +
      '<p>Ubah tampilan, teks, dan data langsung di aplikasi. Tersimpan otomatis di peramban ini.</p></div>' +
      '<button type="button" class="irbi-studio-tutup" aria-label="Tutup Studio"><i class="bi bi-x-lg"></i></button></header>' +
      '<nav class="irbi-tab irbi-studio-tab" role="tablist">' +
      '<button type="button" role="tab" data-tab="tampilan"><i class="bi bi-brush"></i> Tampilan</button>' +
      '<button type="button" role="tab" data-tab="teks"><i class="bi bi-type"></i> Teks</button>' +
      '<button type="button" role="tab" data-tab="data"><i class="bi bi-table"></i> Data</button>' +
      '<button type="button" role="tab" data-tab="simpan"><i class="bi bi-share"></i> Simpan</button></nav>' +
      '<div class="irbi-studio-badan"></div>';
    document.body.appendChild(panel);
    var latar = I.el('div', { class: 'irbi-studio-latar' });
    latar.addEventListener('click', tutup);
    document.body.appendChild(latar);
    panel.querySelector('.irbi-studio-tutup').addEventListener('click', tutup);
    panel.querySelectorAll('[role=tab]').forEach(function (b) { b.addEventListener('click', function () { tampilTab(b.dataset.tab); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('terbuka')) tutup(); });
    document.addEventListener('irbi:kustom', function () { if (panel.classList.contains('terbuka') && !panel.contains(document.activeElement)) tampilTab(panel.dataset.tab, true); });
    document.addEventListener('irbi:mode-edit', function () { if (panel.dataset.tab === 'teks') tampilTab('teks', true); });
  }
  function buka(tab) {
    if (!panel) bangunPanel();
    tampilTab(tab || panel.dataset.tab || 'tampilan');
    panel.classList.add('terbuka');
    document.documentElement.classList.add('irbi-studio-terbuka');
    setTimeout(function () { panel.focus(); }, 30);
  }
  function tutup() {
    if (!panel) return;
    panel.classList.remove('terbuka');
    document.documentElement.classList.remove('irbi-studio-terbuka');
    var fab = document.querySelector('.irbi-studio-fab');
    if (fab) fab.focus();
  }
  function tampilTab(tab, diam) {
    panel.dataset.tab = tab;
    panel.querySelectorAll('[role=tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'); });
    var badan = panel.querySelector('.irbi-studio-badan');
    var gulir = badan.scrollTop;
    badan.innerHTML = '';
    ({ tampilan: tabTampilan, teks: tabTeks, data: tabData, simpan: tabSimpan })[tab](badan);
    if (diam) badan.scrollTop = gulir;
  }

  // ------------------------------------------------------------------ tab Tampilan
  function bagian(judul, isi, ket) {
    var s = I.el('section', { class: 'irbi-st-bagian' });
    s.appendChild(I.el('h3', {}, judul));
    if (ket) s.appendChild(I.el('p', { class: 'irbi-st-ket' }, ket));
    s.appendChild(isi);
    return s;
  }
  function segmen(pilihan, aktif, fn) {
    var g = I.el('div', { class: 'irbi-segmen', role: 'group' });
    pilihan.forEach(function (p) {
      var b = I.el('button', { type: 'button', class: p[0] === aktif ? 'aktif' : '', 'aria-pressed': p[0] === aktif ? 'true' : 'false' }, p[1]);
      b.addEventListener('click', function () { fn(p[0]); });
      g.appendChild(b);
    });
    return g;
  }
  function sakelar(label, nyala, fn) {
    var l = I.el('label', { class: 'irbi-sakelar' });
    var c = I.el('input', { type: 'checkbox' });
    c.checked = !!nyala;
    c.addEventListener('change', function () { fn(c.checked); });
    l.appendChild(c); l.appendChild(I.el('span')); l.appendChild(document.createTextNode(label));
    return l;
  }
  function inputWarna(label, nilai, fn) {
    var l = I.el('label', { class: 'irbi-st-warna' });
    var c = I.el('input', { type: 'color', value: nilai });
    c.addEventListener('input', I.tunda(function () { fn(c.value); }, 120));
    l.appendChild(c);
    l.appendChild(I.el('span', { text: label }));
    return l;
  }
  function geser(label, min, maks, langkah, nilai, satuan, fn) {
    var w = I.el('label', { class: 'irbi-st-geser' });
    var out = I.el('output', { text: nilai + (satuan || '') });
    var r = I.el('input', { type: 'range', min: min, max: maks, step: langkah, value: nilai });
    r.addEventListener('input', function () { out.textContent = r.value + (satuan || ''); });
    r.addEventListener('change', function () { fn(+r.value); });
    w.appendChild(I.el('span', { text: label })); w.appendChild(r); w.appendChild(out);
    return w;
  }
  function tabTampilan(b) {
    var mode = I.gelap() ? 'gelap' : 'terang';
    try { if (!localStorage.getItem('quarto-color-scheme')) mode = 'sistem'; } catch (e) { /* abaikan */ }
    b.appendChild(bagian('Mode warna', segmen([['terang', '<i class="bi bi-sun"></i> Terang'], ['gelap', '<i class="bi bi-moon-stars"></i> Gelap'], ['sistem', '<i class="bi bi-circle-half"></i> Sistem']], mode, function (m) {
      if (m === 'sistem') { try { localStorage.removeItem('quarto-color-scheme'); } catch (e) { /* abaikan */ } }
      I.aturTema(m);
      setTimeout(function () { tampilTab('tampilan', true); }, 80);
    })));

    var gTema = I.el('div', { class: 'irbi-st-tema' });
    var primer = nilaiT('primer'), aksen = nilaiT('aksen');
    TEMA.forEach(function (t) {
      var aktif = t.primer.toLowerCase() === String(primer).toLowerCase() && t.aksen.toLowerCase() === String(aksen).toLowerCase();
      var k = I.el('button', { type: 'button', class: 'irbi-st-tema-kartu' + (aktif ? ' aktif' : ''), title: 'Tema ' + t.nama },
        '<span class="cth" style="background:linear-gradient(135deg,' + t.primer + ' 0 60%,' + t.aksen + ' 60% 100%)"></span>' + t.nama);
      k.addEventListener('click', function () {
        S.ubah('tampilan', function (l) {
          if (t.id === 'buku') { delete l.tampilan.primer; delete l.tampilan.aksen; } else { l.tampilan.primer = t.primer; l.tampilan.aksen = t.aksen; }
        });
        tampilTab('tampilan', true);
      });
      gTema.appendChild(k);
    });
    var gWarna = I.el('div', { class: 'irbi-st-baris' });
    gWarna.appendChild(inputWarna('Warna utama', primer, function (v) { aturT('primer', v); }));
    gWarna.appendChild(inputWarna('Warna aksen', aksen, function (v) { aturT('aksen', v); }));
    var w1 = I.el('div'); w1.appendChild(gTema); w1.appendChild(gWarna);
    b.appendChild(bagian('Tema', w1, 'Pilih tema siap pakai atau atur warnanya sendiri. Berlaku untuk navigasi, tombol, judul, dan PDF.'));

    var kelas = { TINGGI: nilaiT('kelas.TINGGI'), SEDANG: nilaiT('kelas.SEDANG'), RENDAH: nilaiT('kelas.RENDAH') };
    var gPal = I.el('div', { class: 'irbi-st-palet' });
    PALET.forEach(function (p) {
      var aktif = ['TINGGI', 'SEDANG', 'RENDAH'].every(function (k) { return p[k].toLowerCase() === String(kelas[k]).toLowerCase(); });
      var k = I.el('button', { type: 'button', class: 'irbi-st-palet-kartu' + (aktif ? ' aktif' : '') },
        '<span class="cth">' + ['TINGGI', 'SEDANG', 'RENDAH'].map(function (x) { return '<i style="background:' + p[x] + '"></i>'; }).join('') + '</span>' + p.nama);
      k.addEventListener('click', function () {
        S.ubah('tampilan', function (l) { if (p.id === 'bnpb') delete l.tampilan.kelas; else l.tampilan.kelas = { TINGGI: p.TINGGI, SEDANG: p.SEDANG, RENDAH: p.RENDAH }; });
        tampilTab('tampilan', true);
      });
      gPal.appendChild(k);
    });
    var gK = I.el('div', { class: 'irbi-st-baris' });
    ['TINGGI', 'SEDANG', 'RENDAH'].forEach(function (k) { gK.appendChild(inputWarna(I.LABEL[k], kelas[k], function (v) { aturT('kelas.' + k, v); })); });
    var w2 = I.el('div'); w2.appendChild(gPal); w2.appendChild(gK);
    b.appendChild(bagian('Warna kelas risiko', w2, 'Dipakai peta, lencana, grafik, tabel, dan PDF yang dibuat di peramban.'));

    var fontOpsi = Object.keys(I.FONT);
    var selFont = function (label, jalur) {
      var l = I.el('label', { class: 'irbi-st-pilih' });
      l.appendChild(I.el('span', { text: label }));
      var s = I.el('select', { class: 'form-select form-select-sm' });
      fontOpsi.forEach(function (f) { s.appendChild(I.el('option', { value: f, text: f === 'Sistem' ? 'Huruf sistem' : f })); });
      s.value = nilaiT(jalur);
      s.addEventListener('change', function () { aturT(jalur, s.value); });
      l.appendChild(s);
      return l;
    };
    var w3 = I.el('div', { class: 'irbi-st-kolom' });
    w3.appendChild(selFont('Huruf judul', 'fontJudul'));
    w3.appendChild(selFont('Huruf isi (paragraf)', 'fontIsi'));
    var tk = I.el('div', { class: 'irbi-st-pilih' });
    tk.appendChild(I.el('span', { text: 'Tata letak teks' }));
    tk.appendChild(segmen([['buku', 'Kolom buku'], ['satu', 'Satu kolom']], nilaiT('kolom'), function (v) { aturT('kolom', v); tampilTab('tampilan', true); }));
    w3.appendChild(tk);
    w3.appendChild(geser('Ukuran teks', 14, 21, 1, nilaiT('ukuran'), 'px', function (v) { aturT('ukuran', v); }));
    w3.appendChild(geser('Sudut membulat', 0, 22, 1, nilaiT('radius'), 'px', function (v) { aturT('radius', v); }));
    var kp = I.el('div', { class: 'irbi-st-pilih' });
    kp.appendChild(I.el('span', { text: 'Kepadatan' }));
    kp.appendChild(segmen([['lega', 'Lega'], ['ringkas', 'Ringkas']], nilaiT('kepadatan'), function (v) { aturT('kepadatan', v); tampilTab('tampilan', true); }));
    w3.appendChild(kp);
    w3.appendChild(sakelar('Animasi & transisi', nilaiT('animasi') !== false, function (v) { aturT('animasi', v); }));
    b.appendChild(bagian('Huruf & tata letak', w3));

    var w4 = I.el('div', { class: 'irbi-st-kolom' });
    var pd = I.el('label', { class: 'irbi-st-pilih' });
    pd.appendChild(I.el('span', { text: 'Peta dasar' }));
    var sd = I.el('select', { class: 'form-select form-select-sm' });
    [['otomatis', 'Otomatis (ikut mode warna)'], ['abu', 'Abu-abu terang (Esri)'], ['gelap', 'Abu-abu gelap (Esri)'], ['osm', 'OpenStreetMap'], ['citra', 'Citra satelit (Esri)'], ['kosong', 'Tanpa peta dasar']]
      .forEach(function (o) { sd.appendChild(I.el('option', { value: o[0], text: o[1] })); });
    sd.value = nilaiT('peta.dasar');
    sd.addEventListener('change', function () { aturT('peta.dasar', sd.value); });
    pd.appendChild(sd);
    w4.appendChild(pd);
    w4.appendChild(geser('Opasitas warna wilayah', 0.3, 1, 0.02, nilaiT('peta.opasitas'), '', function (v) { aturT('peta.opasitas', v); }));
    w4.appendChild(sakelar('Label nama wilayah (peta provinsi)', nilaiT('peta.label') !== false, function (v) { aturT('peta.label', v); }));
    w4.appendChild(sakelar('Garis batas provinsi (peta nasional)', nilaiT('peta.batas') !== false, function (v) { aturT('peta.batas', v); }));
    b.appendChild(bagian('Peta', w4));

    var reset = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi' }, '<i class="bi bi-arrow-counterclockwise"></i> Kembalikan tampilan bawaan');
    reset.addEventListener('click', function () { S.hapus('tampilan'); tampilTab('tampilan'); I.toast('Tampilan dikembalikan ke bawaan.', 'info'); });
    b.appendChild(reset);
  }

  // ------------------------------------------------------------------ tab Teks
  function cuplik(html, n) {
    var t = new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
    return t.length > (n || 90) ? t.slice(0, n || 90) + '…' : t;
  }
  function tabTeks(b) {
    var w = I.el('div');
    w.appendChild(sakelar('Mode edit teks di halaman ini', I.teks.aktif, function (v) {
      I.teks.mode(v);
      if (v) I.toast('Mode edit aktif: klik paragraf atau judul untuk mengubahnya.', 'info', 4500);
    }));
    w.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Klik paragraf, judul, atau butir daftar untuk mengedit. Gunakan <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> dan <kbd>Ctrl/⌘</kbd>+<kbd>I</kbd> untuk tebal dan miring. Perubahan tersimpan otomatis. Tabel, peta, dan angka ringkasan mengikuti data, jadi ubah lewat tab Data.'));
    b.appendChild(bagian('Edit langsung', w));

    var semua = S.efektif().teks, hal = I.halaman();
    var kunciHal = Object.keys(semua).filter(function (k) { return semua[k] && k.indexOf(hal + '::') === 0; });
    var daftar = I.el('div', { class: 'irbi-st-daftar' });
    if (!kunciHal.length) daftar.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Belum ada teks yang diubah di halaman ini.'));
    kunciHal.forEach(function (k) {
      var e = semua[k];
      var item = I.el('div', { class: 'irbi-st-item' });
      item.appendChild(I.el('div', { class: 'irbi-st-item-teks' }, '<b>' + I.esc(cuplik(e.html, 80)) + '</b><span>Asli: ' + I.esc(cuplik(e.asli, 70)) + '</span>'));
      var aksi = I.el('div', { class: 'irbi-st-item-aksi' });
      var lihat = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Tampilkan di halaman' }, '<i class="bi bi-eye"></i>');
      lihat.addEventListener('click', function () {
        var el = document.querySelector('[data-irbi-kunci="' + CSS.escape(k) + '"]');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('irbi-kedip'); setTimeout(function () { el.classList.remove('irbi-kedip'); }, 1600); }
      });
      var balik = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Kembalikan ke teks asli' }, '<i class="bi bi-arrow-counterclockwise"></i>');
      balik.addEventListener('click', function () { I.teks.kembalikan(k); tampilTab('teks', true); });
      aksi.appendChild(lihat); aksi.appendChild(balik);
      item.appendChild(aksi);
      daftar.appendChild(item);
    });
    b.appendChild(bagian('Perubahan di halaman ini (' + kunciHal.length + ')', daftar));

    var total = Object.keys(semua).filter(function (k) { return semua[k]; }).length;
    var w2 = I.el('div');
    w2.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Total ' + total + ' perubahan teks di semua halaman. Perubahan teks berlaku di versi HTML; untuk PDF buku, terapkan paket ke sumber (lihat tab Simpan).'));
    var r = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', disabled: total ? null : 'disabled' }, '<i class="bi bi-trash3"></i> Kembalikan semua teks');
    r.addEventListener('click', function () { if (confirm('Kembalikan semua ' + total + ' perubahan teks ke teks asli buku?')) { S.hapus('teks'); tampilTab('teks'); } });
    w2.appendChild(r);
    b.appendChild(bagian('Semua halaman', w2));
  }

  // ------------------------------------------------------------------ tab Data
  function tabData(b) {
    var e = S.efektif(), n = S.jumlah(e);
    var w = I.el('div', { class: 'irbi-st-statistik' });
    var stat = function (label, nilai) { return '<div><span>' + label + '</span><b>' + nilai + '</b></div>'; };
    var perAnc = Object.keys(e.data.ancaman).map(function (s) {
      var c = Object.keys(e.data.ancaman[s]).filter(function (k) { return e.data.ancaman[s][k] !== null; }).length;
      return c ? I.esc(I.namaIndeks(s)) + ': ' + c : '';
    }).filter(Boolean);
    w.innerHTML = stat('Skor multi-bahaya kab/kota', n.kabkota) + stat('Nilai provinsi', n.provinsi) + stat('Skor per ancaman', n.ancaman) + stat('Ambang kelas', n.ambang);
    var w0 = I.el('div'); w0.appendChild(w);
    if (perAnc.length) w0.appendChild(I.el('p', { class: 'irbi-st-ket' }, perAnc.join(' · ')));
    w0.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Semua peta, tabel, kartu ringkasan, grafik, CSV, dan PDF di peramban ini memakai data yang sudah diubah. Nilai provinsi dihitung ulang sebagai rata-rata kab/kota bila ada kab/kota yang diubah.'));
    b.appendChild(bagian('Perubahan data aktif', w0));

    var a = I.el('div', { class: 'irbi-st-aksi' });
    var bukaEditor = I.el('a', { class: 'btn btn-sm btn-irbi', href: I.akar + 'studio.html' }, '<i class="bi bi-grid-3x3-gap"></i> Buka Studio Data');
    var impor = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi' }, '<i class="bi bi-upload"></i> Impor CSV');
    impor.addEventListener('click', function () { pilihBerkas('.csv,text/csv', function (f) { alurImporCSV(f).then(function () { tampilTab('data', true); }); }); });
    var balik = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', disabled: n.data ? null : 'disabled' }, '<i class="bi bi-arrow-counterclockwise"></i> Kembalikan data buku');
    balik.addEventListener('click', function () { if (confirm('Hapus semua ' + n.data + ' perubahan data dan kembali ke data buku?')) { S.hapus('data'); tampilTab('data'); } });
    a.appendChild(bukaEditor); a.appendChild(impor); a.appendChild(balik);
    b.appendChild(bagian('Ubah data', a, 'Studio Data menyediakan lembar kerja: edit sel, tempel kolom dari Excel, urungkan/ulangi, dan pratinjau peta. Impor CSV menerima format berkas <code>data/</code>, CSV dari Jelajah Data, atau <code>jenis_indeks.csv</code>.'));
  }

  // ------------------------------------------------------------------ tab Simpan & Bagikan
  function isiSimpan(b) {
    var n = S.jumlah(S.lokal), t = S.terbit;
    var nt = S.jumlah(t);
    var status = I.el('div', { class: 'irbi-st-statistik' });
    status.innerHTML = '<div><span>Data diubah</span><b>' + n.data + '</b></div><div><span>Pengaturan tampilan</span><b>' + n.tampilan + '</b></div><div><span>Teks diubah</span><b>' + n.teks + '</b></div>';
    var w = I.el('div'); w.appendChild(status);
    w.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Kustomisasi lokal tersimpan di peramban ini saja' + (S.lokal.meta && S.lokal.meta.diubah ? ' (terakhir ' + new Date(S.lokal.meta.diubah).toLocaleString('id-ID') + ')' : '') + '.' +
      ((nt.data + nt.tampilan + nt.teks) ? ' <b>Paket terbit aktif</b> untuk semua pembaca: ' + nt.data + ' data, ' + nt.tampilan + ' tampilan, ' + nt.teks + ' teks.' : ' Belum ada paket terbit di situs ini.')));
    b.appendChild(bagian('Status', w));

    var a = I.el('div', { class: 'irbi-st-aksi' });
    var eks = I.el('button', { type: 'button', class: 'btn btn-sm btn-irbi' }, '<i class="bi bi-box-arrow-down"></i> Ekspor paket (.json)');
    eks.addEventListener('click', eksporPaket);
    var imp = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi' }, '<i class="bi bi-box-arrow-in-up"></i> Impor paket');
    imp.addEventListener('click', imporPaket);
    a.appendChild(eks); a.appendChild(imp);
    b.appendChild(bagian('Pindahkan antar-perangkat', a, 'Ekspor menyimpan semua perubahan (data, tampilan, teks) ke satu berkas JSON yang bisa diimpor di peramban atau komputer lain, atau dikirim ke rekan kerja.'));

    var a2 = I.el('div');
    var ter = I.el('button', { type: 'button', class: 'btn btn-sm btn-irbi' }, '<i class="bi bi-globe2"></i> Terbitkan untuk semua pembaca (.js)');
    ter.addEventListener('click', terbitkan);
    a2.appendChild(ter);
    a2.appendChild(I.el('ol', { class: 'irbi-st-langkah' },
      '<li>Klik tombol di atas untuk mengunduh <code>irbi-kustom.js</code>.</li>' +
      '<li>Salin berkas ke folder <code>assets/kustom/</code> pada situs yang dipublikasikan (<code>_book/assets/kustom/</code>), atau ke <code>app/assets/kustom/</code> lalu render ulang.</li>' +
      '<li>Semua pembaca langsung melihat perubahan, tanpa server atau basis data. Hapus berkas untuk membatalkan.</li>'));
    b.appendChild(bagian('Terbitkan', a2, 'Cocok untuk koreksi angka, penyesuaian teks, atau tema resmi yang harus terlihat oleh semua orang.'));

    var a3 = I.el('div');
    a3.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'PDF buku lengkap dibuat dari berkas sumber. Untuk memasukkan perubahan ke sumber secara otomatis (CSV, warna, teks), jalankan:'));
    a3.appendChild(I.el('pre', { class: 'irbi-st-kode' }, 'python3 scripts/terapkan_kustom.py irbi-kustom.json\n./jalankan.sh render'));
    b.appendChild(bagian('Masukkan ke sumber (opsional)', a3));

    var hapus = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-danger' }, '<i class="bi bi-trash3"></i> Hapus semua kustomisasi lokal');
    hapus.addEventListener('click', function () {
      if (confirm('Hapus semua kustomisasi lokal (data, tampilan, dan teks) di peramban ini?')) { S.hapus('semua'); I.toast('Kustomisasi lokal dihapus.', 'info'); if (panel && panel.dataset.tab) tampilTab(panel.dataset.tab); }
    });
    b.appendChild(hapus);
  }
  function tabSimpan(b) { isiSimpan(b); }
  function pasangPaket(el) {
    var gambar = function () { el.innerHTML = ''; isiSimpan(el); };
    gambar();
    document.addEventListener('irbi:kustom', gambar);
  }

  I.studio = { buka: buka, tutup: tutup, pasangPaket: pasangPaket, imporCSV: imporCSV, terapkanImpor: terapkanImpor, alurImporCSV: alurImporCSV,
    ringkasImpor: ringkasImpor, pilihBerkas: pilihBerkas, eksporPaket: eksporPaket, terbitkan: terbitkan };
})();
