/* IRBI 2025 — Studio: ubah tampilan, teks, dan data langsung di aplikasi (tanpa server/basis data).
 * Perubahan disimpan di peramban (localStorage) dan dapat diekspor/diimpor sebagai paket JSON, atau
 * diterbitkan untuk semua pembaca sebagai berkas assets/kustom/irbi-kustom.js.
 *
 * Tab Tampilan: pratinjau langsung, gaya baca siap pakai, tema warna (kode hex & cek kontras), warna kelas,
 * kertas & bacaan, huruf, antarmuka, peta, serta "gaya saya" (simpan, ekspor, impor tampilan). Setiap perubahan
 * bisa diurungkan (Ctrl/⌘+Z), dan tombol Bandingkan (ditahan) memperlihatkan tampilan bawaan buku.
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.studio) return;
  var S = I.kustom, W = I.warnaUtil;

  // ================================================================== nilai bawaan & pilihan siap pakai
  var BAWAAN = {
    primer: '#153B30', aksen: '#C47A36', kelas: { TINGGI: '#E5242A', SEDANG: '#FFE433', RENDAH: '#2EAD4B' },
    fontJudul: 'Instrument Sans', fontIsi: 'Georgia', fontUI: 'Inter', ukuran: 16, radius: 12,
    kepadatan: 'lega', kolom: 'buku', kertas: 'bawaan', spasi: 'normal', rata: 'kiri', hurufAwal: true,
    kontras: 'normal', kepala: 'terang', animasi: true,
    peta: { dasar: 'otomatis', opasitas: 0.82, label: true, batas: true }
  };
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
  /** Contoh warna nuansa kertas untuk tombol pilihan (nilai sebenarnya ada di irbi.scss, html[data-irbi-kertas]). */
  var KERTAS = [
    { id: 'bawaan', nama: 'Bawaan', kertas: '#FBFCFA', latar: '#F2F6F3', teks: '#293E36', kertasG: '#14231F', latarG: '#0D1714', teksG: '#CFDDD6' },
    { id: 'putih', nama: 'Putih', kertas: '#FFFFFF', latar: '#E9ECEE', teks: '#293E36', kertasG: '#191C20', latarG: '#101214', teksG: '#CFDDD6' },
    { id: 'krem', nama: 'Krem', kertas: '#FFFCF5', latar: '#EDE6D8', teks: '#3A3226', kertasG: '#1E1B15', latarG: '#14120E', teksG: '#DCD3C2' },
    { id: 'sepia', nama: 'Sepia', kertas: '#F6EDDA', latar: '#E2D3B8', teks: '#3A2E20', kertasG: '#211A12', latarG: '#16110B', teksG: '#E4D6BF' }
  ];
  /** Gaya baca siap pakai. Hanya mengatur KUNCI_BACA: warna tema, warna kelas, dan peta tidak berubah. */
  var KUNCI_BACA = ['kertas', 'ukuran', 'spasi', 'kolom', 'rata', 'hurufAwal', 'kontras', 'kepadatan', 'fontJudul', 'fontIsi', 'fontUI'];
  var GAYA = [
    { id: 'buku', nama: 'Seperti buku', ket: 'Tata letak bawaan', nilai: {} },
    { id: 'nyaman', nama: 'Nyaman dibaca', ket: 'Huruf besar, satu kolom, kertas krem', nilai: { ukuran: 18, spasi: 'lega', kolom: 'satu', kertas: 'krem' } },
    { id: 'kontras', nama: 'Kontras tinggi', ket: 'Teks tegas di kertas putih', nilai: { kontras: 'tinggi', kertas: 'putih', ukuran: 17, hurufAwal: false } },
    { id: 'ringkas', nama: 'Ringkas', ket: 'Lebih banyak isi per layar', nilai: { ukuran: 15, spasi: 'rapat', kepadatan: 'ringkas' } },
    { id: 'klasik', nama: 'Klasik', ket: 'Kertas sepia, huruf berkait', nilai: { kertas: 'sepia', fontJudul: 'Merriweather', fontIsi: 'Lora' } }
  ];
  var DASAR_PETA = [['otomatis', 'Otomatis (ikut mode warna)'], ['abu', 'Abu-abu terang (Esri)'], ['gelap', 'Abu-abu gelap (Esri)'],
    ['osm', 'OpenStreetMap'], ['citra', 'Citra satelit (Esri)'], ['kosong', 'Tanpa peta dasar']];
  var KUNCI_TAB = 'irbi2025:studio-tab', KUNCI_BUKA = 'irbi2025:studio-bagian', KUNCI_GAYA_SAYA = 'irbi2025:gaya-saya';

  function bacaLS(k, cadangan) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? cadangan : v; } catch (e) { return cadangan; } }
  function tulisLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function ambil(o, jalur) { return jalur.split('.').reduce(function (x, k) { return x === undefined || x === null ? undefined : x[k]; }, o); }
  function bawaanDari(jalur) { return ambil(BAWAAN, jalur); }
  function nilaiT(jalur) { return I.tampilan.nilai(jalur, bawaanDari(jalur)); }
  function sama(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    return a === b;
  }
  function diubah(jalur) { return !sama(nilaiT(jalur), bawaanDari(jalur)); }
  function adaUbah(daftar) { return daftar.some(diubah); }
  function jsonUrut(o) {
    return JSON.stringify(o, function (k, v) {
      return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce(function (r, x) { r[x] = v[x]; return r; }, {}) : v;
    });
  }
  function tumpukan(f) {
    if (!f || f === 'Sistem') return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    return '"' + f + '", ' + (I.FONT_SERIF[f] ? 'Georgia, serif' : 'system-ui, sans-serif');
  }
  function namaFont(f) { return f === 'Sistem' ? 'Huruf sistem' : f; }
  function titik(w) { return '<span class="irbi-st-titik" style="background:' + w + '"></span>'; }
  function kertasDari(id) { return KERTAS.filter(function (k) { return k.id === id; })[0] || KERTAS[0]; }

  // ================================================================== perubahan tampilan + riwayat (urungkan/ulangi)
  var riwayat = { mundur: [], maju: [], kunci: null, waktu: 0 };
  function salinT() { return JSON.parse(JSON.stringify(S.lokal.tampilan || {})); }
  /** Tulis satu nilai. Nilai sama dengan bawaan dihapus agar paket tetap ringkas, kecuali paket terbit
   *  mengaturnya (penghapusan akan memunculkan nilai terbit, bukan bawaan). */
  function tulis(l, jalur, nilai) {
    var ks = jalur.split('.'), o = l.tampilan;
    var hapus = sama(nilai, bawaanDari(jalur)) && ambil(S.terbit.tampilan, jalur) === undefined;
    for (var i = 0; i < ks.length - 1; i++) { if (!o[ks[i]] || typeof o[ks[i]] !== 'object') o[ks[i]] = {}; o = o[ks[i]]; }
    var akhir = ks[ks.length - 1];
    if (hapus) delete o[akhir]; else o[akhir] = nilai;
    if (ks.length > 1 && !Object.keys(l.tampilan[ks[0]] || {}).length) delete l.tampilan[ks[0]];
  }
  /** Semua perubahan tampilan lewat sini agar bisa diurungkan. Perubahan beruntun pada pengaturan yang sama
   *  (mis. menggeser warna atau ukuran) digabung menjadi satu langkah. Mengembalikan true bila ada yang berubah. */
  function ubahT(fn, kunciGabung) {
    var sebelum = salinT();
    S.ubah('tampilan', fn);
    if (JSON.stringify(salinT()) === JSON.stringify(sebelum)) return false;
    var t = Date.now();
    if (!(kunciGabung && riwayat.kunci === kunciGabung && t - riwayat.waktu < 1500)) {
      riwayat.mundur.push(sebelum);
      if (riwayat.mundur.length > 80) riwayat.mundur.shift();
    }
    riwayat.maju = [];
    riwayat.kunci = kunciGabung || null;
    riwayat.waktu = t;
    perbaruiKaki();
    return true;
  }
  function aturT(jalur, nilai, gabung) { return ubahT(function (l) { tulis(l, jalur, nilai); }, gabung ? jalur : null); }
  function aturBanyak(peta) { return ubahT(function (l) { Object.keys(peta).forEach(function (j) { tulis(l, j, peta[j]); }); }); }
  function gantiT(t) { return ubahT(function (l) { l.tampilan = JSON.parse(JSON.stringify(t)); }); }
  function setel(jalur) { return function (v) { if (aturT(jalur, v)) gambarUlang(); }; }
  function langkah(arah) {      // -1 urungkan, +1 ulangi
    var dari = arah < 0 ? riwayat.mundur : riwayat.maju, ke = arah < 0 ? riwayat.maju : riwayat.mundur;
    if (!dari.length) return;
    ke.push(salinT());
    var t = dari.pop();
    riwayat.kunci = null;
    S.ubah('tampilan', function (l) { l.tampilan = t; });
    gambarUlang();
    umumkan(arah < 0 ? 'Perubahan diurungkan.' : 'Perubahan diulangi.');
  }
  function acakWarna() {
    var h = Math.floor(Math.random() * 360);
    var primer = W.hsl(h, 0.42 + Math.random() * 0.25, 0.17 + Math.random() * 0.1).toUpperCase();
    var aksen = W.hsl((h + 140 + Math.floor(Math.random() * 80)) % 360, 0.55 + Math.random() * 0.2, 0.48 + Math.random() * 0.08).toUpperCase();
    return aturBanyak({ primer: primer, aksen: aksen });
  }
  /** Aksen serasi: rona seberang (komplementer) dari warna utama, cukup cerah untuk penanda. */
  function aksenSerasi(primer) {
    var w = W.hexKeHsl(primer) || [160, 0.5, 0.2];
    return W.hsl((w[0] + 180) % 360, 0.62, 0.52).toUpperCase();
  }

  // ================================================================== gaya saya (tersimpan di peramban)
  function gayaSaya() {
    var a = bacaLS(KUNCI_GAYA_SAYA, []);
    return Array.isArray(a) ? a.filter(function (g) { return g && typeof g.nama === 'string' && g.tampilan && typeof g.tampilan === 'object'; }) : [];
  }
  function simpanGayaSaya(a) {
    if (tulisLS(KUNCI_GAYA_SAYA, a)) return true;
    I.toast('Penyimpanan peramban tidak tersedia; gaya tidak dapat disimpan.', 'galat', 6000);
    return false;
  }
  function ringkasGaya(t) {
    var n = Object.keys(t).length;
    if (!n) return 'Tampilan bawaan';
    var bag = [n + ' pengaturan'];
    if (t.kertas && t.kertas !== 'bawaan') bag.push('kertas ' + kertasDari(t.kertas).nama.toLowerCase());
    if (t.fontIsi) bag.push(namaFont(t.fontIsi));
    return bag.join(' · ');
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

  // ------------------------------------------------------------------ ekspor/impor tampilan saja
  function eksporTampilan() {
    var p = { format: 'irbi-kustom', versi: 1, jenis: 'tampilan', dibuat: new Date().toISOString(), tampilan: I.tampilan.efektif() };
    I.unduh(JSON.stringify(p, null, 2), 'irbi-tampilan-' + tanggalBerkas() + '.json', 'application/json');
    I.toast('Tampilan diekspor. Berkasnya bisa diimpor di perangkat lain lewat Studio → Tampilan.', 'sukses', 5000);
  }
  function imporTampilan() {
    pilihBerkas('.json,application/json', function (file) {
      I.bacaBerkas(file).then(function (teks) {
        var o = JSON.parse(teks);
        if (!o || typeof o !== 'object' || (o.format && o.format !== 'irbi-kustom')) throw new Error('Bukan berkas tampilan IRBI.');
        var t = I.tampilan.bersih(o.format || o.tampilan ? o.tampilan : o);
        if (!Object.keys(t).length) throw new Error('Berkas tidak berisi pengaturan tampilan yang dikenali.');
        gantiT(t);
        gambarUlang();
        I.toast('Tampilan dari "' + I.esc(file.name) + '" diterapkan (' + Object.keys(t).length + ' pengaturan). Tekan <b>Urungkan</b> bila tidak sesuai.', 'sukses', 6500);
      }).catch(function (e) { I.toast('Impor tampilan gagal: ' + I.esc(e.message), 'galat', 7000); });
    });
  }

  // ------------------------------------------------------------------ bandingkan dengan bawaan (tahan tombol)
  var banding = null;
  function bandingkan(nyala) {
    var html = document.documentElement, st = document.getElementById('irbi-gaya-kustom');
    if (nyala && !banding) {
      banding = {};
      Object.keys(I.tampilan.ATRIBUT).forEach(function (k) {
        var a = I.tampilan.ATRIBUT[k];
        banding[a[0]] = html.getAttribute(a[0]);
        html.setAttribute(a[0], typeof a[1] === 'boolean' ? 'nyala' : a[1]);
      });
      if (st && st.sheet) st.sheet.disabled = true;
      html.classList.add('irbi-membandingkan');
    } else if (!nyala && banding) {
      Object.keys(banding).forEach(function (a) { if (banding[a] === null) html.removeAttribute(a); else html.setAttribute(a, banding[a]); });
      banding = null;
      if (st && st.sheet) st.sheet.disabled = false;
      html.classList.remove('irbi-membandingkan');
    }
  }
  function pasangBanding(b) {
    b.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
      bandingkan(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { bandingkan(false); }); });
    b.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); bandingkan(true); } });
    b.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') bandingkan(false); });
    b.addEventListener('blur', function () { bandingkan(false); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('blur', function () { bandingkan(false); });
  }

  // ================================================================== panel
  var panel = null;
  var TAB = [['tampilan', 'Tampilan', 'bi-brush'], ['teks', 'Teks', 'bi-type'], ['data', 'Data', 'bi-table'], ['simpan', 'Simpan', 'bi-share']];
  function bangunPanel() {
    panel = I.el('div', { class: 'irbi-studio', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'irbi-studio-judul', tabindex: '-1' });
    panel.innerHTML =
      '<header class="irbi-studio-kepala"><div><h2 id="irbi-studio-judul"><i class="bi bi-palette2"></i> Studio</h2>' +
      '<p>Atur tampilan, teks, dan data buku ini sesuai kebutuhan Anda.</p>' +
      '<span class="irbi-st-status"><i class="bi bi-check2-circle"></i> Tersimpan otomatis di peramban ini</span></div>' +
      '<button type="button" class="irbi-studio-tutup" aria-label="Tutup Studio" title="Tutup (Esc)"><i class="bi bi-x-lg"></i></button></header>' +
      '<nav class="irbi-tab irbi-studio-tab" role="tablist" aria-label="Bagian Studio">' +
      TAB.map(function (t) {
        return '<button type="button" role="tab" id="irbi-st-tab-' + t[0] + '" aria-controls="irbi-st-badan" data-tab="' + t[0] + '">' +
          '<i class="bi ' + t[2] + '"></i> ' + t[1] + '<span class="irbi-st-lencana" hidden></span></button>';
      }).join('') + '</nav>' +
      '<div class="irbi-studio-badan" id="irbi-st-badan" role="tabpanel"></div>' +
      '<footer class="irbi-studio-kaki"></footer>' +
      '<div class="visually-hidden" aria-live="polite" data-umum></div>';
    document.body.appendChild(panel);
    var latar = I.el('div', { class: 'irbi-studio-latar' });
    latar.addEventListener('click', tutup);
    document.body.appendChild(latar);
    panel.querySelector('.irbi-studio-tutup').addEventListener('click', tutup);

    var daftarTab = panel.querySelector('[role=tablist]');
    daftarTab.querySelectorAll('[role=tab]').forEach(function (b) { b.addEventListener('click', function () { tampilTab(b.dataset.tab); }); });
    daftarTab.addEventListener('keydown', function (e) {      // panah kiri/kanan, Home, End
      var tabs = Array.prototype.slice.call(daftarTab.querySelectorAll('[role=tab]'));
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var j = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      tampilTab(tabs[j].dataset.tab);
      tabs[j].focus();
    });

    var kaki = panel.querySelector('.irbi-studio-kaki');
    var tombol = function (kelas, ikon, teks, judul, fokus) {
      return I.el('button', { type: 'button', class: 'btn btn-sm ' + kelas, title: judul, 'aria-label': teks ? null : judul, 'data-fokus': fokus },
        '<i class="bi ' + ikon + '" aria-hidden="true"></i>' + (teks ? ' ' + teks : ''));
    };
    var bUrung = tombol('btn-outline-irbi irbi-st-ikon', 'bi-arrow-counterclockwise', '', 'Urungkan perubahan terakhir (Ctrl/⌘+Z)', 'kaki:urung');
    var bUlang = tombol('btn-outline-irbi irbi-st-ikon', 'bi-arrow-clockwise', '', 'Ulangi (Ctrl/⌘+Shift+Z)', 'kaki:ulang');
    var bBanding = tombol('btn-outline-irbi irbi-st-banding', 'bi-eye', 'Bandingkan', 'Tahan untuk melihat tampilan bawaan buku', 'kaki:banding');
    var bBawaan = tombol('btn-outline-irbi', 'bi-eraser', 'Bawaan', 'Kembalikan semua pengaturan tampilan ke bawaan', 'kaki:bawaan');
    bUrung.addEventListener('click', function () { langkah(-1); });
    bUlang.addEventListener('click', function () { langkah(1); });
    bBawaan.addEventListener('click', function () {
      if (gantiT({})) { gambarUlang(); I.toast('Tampilan dikembalikan ke bawaan. Tekan <b>Urungkan</b> untuk membatalkan.', 'info', 5000); }
    });
    pasangBanding(bBanding);
    [bUrung, bUlang, bBanding, I.el('span', { class: 'pemisah' }), bBawaan].forEach(function (x) { kaki.appendChild(x); });

    panel.addEventListener('keydown', function (e) {        // Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl/⌘+Y di tab Tampilan
      if (!(e.ctrlKey || e.metaKey) || e.altKey || panel.dataset.tab !== 'tampilan') return;
      var k = String(e.key).toLowerCase(), t = e.target;
      if (k !== 'z' && k !== 'y') return;
      if (t && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|number|email|url)$/i.test(t.type)))) return;
      e.preventDefault();
      langkah(k === 'y' || e.shiftKey ? 1 : -1);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('terbuka') && !banding) tutup(); });
    document.addEventListener('irbi:kustom', function () {
      perbaruiLencana(); perbaruiKaki();
      if (panel.classList.contains('terbuka') && !panel.contains(document.activeElement)) tampilTab(panel.dataset.tab, true);
    });
    // mode terang/gelap diganti dari luar Studio (tombol di bilah atas, pengaturan perangkat): segarkan pilihan aktif
    document.addEventListener('irbi:tema', function () { if (panel.classList.contains('terbuka') && panel.dataset.tab === 'tampilan') tampilTab('tampilan', true); });
    document.addEventListener('irbi:mode-edit', function () { if (panel.dataset.tab === 'teks') tampilTab('teks', true); });
  }
  function buka(tab) {
    if (!panel) bangunPanel();
    tampilTab(tab || panel.dataset.tab || bacaLS(KUNCI_TAB, 'tampilan'));
    panel.classList.add('terbuka');
    document.documentElement.classList.add('irbi-studio-terbuka');
    setTimeout(function () { panel.focus(); }, 30);
  }
  function tutup() {
    if (!panel) return;
    bandingkan(false);
    panel.classList.remove('terbuka');
    document.documentElement.classList.remove('irbi-studio-terbuka');
    var fab = document.querySelector('.irbi-studio-fab');
    if (fab) fab.focus();
  }
  var BADAN = {};
  /** Gambar ulang isi tab. diam: pertahankan posisi gulir. Fokus papan ketik dikembalikan ke kontrol yang sama
   *  (atribut data-fokus) agar pengguna papan ketik tidak kehilangan posisi setelah setiap perubahan. */
  function tampilTab(tab, diam) {
    if (!BADAN[tab]) tab = 'tampilan';
    var lama = panel.dataset.tab;
    panel.dataset.tab = tab;
    tulisLS(KUNCI_TAB, tab);
    panel.querySelectorAll('[role=tab]').forEach(function (b) {
      var p = b.dataset.tab === tab;
      b.setAttribute('aria-selected', p ? 'true' : 'false');
      b.tabIndex = p ? 0 : -1;
    });
    var badan = panel.querySelector('.irbi-studio-badan');
    badan.setAttribute('aria-labelledby', 'irbi-st-tab-' + tab);
    var a = document.activeElement;
    var fokus = a && badan.contains(a) ? a.getAttribute('data-fokus') : null;
    var gulir = badan.scrollTop;
    badan.innerHTML = '';
    BADAN[tab](badan);
    badan.scrollTop = diam && lama === tab ? gulir : 0;
    if (fokus) {
      var cari = function (f) { return badan.querySelector('[data-fokus="' + CSS.escape(f) + '"]'); };
      var el = cari(fokus);
      if (!el && fokus.indexOf('reset:') === 0) el = badan.querySelector('[data-fokus^="' + CSS.escape('k:' + fokus.slice(6)) + '"]');
      if (el && !el.disabled) el.focus({ preventScroll: true }); else panel.focus({ preventScroll: true });
    }
    perbaruiLencana();
    perbaruiKaki();
  }
  function gambarUlang() { if (panel && panel.classList.contains('terbuka')) tampilTab(panel.dataset.tab, true); }
  function umumkan(teks) {
    var u = panel && panel.querySelector('[data-umum]');
    if (!u) return;
    u.textContent = '';
    setTimeout(function () { u.textContent = teks; }, 40);
  }
  function perbaruiLencana() {
    if (!panel) return;
    var n = S.jumlah(), isi = { tampilan: n.tampilan, teks: n.teks, data: n.data };
    panel.querySelectorAll('[role=tab]').forEach(function (b) {
      var l = b.querySelector('.irbi-st-lencana'), v = isi[b.dataset.tab] || 0;
      l.hidden = !v;
      l.textContent = v > 99 ? '99+' : String(v);
      l.title = v + ' perubahan aktif';
    });
  }
  function perbaruiKaki() {
    if (!panel) return;
    var k = panel.querySelector('.irbi-studio-kaki');
    var atur = function (f, mati) {
      var b = k.querySelector('[data-fokus="' + f + '"]');
      if (!b) return;
      var fokus = document.activeElement === b;
      b.disabled = mati;
      if (mati && fokus) panel.focus({ preventScroll: true });
    };
    atur('kaki:urung', !riwayat.mundur.length);
    atur('kaki:ulang', !riwayat.maju.length);
    atur('kaki:bawaan', !Object.keys(S.lokal.tampilan || {}).length);
  }

  // ------------------------------------------------------------------ komponen kontrol
  function bagian(judul, isi, ket) {     // bagian sederhana (tab Teks, Data, Simpan)
    var s = I.el('section', { class: 'irbi-st-bagian' });
    s.appendChild(I.el('h3', {}, judul));
    if (ket) s.appendChild(I.el('p', { class: 'irbi-st-ket' }, ket));
    s.appendChild(isi);
    return s;
  }
  var bukaBagian = bacaLS(KUNCI_BUKA, null);
  if (!Array.isArray(bukaBagian)) bukaBagian = ['gaya', 'tema'];
  /** Bagian yang bisa dilipat; ringkasan nilai saat ini tampil di judulnya, titik jingga bila ada yang diubah. */
  function seksi(id, ikon, judul, ringkas, kunci) {
    var d = I.el('details', { class: 'irbi-st-seksi', 'data-bagian': id });
    if (bukaBagian.indexOf(id) >= 0) d.open = true;
    var ub = !!(kunci && adaUbah(kunci));
    d.appendChild(I.el('summary', { 'data-fokus': 'seksi:' + id },
      '<span class="ikon" aria-hidden="true"><i class="bi ' + ikon + '"></i></span>' +
      '<span class="teks"><b>' + judul + '</b><small>' + ringkas + '</small></span>' +
      (ub ? '<span class="titik-ubah" title="Ada pengaturan yang diubah"></span><span class="visually-hidden">(ada yang diubah)</span>' : '')));
    var isi = I.el('div', { class: 'isi' });
    d.appendChild(isi);
    d.addEventListener('toggle', function () {
      var i = bukaBagian.indexOf(id);
      if (d.open && i < 0) bukaBagian.push(id);
      if (!d.open && i >= 0) bukaBagian.splice(i, 1);
      tulisLS(KUNCI_BUKA, bukaBagian);
    });
    return { el: d, isi: isi, ubah: ub, kunci: kunci || [], id: id };
  }
  function resetBagian(s) {
    if (!s.ubah) return;
    var b = I.el('button', { type: 'button', class: 'irbi-st-tautan', 'data-fokus': 'resetbagian:' + s.id }, '<i class="bi bi-arrow-counterclockwise"></i> Kembalikan bagian ini ke bawaan');
    b.addEventListener('click', function () {
      var p = {};
      s.kunci.forEach(function (k) { p[k] = bawaanDari(k); });
      if (aturBanyak(p)) gambarUlang();
    });
    s.isi.appendChild(b);
  }
  /** Baris pengaturan: label | kontrol | tombol kembalikan (hanya muncul bila nilainya berbeda dari bawaan). */
  function baris(label, kontrol, jalur, opsi) {
    opsi = opsi || {};
    var r = I.el('div', { class: 'irbi-st-kontrol' + (opsi.tumpuk ? ' tumpuk' : '') });
    var id = 'irbi-st-l-' + String(jalur || label).replace(/[^a-z0-9]+/gi, '-');
    r.appendChild(I.el('span', { class: 'label', id: id }, label + (opsi.ket ? '<small>' + opsi.ket + '</small>' : '')));
    if (kontrol.getAttribute('role') === 'group' && !kontrol.getAttribute('aria-label')) kontrol.setAttribute('aria-labelledby', id);
    r.appendChild(kontrol);
    if (jalur && diubah(jalur)) {
      var b = I.el('button', { type: 'button', class: 'irbi-st-reset', title: 'Kembalikan ke bawaan', 'aria-label': 'Kembalikan ' + label + ' ke bawaan', 'data-fokus': 'reset:' + jalur },
        '<i class="bi bi-arrow-counterclockwise"></i>');
      b.addEventListener('click', function () { if (aturT(jalur, bawaanDari(jalur))) gambarUlang(); });
      r.appendChild(b);
    } else r.appendChild(I.el('span', { class: 'irbi-st-reset-kosong', 'aria-hidden': 'true' }));
    return r;
  }
  function segmen(fokus, pilihan, aktif, fn) {
    var g = I.el('div', { class: 'irbi-segmen', role: 'group' });
    pilihan.forEach(function (p) {
      var on = sama(p[0], aktif);
      var b = I.el('button', { type: 'button', class: on ? 'aktif' : '', 'aria-pressed': on ? 'true' : 'false', 'data-fokus': fokus + ':' + p[0] }, p[1]);
      b.addEventListener('click', function () { fn(p[0]); });
      g.appendChild(b);
    });
    return g;
  }
  function sakelar(fokus, label, nyala, fn) {
    var l = I.el('label', { class: 'irbi-sakelar' });
    var c = I.el('input', { type: 'checkbox', 'data-fokus': fokus });
    c.checked = !!nyala;
    c.addEventListener('change', function () { fn(c.checked); });
    l.appendChild(c); l.appendChild(I.el('span')); l.appendChild(document.createTextNode(label));
    return l;
  }
  /** Pemilih warna + kotak kode hex (bisa diketik/ditempel, mis. dari pedoman merek). */
  function kontrolWarna(jalur, label) {
    var nilai = String(nilaiT(jalur)).toUpperCase();
    var w = I.el('div', { class: 'irbi-st-warna-isi' });
    var c = I.el('input', { type: 'color', value: nilai.toLowerCase(), 'aria-label': label + ': pemilih warna', 'data-fokus': 'k:' + jalur });
    var h = I.el('input', { type: 'text', class: 'form-control form-control-sm', value: nilai, maxlength: '7', spellcheck: 'false', autocomplete: 'off',
      'aria-label': label + ': kode hex', 'data-fokus': 'hex:' + jalur });
    var terap = I.tunda(function (v) { aturT(jalur, v, true); }, 90);
    c.addEventListener('input', function () { h.value = c.value.toUpperCase(); h.removeAttribute('aria-invalid'); terap(c.value.toUpperCase()); });
    c.addEventListener('change', function () { setTimeout(gambarUlang, 140); });
    var kirim = function () {
      var v = W.sah(h.value.trim());
      if (!v) { h.setAttribute('aria-invalid', 'true'); h.title = 'Format kode warna: #RRGGBB, misalnya #153B30'; return; }
      h.removeAttribute('aria-invalid');
      h.value = v;
      if (aturT(jalur, v)) gambarUlang();
    };
    h.addEventListener('change', kirim);
    h.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); kirim(); } });
    w.appendChild(c); w.appendChild(h);
    return w;
  }
  function kontrolGeser(jalur, min, maks, langkahNilai, fmt, label) {
    var w = I.el('div', { class: 'irbi-st-geser-isi' });
    var v = +nilaiT(jalur);
    var r = I.el('input', { type: 'range', min: min, max: maks, step: langkahNilai, value: v, 'aria-label': label, 'data-fokus': 'k:' + jalur });
    var out = I.el('output', { text: fmt(v) });
    var terap = I.tunda(function () { aturT(jalur, +r.value, true); }, 60);
    r.addEventListener('input', function () { out.textContent = fmt(+r.value); terap(); });
    r.addEventListener('change', function () { setTimeout(gambarUlang, 100); });
    w.appendChild(r); w.appendChild(out);
    return w;
  }
  function kontrolUkuran() {
    var MIN = 13, MAKS = 22, v = +nilaiT('ukuran');
    var w = kontrolGeser('ukuran', MIN, MAKS, 1, function (x) { return x + 'px'; }, 'Ukuran teks');
    var mini = function (teks, label, fokus, ke, mati) {
      var b = I.el('button', { type: 'button', class: 'irbi-st-mini', 'aria-label': label, title: label, 'data-fokus': fokus }, teks);
      b.disabled = mati;
      b.addEventListener('click', function () { if (aturT('ukuran', ke)) gambarUlang(); });
      return b;
    };
    w.insertBefore(mini('A−', 'Perkecil teks', 'k:ukuran:kecil', Math.max(MIN, v - 1), v <= MIN), w.firstChild);
    w.insertBefore(mini('A+', 'Perbesar teks', 'k:ukuran:besar', Math.min(MAKS, v + 1), v >= MAKS), w.lastChild);
    return w;
  }
  function kontrolFont(jalur, label, contoh) {
    var w = I.el('div', { class: 'irbi-st-font' });
    var s = I.el('select', { class: 'form-select form-select-sm', 'aria-label': label, 'data-fokus': 'k:' + jalur });
    var sans = I.el('optgroup', { label: 'Tanpa kait (sans-serif)' }), serif = I.el('optgroup', { label: 'Berkait (serif)' });
    Object.keys(I.FONT).forEach(function (f) {
      var nama = f === 'Sistem' ? 'Huruf sistem perangkat' : f;
      (I.FONT_SERIF[f] ? serif : sans).appendChild(I.el('option', { value: f, text: nama + (sama(f, bawaanDari(jalur)) ? ' (bawaan)' : '') }));
    });
    s.appendChild(sans); s.appendChild(serif);
    s.value = nilaiT(jalur);
    s.addEventListener('change', function () { if (aturT(jalur, s.value)) gambarUlang(); });
    var c = I.el('div', { class: 'irbi-st-font-contoh', text: contoh, 'aria-hidden': 'true' });
    c.style.fontFamily = tumpukan(nilaiT(jalur));
    w.appendChild(s); w.appendChild(c);
    return w;
  }
  function kontrolKertas() {
    var g = I.el('div', { class: 'irbi-st-kertas', role: 'group' });
    var kini = nilaiT('kertas'), gelap = I.gelap();
    KERTAS.forEach(function (k) {
      var on = k.id === kini;
      var b = I.el('button', { type: 'button', class: 'irbi-st-kertas-pilih' + (on ? ' aktif' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-fokus': 'k:kertas:' + k.id },
        '<span class="cth" aria-hidden="true" style="background:' + (gelap ? k.kertasG : k.kertas) + ';color:' + (gelap ? k.teksG : k.teks) +
        ';box-shadow:inset 0 0 0 4px ' + (gelap ? k.latarG : k.latar) + '">Aa</span>' + k.nama);
      b.addEventListener('click', function () { if (aturT('kertas', k.id)) gambarUlang(); });
      g.appendChild(b);
    });
    return g;
  }
  function petunjukKontras(primer) {
    var r = W.kontras('#FFFFFF', primer), baik = r >= 4.5;
    var angka = r.toFixed(1).replace('.', ',') + ':1';
    return I.el('div', { class: 'irbi-st-petunjuk ' + (baik ? 'baik' : 'peringatan') },
      '<i class="bi ' + (baik ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill') + '" aria-hidden="true"></i><span>' +
      (baik ? 'Teks putih pada tombol dan navigasi mudah dibaca (kontras ' + angka + ').'
        : 'Teks putih pada warna utama ini sulit dibaca (kontras ' + angka + ', minimal 4,5:1). Pilih warna yang lebih gelap.') + '</span>');
  }

  // ------------------------------------------------------------------ tab Tampilan
  function pratinjau() {
    return I.el('div', { class: 'irbi-st-pratinjau' },
      '<div class="irbi-st-pt" aria-hidden="true">' +
      '<div class="pt-kepala"><span class="pt-lambang"></span><span class="pt-nama">IRBI 2025</span><span class="pt-tautan">Jelajah Data</span><span class="pt-pil">Buku PDF</span></div>' +
      '<div class="pt-isi"><div class="pt-sisi"><i></i><i></i><i class="aktif"></i><i></i><i></i><i></i></div>' +
      '<div class="pt-kertas"><div class="pt-judul">Profil Wilayah</div>' +
      '<p class="pt-teks"><span class="pt-awal">R</span>isiko bencana dihitung dari bahaya, kerentanan, dan kapasitas. ' +
      'Nilai yang lebih tinggi menandakan wilayah yang perlu diprioritaskan. <a>Lihat metodologi</a>.</p>' +
      '<div class="pt-baris"><span class="pt-tombol">Unduh PDF</span><span class="pt-tombol garis">Bagikan</span>' +
      '<span class="kelas kelas-tinggi">Tinggi</span><span class="kelas kelas-sedang">Sedang</span><span class="kelas kelas-rendah">Rendah</span>' +
      '<span class="pt-aksen"></span></div></div></div></div>');
  }
  function barisMode() {
    var w = I.el('div', { class: 'irbi-st-mode' });
    var m = I.modeWarna();
    var perangkat = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'gelap' : 'terang';
    w.appendChild(I.el('span', { id: 'irbi-st-l-mode' }, 'Mode warna<small>' + (m === 'sistem' ? 'Mengikuti perangkat (saat ini ' + perangkat + ')' : 'Dipilih manual') + '</small>'));
    var g = segmen('mode', [['terang', '<i class="bi bi-sun"></i> Terang'], ['gelap', '<i class="bi bi-moon-stars"></i> Gelap'], ['sistem', '<i class="bi bi-circle-half"></i> Sistem']], m,
      function (v) { I.aturTema(v); tampilTab('tampilan', true); });
    g.setAttribute('aria-labelledby', 'irbi-st-l-mode');
    w.appendChild(g);
    return w;
  }
  function gayaAktif(g) {
    return KUNCI_BACA.every(function (k) { return sama(nilaiT(k), g.nilai[k] !== undefined ? g.nilai[k] : BAWAAN[k]); });
  }
  function seksiGaya() {
    var aktif = GAYA.filter(gayaAktif)[0];
    var s = seksi('gaya', 'bi-stars', 'Gaya baca siap pakai', aktif ? aktif.nama : 'Kustom (diatur sendiri)');
    var g = I.el('div', { class: 'irbi-st-gaya', role: 'group', 'aria-label': 'Gaya baca siap pakai' });
    var gelap = I.gelap();
    GAYA.forEach(function (x) {
      var v = function (k) { return x.nilai[k] !== undefined ? x.nilai[k] : BAWAAN[k]; };
      var kt = kertasDari(v('kertas')), on = aktif === x;
      var celah = { rapat: 2, normal: 3, lega: 5 }[v('spasi')];
      var garis = '<s style="gap:' + celah + 'px"><span></span><span></span><span></span></s>';
      var k = I.el('button', { type: 'button', class: 'irbi-st-gaya-kartu' + (on ? ' aktif' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-fokus': 'gaya:' + x.id },
        '<span class="cth" aria-hidden="true" style="background:' + (gelap ? kt.kertasG : kt.kertas) + ';color:' + (gelap ? kt.teksG : kt.teks) + '">' +
        '<i style="font-family:' + I.esc(tumpukan(v('fontIsi'))) + ';font-size:' + (v('ukuran') / 16 * 1.1).toFixed(2) + 'rem">Aa</i>' +
        garis + (v('kolom') === 'buku' ? garis : '') + '</span><b>' + x.nama + '</b><small>' + x.ket + '</small>');
      k.addEventListener('click', function () {
        var p = {};
        KUNCI_BACA.forEach(function (kk) { p[kk] = v(kk); });
        if (aturBanyak(p)) { gambarUlang(); umumkan('Gaya ' + x.nama + ' diterapkan.'); }
      });
      g.appendChild(k);
    });
    s.isi.appendChild(g);
    s.isi.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Mengatur huruf, ukuran, spasi, kolom, dan nuansa kertas sekaligus. Warna tema dan peta tidak berubah. Rinciannya bisa diatur di bagian bawah.'));
    return s.el;
  }
  function seksiTema() {
    var primer = nilaiT('primer'), aksen = nilaiT('aksen');
    var t0 = TEMA.filter(function (t) { return sama(t.primer, primer) && sama(t.aksen, aksen); })[0];
    var s = seksi('tema', 'bi-palette', 'Tema warna', titik(primer) + titik(aksen) + ' ' + (t0 ? t0.nama : 'Kustom'), ['primer', 'aksen']);
    var g = I.el('div', { class: 'irbi-st-tema', role: 'group', 'aria-label': 'Tema warna siap pakai' });
    TEMA.forEach(function (t) {
      var on = t === t0;
      var k = I.el('button', { type: 'button', class: 'irbi-st-tema-kartu' + (on ? ' aktif' : ''), 'aria-pressed': on ? 'true' : 'false', title: 'Tema ' + t.nama, 'data-fokus': 'tema:' + t.id },
        '<span class="cth" aria-hidden="true" style="background:linear-gradient(135deg,' + t.primer + ' 0 60%,' + t.aksen + ' 60% 100%)"></span>' + t.nama);
      k.addEventListener('click', function () { if (aturBanyak({ primer: t.primer, aksen: t.aksen })) gambarUlang(); });
      g.appendChild(k);
    });
    s.isi.appendChild(g);
    s.isi.appendChild(baris('Warna utama', kontrolWarna('primer', 'Warna utama'), 'primer', { ket: 'Navigasi, tombol, judul' }));
    s.isi.appendChild(baris('Warna aksen', kontrolWarna('aksen', 'Warna aksen'), 'aksen', { ket: 'Penanda & sorotan' }));
    s.isi.appendChild(petunjukKontras(primer));
    var aksi = I.el('div', { class: 'irbi-st-baris-aksi' });
    var acak = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', 'data-fokus': 'tema:acak', title: 'Buat pasangan warna utama & aksen secara acak' },
      '<i class="bi bi-shuffle"></i> Acak warna');
    acak.addEventListener('click', function () { if (acakWarna()) gambarUlang(); });
    var serasi = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', 'data-fokus': 'tema:serasi', title: 'Pilih aksen yang serasi dengan warna utama' },
      '<i class="bi bi-magic"></i> Aksen serasi');
    serasi.addEventListener('click', function () { if (aturT('aksen', aksenSerasi(nilaiT('primer')))) gambarUlang(); });
    aksi.appendChild(acak); aksi.appendChild(serasi);
    s.isi.appendChild(aksi);
    s.isi.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Warna turunan (tautan, judul bab, versi mode gelap) dihitung otomatis dari warna utama. Berlaku juga untuk PDF yang dibuat di peramban.'));
    resetBagian(s);
    return s.el;
  }
  function seksiKelas() {
    var kunci = I.KELAS.map(function (k) { return 'kelas.' + k; });
    var kelas = {};
    I.KELAS.forEach(function (k) { kelas[k] = nilaiT('kelas.' + k); });
    var p0 = PALET.filter(function (p) { return I.KELAS.every(function (k) { return sama(p[k], kelas[k]); }); })[0];
    var s = seksi('kelas', 'bi-circle-half', 'Warna kelas risiko', I.KELAS.map(function (k) { return titik(kelas[k]); }).join('') + ' ' + (p0 ? p0.nama : 'Kustom'), kunci);
    var g = I.el('div', { class: 'irbi-st-palet', role: 'group', 'aria-label': 'Palet warna kelas risiko' });
    PALET.forEach(function (p) {
      var on = p === p0;
      var k = I.el('button', { type: 'button', class: 'irbi-st-palet-kartu' + (on ? ' aktif' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-fokus': 'palet:' + p.id },
        '<span class="cth" aria-hidden="true">' + I.KELAS.map(function (x) { return '<i style="background:' + p[x] + '"></i>'; }).join('') + '</span>' + p.nama);
      k.addEventListener('click', function () {
        var m = {};
        I.KELAS.forEach(function (x) { m['kelas.' + x] = p[x]; });
        if (aturBanyak(m)) gambarUlang();
      });
      g.appendChild(k);
    });
    s.isi.appendChild(g);
    I.KELAS.forEach(function (k) { s.isi.appendChild(baris('Kelas ' + I.LABEL[k].toLowerCase(), kontrolWarna('kelas.' + k, 'Kelas ' + I.LABEL[k].toLowerCase()), 'kelas.' + k)); });
    s.isi.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Dipakai peta, lencana, grafik, tabel, dan PDF yang dibuat di peramban. Warna teks pada lencana menyesuaikan otomatis agar tetap terbaca.'));
    resetBagian(s);
    return s.el;
  }
  function seksiBacaan() {
    var kunci = ['kertas', 'spasi', 'kolom', 'rata', 'kontras', 'hurufAwal'];
    var kt = kertasDari(nilaiT('kertas'));
    var s = seksi('bacaan', 'bi-book', 'Kertas & bacaan', [kt.id === 'bawaan' ? 'Kertas bawaan' : 'Kertas ' + kt.nama.toLowerCase(),
      'spasi ' + nilaiT('spasi'), nilaiT('kolom') === 'satu' ? 'satu kolom' : 'kolom buku', nilaiT('kontras') === 'tinggi' ? 'kontras tinggi' : ''].filter(Boolean).join(' · '), kunci);
    s.isi.appendChild(baris('Nuansa kertas', kontrolKertas(), 'kertas', { tumpuk: true }));
    s.isi.appendChild(baris('Spasi baris', segmen('k:spasi', [['rapat', 'Rapat'], ['normal', 'Normal'], ['lega', 'Lega']], nilaiT('spasi'), setel('spasi')), 'spasi'));
    s.isi.appendChild(baris('Tata letak teks', segmen('k:kolom', [['buku', 'Kolom buku'], ['satu', 'Satu kolom']], nilaiT('kolom'), setel('kolom')), 'kolom'));
    s.isi.appendChild(baris('Perataan', segmen('k:rata', [['kiri', 'Rata kiri'], ['rata', 'Kiri-kanan']], nilaiT('rata'), setel('rata')), 'rata', { ket: 'Kiri-kanan paling rapi pada satu kolom' }));
    s.isi.appendChild(baris('Kontras teks', segmen('k:kontras', [['normal', 'Normal'], ['tinggi', 'Tinggi']], nilaiT('kontras'), setel('kontras')), 'kontras', { ket: 'Teks & garis lebih tegas' }));
    s.isi.appendChild(baris('Huruf awal besar', sakelar('k:hurufAwal', 'Tampilkan', nilaiT('hurufAwal') !== false, setel('hurufAwal')), 'hurufAwal', { ket: 'Di paragraf pembuka' }));
    resetBagian(s);
    return s.el;
  }
  function seksiHuruf() {
    var kunci = ['ukuran', 'fontJudul', 'fontIsi', 'fontUI'];
    var s = seksi('huruf', 'bi-fonts', 'Huruf', I.esc(namaFont(nilaiT('fontJudul')) + ' / ' + namaFont(nilaiT('fontIsi')) + ' · ' + nilaiT('ukuran') + 'px'), kunci);
    s.isi.appendChild(baris('Ukuran teks', kontrolUkuran(), 'ukuran'));
    s.isi.appendChild(baris('Huruf judul', kontrolFont('fontJudul', 'Huruf judul', 'Indeks Risiko Bencana'), 'fontJudul'));
    s.isi.appendChild(baris('Huruf paragraf', kontrolFont('fontIsi', 'Huruf paragraf', 'Bahaya, kerentanan, kapasitas'), 'fontIsi'));
    s.isi.appendChild(baris('Huruf antarmuka', kontrolFont('fontUI', 'Huruf antarmuka', 'Menu, tombol, tabel 0123'), 'fontUI', { ket: 'Menu, tombol, tabel' }));
    s.isi.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Huruf selain Georgia dan huruf sistem diunduh dari Google Fonts saat dipilih.'));
    resetBagian(s);
    return s.el;
  }
  function seksiAntarmuka() {
    var kunci = ['kepala', 'kepadatan', 'radius', 'animasi'];
    var s = seksi('antarmuka', 'bi-window', 'Antarmuka', ['Kepala ' + (nilaiT('kepala') === 'warna' ? 'berwarna' : 'terang'), nilaiT('kepadatan'),
      'sudut ' + nilaiT('radius') + 'px', nilaiT('animasi') === false ? 'tanpa animasi' : 'animasi nyala'].join(' · '), kunci);
    s.isi.appendChild(baris('Kepala halaman', segmen('k:kepala', [['terang', 'Terang'], ['warna', 'Warna utama']], nilaiT('kepala'), setel('kepala')), 'kepala'));
    s.isi.appendChild(baris('Kepadatan', segmen('k:kepadatan', [['lega', 'Lega'], ['ringkas', 'Ringkas']], nilaiT('kepadatan'), setel('kepadatan')), 'kepadatan', { ket: 'Jarak antar-kartu' }));
    s.isi.appendChild(baris('Sudut membulat', kontrolGeser('radius', 0, 22, 1, function (x) { return x + 'px'; }, 'Sudut membulat'), 'radius'));
    s.isi.appendChild(baris('Animasi', sakelar('k:animasi', 'Animasi & transisi', nilaiT('animasi') !== false, setel('animasi')), 'animasi'));
    resetBagian(s);
    return s.el;
  }
  function seksiPeta() {
    var kunci = ['peta.dasar', 'peta.opasitas', 'peta.label', 'peta.batas'];
    var d0 = DASAR_PETA.filter(function (d) { return d[0] === nilaiT('peta.dasar'); })[0] || DASAR_PETA[0];
    var s = seksi('peta', 'bi-map', 'Peta', d0[1].replace(/ \(.*\)$/, '') + ' · opasitas ' + Math.round(nilaiT('peta.opasitas') * 100) + '%', kunci);
    var sd = I.el('select', { class: 'form-select form-select-sm', 'aria-label': 'Peta dasar', 'data-fokus': 'k:peta.dasar' });
    DASAR_PETA.forEach(function (o) { sd.appendChild(I.el('option', { value: o[0], text: o[1] })); });
    sd.value = nilaiT('peta.dasar');
    sd.addEventListener('change', function () { if (aturT('peta.dasar', sd.value)) gambarUlang(); });
    s.isi.appendChild(baris('Peta dasar', sd, 'peta.dasar'));
    s.isi.appendChild(baris('Opasitas wilayah', kontrolGeser('peta.opasitas', 0.3, 1, 0.02, function (x) { return Math.round(x * 100) + '%'; }, 'Opasitas warna wilayah'), 'peta.opasitas'));
    s.isi.appendChild(baris('Label wilayah', sakelar('k:peta.label', 'Peta provinsi', nilaiT('peta.label') !== false, setel('peta.label')), 'peta.label'));
    s.isi.appendChild(baris('Batas provinsi', sakelar('k:peta.batas', 'Peta nasional', nilaiT('peta.batas') !== false, setel('peta.batas')), 'peta.batas'));
    resetBagian(s);
    return s.el;
  }
  function seksiGayaSaya() {
    var daftar = gayaSaya();
    var s = seksi('saya', 'bi-bookmark-heart', 'Gaya saya & berbagi', daftar.length ? daftar.length + ' gaya tersimpan' : 'Simpan, ekspor, atau impor tampilan');
    var kini = jsonUrut(I.tampilan.efektif()), gelap = I.gelap();
    var w = I.el('div', { class: 'irbi-st-gaya-saya' });
    if (!daftar.length) w.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Belum ada gaya tersimpan. Atur tampilan sesuai selera, beri nama, lalu simpan agar bisa dipakai lagi dengan satu klik.'));
    daftar.forEach(function (g, i) {
      var t = I.tampilan.bersih(g.tampilan), on = jsonUrut(t) === kini, kt = kertasDari(t.kertas);
      var item = I.el('div', { class: 'irbi-st-gs-item' + (on ? ' aktif' : '') });
      item.appendChild(I.el('span', { class: 'cth', 'aria-hidden': 'true', style: 'background:linear-gradient(135deg,' + (t.primer || BAWAAN.primer) + ' 0 45%,' +
        (t.aksen || BAWAAN.aksen) + ' 45% 62%,' + (gelap ? kt.kertasG : kt.kertas) + ' 62%)' }));
      item.appendChild(I.el('span', { class: 'nama' }, '<b>' + I.esc(g.nama) + '</b><small>' + (on ? 'Sedang dipakai' : I.esc(ringkasGaya(t))) + '</small>'));
      var aksi = I.el('span', { class: 'aksi' });
      var pakai = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', 'data-fokus': 'saya:pakai:' + i, disabled: on ? 'disabled' : null }, 'Pakai');
      pakai.addEventListener('click', function () { if (gantiT(t)) { gambarUlang(); umumkan('Gaya ' + g.nama + ' diterapkan.'); } });
      var hapus = I.el('button', { type: 'button', class: 'irbi-st-reset', title: 'Hapus gaya', 'aria-label': 'Hapus gaya ' + g.nama, 'data-fokus': 'saya:hapus:' + i },
        '<i class="bi bi-trash3"></i>');
      hapus.addEventListener('click', function () {
        if (!confirm('Hapus gaya "' + g.nama + '" dari peramban ini?')) return;
        var a = gayaSaya();
        a.splice(i, 1);
        if (simpanGayaSaya(a)) gambarUlang();
      });
      aksi.appendChild(pakai); aksi.appendChild(hapus);
      item.appendChild(aksi);
      w.appendChild(item);
    });
    s.isi.appendChild(w);
    var f = I.el('form', { class: 'irbi-st-gs-form' });
    var inp = I.el('input', { type: 'text', class: 'form-control form-control-sm', placeholder: 'Nama gaya, mis. Presentasi', maxlength: '40', 'aria-label': 'Nama gaya baru', 'data-fokus': 'saya:nama' });
    f.appendChild(inp);
    f.appendChild(I.el('button', { type: 'submit', class: 'btn btn-sm btn-irbi', 'data-fokus': 'saya:simpan' }, '<i class="bi bi-bookmark-plus"></i> Simpan tampilan ini'));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var nama = inp.value.trim().replace(/\s+/g, ' ').slice(0, 40) || ('Gaya ' + (gayaSaya().length + 1));
      var a = gayaSaya().filter(function (g) { return g.nama.toLowerCase() !== nama.toLowerCase(); });     // nama sama → diganti
      a.unshift({ nama: nama, tampilan: I.tampilan.efektif(), dibuat: new Date().toISOString() });
      if (simpanGayaSaya(a.slice(0, 20))) { I.toast('Gaya <b>' + I.esc(nama) + '</b> disimpan.', 'sukses'); gambarUlang(); }
    });
    s.isi.appendChild(f);
    var aksi2 = I.el('div', { class: 'irbi-st-baris-aksi' });
    var eks = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', 'data-fokus': 'saya:ekspor' }, '<i class="bi bi-box-arrow-down"></i> Ekspor tampilan');
    eks.addEventListener('click', eksporTampilan);
    var imp = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', 'data-fokus': 'saya:impor' }, '<i class="bi bi-box-arrow-in-up"></i> Impor tampilan');
    imp.addEventListener('click', imporTampilan);
    aksi2.appendChild(eks); aksi2.appendChild(imp);
    s.isi.appendChild(aksi2);
    s.isi.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Gaya tersimpan hanya ada di peramban ini. <b>Ekspor tampilan</b> menghasilkan berkas .json untuk perangkat lain atau rekan kerja. ' +
      'Agar semua pembaca melihat tampilan yang sama, gunakan tab <b>Simpan</b> → Terbitkan.'));
    return s.el;
  }
  function tabTampilan(b) {
    b.appendChild(pratinjau());
    b.appendChild(barisMode());
    [seksiGaya, seksiTema, seksiKelas, seksiBacaan, seksiHuruf, seksiAntarmuka, seksiPeta, seksiGayaSaya].forEach(function (fn) { b.appendChild(fn()); });
  }

  // ------------------------------------------------------------------ tab Teks
  function cuplik(html, n) {
    var t = new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
    return t.length > (n || 90) ? t.slice(0, n || 90) + '…' : t;
  }
  function judulHalaman(hal) {
    var a = document.querySelector('.irbi-nav-link[data-irbi-href="' + CSS.escape(hal) + '"]');
    return a ? (a.getAttribute('data-irbi-judul') || a.textContent.trim()) : hal.replace(/\.html$/, '');
  }
  function itemTeks(k, e, diSini) {
    var item = I.el('div', { class: 'irbi-st-item' });
    item.appendChild(I.el('div', { class: 'irbi-st-item-teks' }, '<b>' + I.esc(cuplik(e.html, 80)) + '</b><span>Asli: ' + I.esc(cuplik(e.asli, 70)) + '</span>'));
    var aksi = I.el('div', { class: 'irbi-st-item-aksi' });
    if (diSini) {
      var lihat = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Tampilkan di halaman', 'aria-label': 'Tampilkan di halaman' }, '<i class="bi bi-eye"></i>');
      lihat.addEventListener('click', function () {
        var el = document.querySelector('[data-irbi-kunci="' + CSS.escape(k) + '"]');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('irbi-kedip'); setTimeout(function () { el.classList.remove('irbi-kedip'); }, 1600); }
      });
      aksi.appendChild(lihat);
    }
    var balik = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Kembalikan ke teks asli', 'aria-label': 'Kembalikan ke teks asli' }, '<i class="bi bi-arrow-counterclockwise"></i>');
    balik.addEventListener('click', function () { I.teks.kembalikan(k); tampilTab('teks', true); });
    aksi.appendChild(balik);
    item.appendChild(aksi);
    return item;
  }
  function tabTeks(b) {
    var w = I.el('div');
    w.appendChild(sakelar('teks:edit', 'Mode edit teks di halaman ini', I.teks.aktif, function (v) {
      I.teks.mode(v);
      if (v) I.toast('Mode edit aktif: klik paragraf atau judul untuk mengubahnya.', 'info', 4500);
    }));
    w.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Klik paragraf, judul, atau butir daftar untuk mengedit. Gunakan <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> dan <kbd>Ctrl/⌘</kbd>+<kbd>I</kbd> untuk tebal dan miring. Perubahan tersimpan otomatis. Tabel, peta, dan angka ringkasan mengikuti data, jadi ubah lewat tab Data.'));
    b.appendChild(bagian('Edit langsung', w));

    var semua = S.efektif().teks, hal = I.halaman();
    var kunci = Object.keys(semua).filter(function (k) { return semua[k]; });
    var kunciHal = kunci.filter(function (k) { return k.indexOf(hal + '::') === 0; });
    var daftar = I.el('div', { class: 'irbi-st-daftar' });
    if (!kunciHal.length) daftar.appendChild(I.el('p', { class: 'irbi-st-ket' }, 'Belum ada teks yang diubah di halaman ini.'));
    kunciHal.forEach(function (k) { daftar.appendChild(itemTeks(k, semua[k], true)); });
    b.appendChild(bagian('Perubahan di halaman ini (' + kunciHal.length + ')', daftar));

    // perubahan di halaman lain, dikelompokkan per halaman dengan tautan untuk membukanya
    var lain = {};
    kunci.forEach(function (k) { var h = k.split('::')[0]; if (h !== hal) (lain[h] = lain[h] || []).push(k); });
    var hs = Object.keys(lain).sort(function (x, y) { return judulHalaman(x).localeCompare(judulHalaman(y), 'id'); });
    if (hs.length) {
      var wl = I.el('div', { class: 'irbi-st-daftar' });
      hs.forEach(function (h) {
        var kotak = I.el('div', { class: 'irbi-st-hal' });
        var kepala = I.el('header');
        kepala.appendChild(I.el('b', { text: judulHalaman(h) + ' (' + lain[h].length + ')' }));
        if (/^[\w\-\/]+\.html$/.test(h)) kepala.appendChild(I.el('a', { href: I.akar + h }, 'Buka <i class="bi bi-arrow-right-short"></i>'));
        kotak.appendChild(kepala);
        lain[h].slice(0, 4).forEach(function (k) { kotak.appendChild(itemTeks(k, semua[k], false)); });
        if (lain[h].length > 4) kotak.appendChild(I.el('p', { class: 'irbi-st-ket', style: 'margin:.45rem .6rem' }, '+ ' + (lain[h].length - 4) + ' perubahan lain di halaman ini'));
        wl.appendChild(kotak);
      });
      b.appendChild(bagian('Halaman lain (' + (kunci.length - kunciHal.length) + ')', wl));
    }

    var total = kunci.length;
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


  BADAN.tampilan = tabTampilan;
  BADAN.teks = tabTeks;
  BADAN.data = tabData;
  BADAN.simpan = tabSimpan;

  I.studio = { buka: buka, tutup: tutup, pasangPaket: pasangPaket, imporCSV: imporCSV, terapkanImpor: terapkanImpor, alurImporCSV: alurImporCSV,
    ringkasImpor: ringkasImpor, pilihBerkas: pilihBerkas, eksporPaket: eksporPaket, terbitkan: terbitkan,
    eksporTampilan: eksporTampilan, urungkan: function () { langkah(-1); }, ulangi: function () { langkah(1); } };
})();
