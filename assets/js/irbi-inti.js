/* IRBI 2025 — inti aplikasi.
 * Pemuat modul, data efektif (data buku + kustomisasi), penyimpanan kustomisasi tanpa server
 * (localStorage + paket terbit assets/kustom/irbi-kustom.js), tampilan, teks, dan pemasangan komponen.
 * Dimuat oleh assets/html/kepala.html di setiap halaman.
 */
(function () {
  'use strict';
  if (window.IRBI && window.IRBI.inti) return;

  var meta = document.querySelector('meta[name="quarto:offset"]');
  var AKAR = window.IRBI_AKAR || (meta ? meta.getAttribute('content') : './');
  var I = window.IRBI = Object.assign(window.IRBI || {}, { inti: true, akar: AKAR, versi: '2.0' });
  var KUNCI = 'irbi2025:kustom:v1';
  var KUNCI_GAYA = 'irbi2025:gaya';
  I.KELAS = ['TINGGI', 'SEDANG', 'RENDAH'];
  I.LABEL = { TINGGI: 'Tinggi', SEDANG: 'Sedang', RENDAH: 'Rendah', TANPA: 'Tidak dinilai' };

  // ================================================================== utilitas
  I.fmt = function (x, nd) {
    if (x === null || x === undefined || isNaN(x)) return '–';
    nd = nd === undefined ? 2 : nd;
    return Number(x).toLocaleString('id-ID', { minimumFractionDigits: nd, maximumFractionDigits: nd });
  };
  I.angka = function (s) {
    if (typeof s === 'number') return s;
    s = String(s === null || s === undefined ? '' : s).trim();
    if (!s) return NaN;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') >= 0) s = s.replace(',', '.');
    return parseFloat(s);
  };
  I.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  I.judul = function (s) {
    return String(s || '').toLowerCase().replace(/(^|[\s\-(./])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\bDki\b/g, 'DKI').replace(/\bDan\b/g, 'dan');
  };
  I.slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  I.el = function (tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  I.hash = function (s) {               // FNV-1a 32-bit
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  I.tunda = function (fn, ms) {
    var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms || 200); };
  };
  I.selCSV = function (v) {
    v = String(v === null || v === undefined ? '' : v);
    return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  I.keCSV = function (baris) { return baris.map(function (r) { return r.map(I.selCSV).join(','); }).join('\n') + '\n'; };
  I.unduh = function (isi, nama, tipe) {
    tipe = tipe || 'text/csv;charset=utf-8';
    var blob = isi instanceof Blob ? isi : new Blob([(/csv/.test(tipe) ? '﻿' : '') + isi], { type: tipe });
    var a = I.el('a', { href: URL.createObjectURL(blob), download: nama });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  I.salin = function (teks) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(teks);
    return new Promise(function (ok, gagal) {
      var t = I.el('textarea', { style: 'position:fixed;left:-9999px' });
      t.value = teks; document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : gagal(new Error('salin gagal')); } catch (e) { gagal(e); }
      t.remove();
    });
  };
  I.bacaBerkas = function (file) {
    return new Promise(function (ok, gagal) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result || '').replace(/^﻿/, '')); };
      r.onerror = function () { gagal(r.error); };
      r.readAsText(file, 'utf-8');
    });
  };
  /** Parser CSV sederhana: tanda kutip, pemisah koma/titik koma, baris CRLF. */
  I.parseCSV = function (teks) {
    var baris1 = teks.split(/\r?\n/)[0] || '';
    var sep = (baris1.split(';').length > baris1.split(',').length) ? ';' : ',';
    var out = [], row = [], sel = '', kutip = false;
    for (var i = 0; i < teks.length; i++) {
      var c = teks[i];
      if (kutip) {
        if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; }
        else if (c === '"') kutip = false;
        else sel += c;
      } else if (c === '"') kutip = true;
      else if (c === sep) { row.push(sel); sel = ''; }
      else if (c === '\n') { row.push(sel); out.push(row); row = []; sel = ''; }
      else if (c !== '\r') sel += c;
    }
    if (sel !== '' || row.length) { row.push(sel); out.push(row); }
    out = out.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    if (!out.length) return [];
    var kepala = out[0].map(function (h) { return h.trim().toLowerCase(); });
    return out.slice(1).map(function (r) {
      var o = {}; kepala.forEach(function (h, j) { o[h] = (r[j] || '').trim(); }); return o;
    });
  };

  // ------------------------------------------------------------------ toast
  I.toast = function (pesan, jenis, ms) {
    var wadah = document.querySelector('.irbi-toast-wadah');
    if (!wadah) { wadah = I.el('div', { class: 'irbi-toast-wadah', 'aria-live': 'polite' }); document.body.appendChild(wadah); }
    var ikon = { sukses: 'bi-check-circle-fill', galat: 'bi-exclamation-octagon-fill', proses: 'bi-hourglass-split', info: 'bi-info-circle-fill' }[jenis || 'info'];
    var t = I.el('div', { class: 'irbi-toast irbi-toast-' + (jenis || 'info'), role: 'status' },
      '<i class="bi ' + ikon + '"></i><span>' + pesan + '</span>');
    wadah.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('tampil'); });
    var tutup = function () { t.classList.remove('tampil'); setTimeout(function () { t.remove(); }, 300); };
    if (ms !== 0) setTimeout(tutup, ms || 3800);
    return { tutup: tutup, ubah: function (p, j) { t.querySelector('span').innerHTML = p; if (j) { t.className = 'irbi-toast tampil irbi-toast-' + j; } } };
  };

  // ================================================================== pemuat
  var janji = {};
  I.skrip = function (rel) {
    if (!janji[rel]) {
      janji[rel] = new Promise(function (ok, gagal) {
        var s = document.createElement('script');
        s.src = AKAR + rel + (rel.indexOf('?') < 0 ? '?v=' + (window.IRBI_VERSI || 'dev') : '');
        s.onload = function () { ok(); };
        s.onerror = function () { delete janji[rel]; gagal(new Error('Gagal memuat ' + rel)); };
        document.head.appendChild(s);
      });
    }
    return janji[rel];
  };
  I.gayaBerkas = function (rel) {
    if (document.querySelector('link[data-irbi="' + rel + '"]')) return;
    document.head.appendChild(I.el('link', { rel: 'stylesheet', href: AKAR + rel + '?v=' + (window.IRBI_VERSI || 'dev'), 'data-irbi': rel }));
  };
  I.modul = function (nama) { return I.skrip('assets/js/irbi-' + nama + '.js'); };
  I.muatData = function () { return I.skrip('assets/data/irbi-data.js').then(siapkanData); };
  I.muatGeo = function () { return I.skrip('assets/data/irbi-geo.js').then(function () { return window.IRBI_GEO; }); };
  I.muatGeoDetail = function () { return I.skrip('assets/data/irbi-geo-detail.js').then(function () { return window.IRBI_GEO_DETAIL; }); };
  I.muatLeaflet = function () { I.gayaBerkas('assets/vendor/leaflet/leaflet.css'); return I.skrip('assets/vendor/leaflet/leaflet.js'); };
  I.muatPdf = function () {
    return I.skrip('assets/vendor/jspdf/jspdf.umd.min.js').then(function () {
      return Promise.all([I.skrip('assets/vendor/jspdf/svg2pdf.umd.min.js'),
        I.skrip('assets/vendor/jspdf/jspdf.plugin.autotable.min.js'), I.skrip('assets/data/irbi-aset.js')]);
    });
  };
  I.muatPeta = function () {
    return Promise.all([I.muatData(), I.muatGeo(), I.muatLeaflet()]).then(function () { return I.modul('peta'); });
  };

  // ================================================================== data
  var D = null;
  function siapkanData() {
    if (D) return D;
    D = window.IRBI_DATA;
    D.idx = { jenis: {}, prov: {}, kab: {}, kabProv: {} };
    D.jenis.forEach(function (j) { D.idx.jenis[j.slug] = j; });
    D.provinsi.forEach(function (p) { D.idx.prov[p.kode] = p; D.idx.kabProv[p.kode] = []; });
    D.kabkota.forEach(function (k) { D.idx.kab[k.kode] = k; (D.idx.kabProv[k.prov] = D.idx.kabProv[k.prov] || []).push(k.kode); });
    I.D = D;
    return D;
  }

  // ================================================================== kustomisasi (tanpa server)
  function kosong() {
    return { versi: 1, data: { kabkota: {}, provinsi: {}, ancaman: {}, ambang: {} }, tampilan: {}, teks: {} };
  }
  function normal(k) {
    var o = kosong();
    if (!k || typeof k !== 'object') return o;
    var d = k.data || {};
    ['kabkota', 'provinsi', 'ambang'].forEach(function (b) { if (d[b] && typeof d[b] === 'object') o.data[b] = d[b]; });
    if (d.ancaman && typeof d.ancaman === 'object') o.data.ancaman = d.ancaman;
    if (k.tampilan && typeof k.tampilan === 'object') o.tampilan = k.tampilan;
    if (k.teks && typeof k.teks === 'object') o.teks = k.teks;
    if (k.meta) o.meta = k.meta;
    return o;
  }
  function bacaLokal() {
    try { return normal(JSON.parse(localStorage.getItem(KUNCI) || 'null')); } catch (e) { return kosong(); }
  }
  function gabungObj(a, b) {            // b menimpa a (rekursif untuk objek biasa)
    var o = {};
    [a || {}, b || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) {
        var v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object') o[k] = gabungObj(o[k], v);
        else o[k] = v;
      });
    });
    return o;
  }
  var S = I.kustom = {
    lokal: bacaLokal(),
    terbit: normal(window.IRBI_KUSTOM_TERBIT),
    efektif: function () {
      var t = this.terbit, l = this.lokal;
      var anc = {};
      Object.keys(t.data.ancaman).concat(Object.keys(l.data.ancaman)).forEach(function (s) {
        anc[s] = Object.assign({}, t.data.ancaman[s] || {}, l.data.ancaman[s] || {});
      });
      return {
        data: {
          kabkota: Object.assign({}, t.data.kabkota, l.data.kabkota),
          provinsi: Object.assign({}, t.data.provinsi, l.data.provinsi),
          ancaman: anc,
          ambang: Object.assign({}, t.data.ambang, l.data.ambang)
        },
        tampilan: gabungObj(t.tampilan, l.tampilan),
        teks: Object.assign({}, t.teks, l.teks)
      };
    },
    simpan: function () {
      try { localStorage.setItem(KUNCI, JSON.stringify(this.lokal)); return true; }
      catch (e) { I.toast('Penyimpanan peramban tidak tersedia; perubahan hanya berlaku sampai halaman ditutup.', 'galat', 6000); return false; }
    },
    ubah: function (bagian, fn, opsi) {
      fn(this.lokal);
      this.lokal.meta = { diubah: new Date().toISOString(), oleh: 'Studio IRBI' };
      this.simpan();
      kabar(bagian, opsi);
    },
    ganti: function (obj) { this.lokal = normal(obj); this.simpan(); kabar('semua'); },
    hapus: function (bagian) {
      var self = this;
      if (!bagian || bagian === 'semua') self.lokal = kosong();
      else if (bagian === 'data') self.lokal.data = kosong().data;
      else self.lokal[bagian] = {};
      self.simpan(); kabar(bagian || 'semua');
    },
    jumlah: function (k) {
      k = k || this.efektif();
      var n = function (o) { return Object.keys(o || {}).filter(function (x) { return o[x] !== null && o[x] !== undefined; }).length; };
      var anc = 0;
      Object.keys(k.data.ancaman).forEach(function (s) { anc += n(k.data.ancaman[s]); });
      return {
        kabkota: n(k.data.kabkota), provinsi: n(k.data.provinsi), ancaman: anc, ambang: n(k.data.ambang),
        data: n(k.data.kabkota) + n(k.data.provinsi) + anc + n(k.data.ambang),
        tampilan: Object.keys(k.tampilan).length, teks: n(k.teks)
      };
    },
    paket: function () {
      var e = this.efektif();
      return { format: 'irbi-kustom', versi: 1, dibuat: new Date().toISOString(), data: e.data, tampilan: e.tampilan, teks: e.teks };
    }
  };
  function kabar(bagian, opsi) {
    batalCache();
    if (bagian === 'tampilan' || bagian === 'semua') I.tampilan.terapkan();
    if ((bagian === 'teks' || bagian === 'semua') && !(opsi && opsi.diam)) I.teks.terapkan();
    document.dispatchEvent(new CustomEvent('irbi:kustom', { detail: { bagian: bagian } }));
  }
  window.addEventListener('storage', function (e) {     // sinkron antar-tab
    if (e.key === KUNCI) { S.lokal = bacaLokal(); kabar('semua'); }
  });

  // ------------------------------------------------------------------ nilai efektif
  var cache = {};
  function batalCache() { cache = {}; }
  I.jenis = function (slug) {
    siapkanData();
    var j = D.idx.jenis[slug === 'provinsi' ? 'irbi' : slug];
    var a = S.efektif().data.ambang[j.slug];
    return a ? Object.assign({}, j, { batas_sedang: +a.batas_sedang, batas_tinggi: +a.batas_tinggi, diubah: true }) : j;
  };
  I.kelasDari = function (j, skor) {
    if (skor === null || skor === undefined || isNaN(skor)) return null;
    return skor > j.batas_tinggi ? 'TINGGI' : (skor >= j.batas_sedang ? 'SEDANG' : 'RENDAH');
  };
  function asli(indeks, kode) {
    if (indeks === 'provinsi') { var p = D.idx.prov[kode]; return p ? { skor: p.skor, kelas: p.kelas, peringkat: p.peringkat } : null; }
    if (indeks === 'irbi') { var k = D.idx.kab[kode]; return k ? { skor: k.skor, kelas: k.kelas, peringkat: k.peringkat } : null; }
    var v = D.ancaman[indeks] && D.ancaman[indeks][kode];
    return v ? { skor: v[0], kelas: v[1], peringkat: v[2] } : null;
  }
  function tabelEfektif(indeks) {
    if (cache[indeks]) return cache[indeks];
    siapkanData();
    var k = S.efektif();
    var o = indeks === 'provinsi' ? k.data.provinsi : indeks === 'irbi' ? k.data.kabkota : (k.data.ancaman[indeks] || {});
    var j = I.jenis(indeks);
    var ambangUbah = !!j.diubah;
    var kodes = indeks === 'provinsi' ? D.provinsi.map(function (p) { return p.kode; })
      : indeks === 'irbi' ? D.kabkota.map(function (x) { return x.kode; }) : Object.keys(D.ancaman[indeks] || {});
    var m = {}, adaUbah = false;
    var kabUbah = indeks === 'provinsi' ? tabelEfektif('irbi') : null;
    kodes.forEach(function (kode) {
      var a = asli(indeks, kode);
      var u = o[kode];
      var skor = a.skor, sumber = 'buku';
      if (u !== undefined && u !== null && !isNaN(+u) && Math.abs(+u - a.skor) > 1e-9) { skor = +u; sumber = 'studio'; }
      else if (kabUbah) {
        // nilai provinsi = rata-rata kab/kota (seperti di buku) bila ada kab/kota yang diubah
        var anak = D.idx.kabProv[kode] || [];
        if (anak.some(function (x) { return kabUbah[x] && kabUbah[x].diubah; })) {
          skor = anak.reduce(function (s, x) { return s + kabUbah[x].skor; }, 0) / anak.length;
          sumber = 'rata-rata';
        }
      }
      var diubah = sumber !== 'buku';
      if (diubah) adaUbah = true;
      m[kode] = { skor: skor, kelas: (diubah || ambangUbah) ? I.kelasDari(j, skor) : a.kelas, peringkat: a.peringkat,
        asli: a, diubah: diubah, sumber: sumber };
    });
    if (adaUbah) {
      kodes.slice().sort(function (x, y) { return m[y].skor - m[x].skor; }).forEach(function (kode, i) { m[kode].peringkat = i + 1; });
    }
    Object.defineProperty(m, '_total', { value: kodes.length, enumerable: false });
    cache[indeks] = m;
    return m;
  }
  I.nilai = function (indeks, kode) {
    var t = tabelEfektif(indeks), v = t[kode];
    return v ? Object.assign({ total: t._total }, v) : null;
  };
  /** Baris efektif. indeks: 'provinsi' | 'irbi' | slug ancaman. opsi.prov: batasi ke satu provinsi. */
  I.baris = function (indeks, opsi) {
    siapkanData();
    opsi = opsi || {};
    if (indeks === 'provinsi') {
      return D.provinsi.map(function (p) {
        var v = I.nilai('provinsi', p.kode);
        return Object.assign({ kode: p.kode, nama: p.nama, namaBuku: p.nama_buku, prov: p.kode, provNama: p.nama, seb: p.seb, dinilai: true }, v);
      });
    }
    var out = [];
    D.kabkota.forEach(function (k) {
      if (opsi.prov && k.prov !== opsi.prov) return;
      var v = I.nilai(indeks, k.kode);
      var p = D.idx.prov[k.prov];
      out.push(Object.assign({ kode: k.kode, nama: k.nama, prov: k.prov, provNama: p.nama, provBuku: p.nama_buku, dinilai: !!v },
        v || { skor: null, kelas: null, peringkat: null, diubah: false }));
    });
    return out;
  };
  I.namaIndeks = function (indeks, pendek) {
    if (indeks === 'provinsi' || indeks === 'irbi') return pendek ? 'Multi-bahaya' : 'Multi-bahaya (IRBI)';
    return I.jenis(indeks).nama;
  };

  // ================================================================== tampilan
  var FONT = {
    'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@500;600;700;800',
    'Source Sans 3': 'Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400',
    'Inter': 'Inter:wght@400;500;600;700;800',
    'Poppins': 'Poppins:wght@400;500;600;700',
    'Nunito Sans': 'Nunito+Sans:wght@400;600;700;800',
    'IBM Plex Sans': 'IBM+Plex+Sans:wght@400;500;600;700',
    'Merriweather': 'Merriweather:ital,wght@0,400;0,700;1,400',
    'Lora': 'Lora:ital,wght@0,400;0,600;0,700;1,400',
    'Sistem': null
  };
  I.FONT = FONT;
  function campur(hex, ke, t) {         // campur warna hex dengan warna lain (0..1)
    var a = hexKeRgb(hex), b = hexKeRgb(ke);
    if (!a || !b) return hex;
    return '#' + [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0'); }).join('');
  }
  function hexKeRgb(h) {
    h = String(h || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function terang(hex) { var c = hexKeRgb(hex); if (!c) return false; return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 160; }
  I.warnaUtil = { campur: campur, hexKeRgb: hexKeRgb, terang: terang };
  function tumpukanFont(f, cadangan) {
    if (!f || f === 'Sistem') return 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    return '"' + f + '", ' + cadangan;
  }
  I.tampilan = {
    efektif: function () { return S.efektif().tampilan; },
    nilai: function (jalur, bawaan) {
      var o = this.efektif();
      jalur.split('.').forEach(function (k) { o = o && o[k]; });
      return (o === undefined || o === null || o === '') ? bawaan : o;
    },
    css: function (t) {
      var r = [], g = [];
      if (t.primer) {
        r.push('--irbi-primer:' + t.primer, '--irbi-primer-2:' + campur(t.primer, '#ffffff', 0.18),
          '--irbi-tautan:' + campur(t.primer, '#1F6F86', 0.35), '--irbi-judul:' + t.primer,
          '--irbi-primer-lembut:' + campur(t.primer, '#ffffff', 0.9));
        g.push('--irbi-primer:' + campur(t.primer, '#000000', 0.15), '--irbi-primer-2:' + t.primer,
          '--irbi-tautan:' + campur(t.primer, '#ffffff', 0.55), '--irbi-judul:' + campur(t.primer, '#ffffff', 0.78),
          '--irbi-primer-lembut:' + campur(t.primer, '#000000', 0.55));
      }
      if (t.aksen) {
        r.push('--irbi-aksen:' + t.aksen, '--irbi-aksen-2:' + campur(t.aksen, '#ffffff', 0.45));
        g.push('--irbi-aksen:' + campur(t.aksen, '#ffffff', 0.2), '--irbi-aksen-2:' + campur(t.aksen, '#ffffff', 0.5));
      }
      var k = t.kelas || {};
      if (k.TINGGI) r.push('--irbi-tinggi:' + k.TINGGI, '--irbi-tinggi-teks:' + (terang(k.TINGGI) ? '#1d1d1d' : '#ffffff'));
      if (k.SEDANG) r.push('--irbi-sedang:' + k.SEDANG, '--irbi-sedang-teks:' + (terang(k.SEDANG) ? '#2B2B00' : '#ffffff'));
      if (k.RENDAH) r.push('--irbi-rendah:' + k.RENDAH, '--irbi-rendah-teks:' + (terang(k.RENDAH) ? '#102010' : '#ffffff'));
      if (t.fontJudul) r.push('--irbi-font-judul:' + tumpukanFont(t.fontJudul, 'system-ui, sans-serif'));
      if (t.fontIsi) r.push('--irbi-font-isi:' + tumpukanFont(t.fontIsi, 'system-ui, sans-serif'));
      if (t.ukuran) r.push('--irbi-ukuran:' + (+t.ukuran) + 'px');
      if (t.radius !== undefined && t.radius !== null && t.radius !== '') r.push('--irbi-radius:' + (+t.radius) + 'px', '--irbi-radius-kecil:' + Math.round(+t.radius * 0.55) + 'px');
      var css = '';
      if (r.length) css += ':root{' + r.join(';') + '}';
      if (g.length) css += 'body.quarto-dark{' + g.join(';') + '}';
      return css;
    },
    terapkan: function () {
      var t = this.efektif();
      var css = this.css(t);
      var st = document.getElementById('irbi-gaya-kustom');
      if (!st) { st = I.el('style', { id: 'irbi-gaya-kustom' }); document.head.appendChild(st); }
      st.textContent = css;
      try { css ? localStorage.setItem(KUNCI_GAYA, css) : localStorage.removeItem(KUNCI_GAYA); } catch (e) { /* abaikan */ }
      var html = document.documentElement;
      html.setAttribute('data-irbi-kepadatan', t.kepadatan || 'lega');
      html.setAttribute('data-irbi-animasi', t.animasi === false ? 'mati' : 'nyala');
      [t.fontJudul, t.fontIsi].forEach(function (f) {
        if (f && FONT[f] && !document.querySelector('link[data-irbi-font="' + f + '"]')) {
          document.head.appendChild(I.el('link', { rel: 'stylesheet', 'data-irbi-font': f,
            href: 'https://fonts.googleapis.com/css2?family=' + FONT[f] + '&display=swap' }));
        }
      });
    }
  };
  /** Warna dari variabel CSS (sumber: _brand.yml → SCSS, ditimpa Studio). */
  I.warna = function (nama, cadangan) {
    var v = getComputedStyle(document.body || document.documentElement).getPropertyValue('--irbi-' + nama).trim();
    return v || cadangan || '#999999';
  };
  I.warnaKelas = function (kelas) {
    if (!kelas) return I.warna('tanpa', '#D5D5D5');
    return I.warna(kelas.toLowerCase(), { TINGGI: '#E5242A', SEDANG: '#FFE433', RENDAH: '#2EAD4B' }[kelas]);
  };
  I.gelap = function () { return document.body.classList.contains('quarto-dark'); };

  // ================================================================== teks (edit langsung di halaman)
  var IZIN = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, BR: 1, SUB: 1, SUP: 1, CODE: 1, MARK: 1, SPAN: 1, S: 1 };
  I.bersihkanHTML = function (html) {
    var t = document.createElement('template');
    t.innerHTML = String(html || '');
    (function jalan(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1) { n.remove(); return; }
        jalan(n);
        if (!IZIN[n.tagName]) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); return; }
        Array.prototype.slice.call(n.attributes).forEach(function (a) {
          var ok = n.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:|#|\.{0,2}\/|[\w\-]+\.html)/i.test(a.value);
          if (!ok) n.removeAttribute(a.name);
        });
      });
    })(t.content);
    return t.innerHTML;
  };
  function halamanIni() {
    var akarPath = new URL(AKAR, location.href).pathname;
    var p = location.pathname;
    var rel = p.indexOf(akarPath) === 0 ? p.slice(akarPath.length) : p.split('/').pop();
    return rel || 'index.html';
  }
  I.halaman = halamanIni;
  var normTeks = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  var KECUALI = '.irbi-jelajah,.irbi-peta,.irbi-tabel-wrap,.irbi-kartu-grid,.irbi-studio-data,.irbi-prov-grid,' +
    '.irbi-ancaman-grid,.irbi-grafik,.irbi-pintasan,.quarto-title-meta,nav,pre,code,.katex,.math,svg,script,style,' +
    '.irbi-studio,.irbi-toast-wadah,.callout-header,#quarto-margin-sidebar,.sidebar,#title-block-header .quarto-categories';
  I.teks = {
    sasaran: function () {
      var main = document.querySelector('main#quarto-document-content') || document.querySelector('main');
      if (!main) return [];
      return Array.prototype.slice.call(main.querySelectorAll('h1.title,p.subtitle,h2,h3,h4,p,li,dt,dd,figcaption,blockquote'))
        .filter(function (el) {
          if (el.closest(KECUALI)) return false;
          if (el.tagName === 'LI' && el.querySelector('p,ul,ol')) return false;
          if (el.tagName === 'BLOCKQUOTE' && el.querySelector('p')) return false;
          if (el.querySelector('img,svg,table,iframe,input,select')) return false;
          return normTeks(el.textContent).length > 1;
        });
    },
    siapkan: function () {
      var hal = halamanIni();
      this.sasaran().forEach(function (el) {
        if (!el.dataset.irbiKunci) {
          el.dataset.irbiKunci = hal + '::' + I.hash(normTeks(el.textContent));
          el.dataset.irbiAsliHtml = el.innerHTML;
        }
      });
    },
    terapkan: function () {
      this.siapkan();
      var t = S.efektif().teks;
      document.querySelectorAll('[data-irbi-kunci]').forEach(function (el) {
        var e = t[el.dataset.irbiKunci];
        if (el.isContentEditable && document.activeElement === el) return;
        if (e && e.html !== undefined && e.html !== null) {
          el.innerHTML = I.bersihkanHTML(e.html);
          el.classList.add('irbi-teks-diubah');
        } else if (el.classList.contains('irbi-teks-diubah')) {
          el.innerHTML = el.dataset.irbiAsliHtml;
          el.classList.remove('irbi-teks-diubah');
        }
      });
    },
    simpan: function (el) {
      var kunci = el.dataset.irbiKunci;
      var html = I.bersihkanHTML(el.innerHTML);
      var asliHtml = el.dataset.irbiAsliHtml;
      var sama = normTeks(html) === normTeks(I.bersihkanHTML(asliHtml));
      S.ubah('teks', function (l) {
        if (sama) l.teks[kunci] = null;
        else l.teks[kunci] = { halaman: halamanIni(), asli: normTeks(el.dataset.irbiAsliTeks || el.textContent), html: html, waktu: new Date().toISOString() };
      }, { diam: true });
      el.classList.toggle('irbi-teks-diubah', !sama);
    },
    kembalikan: function (kunci) {
      S.ubah('teks', function (l) { l.teks[kunci] = null; });
    },
    aktif: false,
    mode: function (nyala) {
      var self = this;
      this.siapkan();
      this.aktif = !!nyala;
      document.documentElement.classList.toggle('irbi-mode-edit', this.aktif);
      document.querySelectorAll('[data-irbi-kunci]').forEach(function (el) {
        if (!el.dataset.irbiAsliTeks) el.dataset.irbiAsliTeks = normTeks(new DOMParser().parseFromString(el.dataset.irbiAsliHtml, 'text/html').body.textContent);
        if (self.aktif) {
          el.setAttribute('contenteditable', 'true');
          el.setAttribute('spellcheck', 'true');
          if (!el._irbiEdit) {
            el._irbiEdit = I.tunda(function () { self.simpan(el); }, 500);
            el.addEventListener('input', function () { if (self.aktif) el._irbiEdit(); });
            el.addEventListener('blur', function () { if (self.aktif) self.simpan(el); });
            el.addEventListener('paste', function (e) {   // tempel sebagai teks biasa
              if (!self.aktif) return;
              e.preventDefault();
              var tx = (e.clipboardData || window.clipboardData).getData('text/plain');
              document.execCommand('insertText', false, tx);
            });
          }
        } else {
          el.removeAttribute('contenteditable');
          el.removeAttribute('spellcheck');
        }
      });
      document.dispatchEvent(new CustomEvent('irbi:mode-edit', { detail: { aktif: this.aktif } }));
    }
  };

  // ================================================================== tema terang/gelap
  var kelasGelap = null;
  function pantauTema() {
    var cek = function () {
      var g = I.gelap();
      if (g !== kelasGelap) { kelasGelap = g; document.dispatchEvent(new CustomEvent('irbi:tema', { detail: { gelap: g } })); }
    };
    new MutationObserver(cek).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    cek();
  }
  I.aturTema = function (mode) {      // 'terang' | 'gelap' | 'sistem'
    var ingin = mode === 'sistem' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'gelap';
    if (ingin !== I.gelap() && typeof window.quartoToggleColorScheme === 'function') window.quartoToggleColorScheme();
  };

  // ================================================================== antarmuka umum
  function bilahProgres() {
    var b = I.el('div', { class: 'irbi-progres', 'aria-hidden': 'true' });
    document.body.appendChild(b);
    var atur = function () {
      var h = document.documentElement;
      var maks = h.scrollHeight - h.clientHeight;
      b.style.transform = 'scaleX(' + (maks > 0 ? Math.min(1, h.scrollTop / maks) : 0) + ')';
    };
    window.addEventListener('scroll', atur, { passive: true });
    atur();
  }
  function animasiMuncul() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('irbi-muncul'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.irbi-kartu-grid, .irbi-pintasan, .irbi-prov-grid, .irbi-ancaman-grid, .irbi-grafik, .irbi-jelajah, main h2, .callout, figure')
      .forEach(function (el) { el.classList.add('irbi-akan-muncul'); io.observe(el); });
  }
  function tombolStudio() {
    if (document.querySelector('.irbi-studio-fab')) return;
    var b = I.el('button', { type: 'button', class: 'irbi-studio-fab', 'aria-label': 'Buka Studio: ubah tampilan, teks, dan data', title: 'Studio — sesuaikan tampilan, teks, dan data' },
      '<i class="bi bi-palette2"></i><span>Studio</span>');
    b.addEventListener('click', function () { I.bukaStudio(); });
    document.body.appendChild(b);
    var n = S.jumlah();
    if (n.data || n.tampilan || n.teks) b.classList.add('ada-kustom');
    document.addEventListener('irbi:kustom', function () {
      var j = S.jumlah(); b.classList.toggle('ada-kustom', !!(j.data || j.tampilan || j.teks));
    });
  }
  I.bukaStudio = function (tab) {
    return Promise.all([I.muatData(), I.modul('studio')]).then(function () { I.studio.buka(tab); })
      .catch(function (e) { I.toast('Studio gagal dimuat: ' + I.esc(e.message), 'galat'); });
  };
  function saatTerlihat(el, fn) {
    if (!('IntersectionObserver' in window)) return fn();
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); fn(); }
    }, { rootMargin: '400px' });
    io.observe(el);
  }
  I.saatTerlihat = saatTerlihat;
  function galat(el, e) {
    el.innerHTML = '<div class="irbi-galat"><i class="bi bi-exclamation-triangle"></i> Komponen gagal dimuat: ' + I.esc(e && e.message) + '</div>';
    if (window.console) console.error(e);
  }

  // ================================================================== pemasangan
  function ukurNavbar() {
    var h = document.getElementById('quarto-header');
    var t = h ? Math.round(h.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--irbi-tinggi-navbar', (t || 0) + 'px');
  }
  function pasang() {
    I.tampilan.terapkan();
    pantauTema();
    ukurNavbar();
    window.addEventListener('resize', I.tunda(ukurNavbar, 150));
    I.teks.terapkan();
    bilahProgres();
    tombolStudio();

    var ada = function (s) { return document.querySelector(s); };
    document.querySelectorAll('.irbi-jelajah').forEach(function (el) {
      el.innerHTML = '<div class="irbi-kerangka"><div></div><div></div><div></div></div>';
      saatTerlihat(el, function () {
        I.muatPeta().then(function () { return Promise.all([I.modul('grafik'), I.modul('jelajah')]); })
          .then(function () { new I.Jelajah(el); }).catch(function (e) { galat(el, e); });
      });
    });
    if (ada('.irbi-grafik')) {
      Promise.all([I.muatData(), I.modul('grafik')]).then(function () {
        document.querySelectorAll('.irbi-grafik').forEach(function (el) { I.grafik.pasang(el); });
      }).catch(function (e) { document.querySelectorAll('.irbi-grafik').forEach(function (el) { galat(el, e); }); });
    }
    if (ada('[data-kartu], .irbi-prov-grid, .irbi-ancaman-grid, table.irbi-tabel:not([data-diadopsi])')) {
      Promise.all([I.muatData(), I.modul('statis')]).then(function () { I.statis.pasang(); })
        .catch(function (e) { if (window.console) console.error(e); });
    }
    document.querySelectorAll('.irbi-studio-data').forEach(function (el) {
      el.innerHTML = '<div class="irbi-kerangka"><div></div><div></div></div>';
      I.muatPeta().then(function () { return Promise.all([I.modul('editor'), I.modul('studio')]); })
        .then(function () { new I.EditorData(el); }).catch(function (e) { galat(el, e); });
    });
    document.querySelectorAll('.irbi-studio-paket').forEach(function (el) {
      Promise.all([I.muatData(), I.modul('studio')]).then(function () { I.studio.pasangPaket(el); }).catch(function (e) { galat(el, e); });
    });
    document.querySelectorAll('[data-irbi-buka-studio]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); I.bukaStudio(b.getAttribute('data-irbi-buka-studio') || undefined); });
    });
    if (location.hash === '#studio') I.bukaStudio();
    setTimeout(animasiMuncul, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
