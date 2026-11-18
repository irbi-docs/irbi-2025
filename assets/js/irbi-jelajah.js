/* IRBI 2025 — komponen Jelajah: filter + KPI + peta + tabel + grafik + profil, tersinkron.
 * Mode 'penuh' (halaman Jelajah Data) dan 'sematan' (halaman bab; mengadopsi tabel statis di halaman).
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.Jelajah) return;
  var SEMUA_KELAS = ['TINGGI', 'SEDANG', 'RENDAH', 'TANPA'];
  var nomor = 0;
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); };

  function Jelajah(el) {
    var ds = el.dataset;
    this.el = el;
    this.id = 'irbi-jl-' + (++nomor);
    this.mode = ds.tata === 'penuh' ? 'penuh' : 'sematan';
    this.tingkat = ds.tingkat === 'provinsi' ? 'provinsi' : 'kabkota';
    this.provKunci = ds.kunciProv === 'ya' ? ds.prov : '';
    this.judulDasar = ds.judul || '';
    this.tabelLuar = ds.tabel ? document.getElementById(ds.tabel) : null;
    this.s = {
      indeks: this.tingkat === 'provinsi' ? 'provinsi' : (ds.indeks || 'irbi'),
      prov: this.provKunci || '', kelas: SEMUA_KELAS.slice(), min: null, max: null, q: '',
      urut: { kol: 'skor', arah: -1 }, pilih: null, tab: 'daftar'
    };
    if (this.mode === 'penuh') this.bacaHash();
    this.bangun();
    this.render({ rentang: true, zoom: !!(this.s.prov && !this.provKunci) });
    if (this.s.pilih) this.pilih(this.s.pilih, 'awal');
    var self = this;
    document.addEventListener('irbi:kustom', function (e) { if (!e.detail || e.detail.bagian !== 'teks') self.render(); });
    document.addEventListener('irbi:tema', function () { self.renderGrafik(true); });
    if (this.mode === 'penuh') window.addEventListener('hashchange', function () { if (self._tulisHash) return; self.bacaHash(); self.sinkronKontrol(); self.render({ rentang: true, zoom: true }); if (self.s.pilih) self.pilih(self.s.pilih, 'awal'); });
  }
  var P = Jelajah.prototype;

  // ================================================================== data
  P.lingkup = function () {
    if (this.tingkat === 'provinsi') return I.baris('provinsi');
    return I.baris(this.s.indeks, { prov: this.provKunci || null });
  };
  P.lolos = function (r, abaikanKelas) {
    var s = this.s;
    if (this.tingkat === 'kabkota' && s.prov && r.prov !== s.prov) return false;
    if (!abaikanKelas && s.kelas.indexOf(r.dinilai ? r.kelas : 'TANPA') < 0) return false;
    if (r.dinilai && s.min !== null && r.skor < s.min - 1e-9) return false;
    if (r.dinilai && s.max !== null && r.skor > s.max + 1e-9) return false;
    if (s.q && norm(r.nama + ' ' + (r.provNama || '') + ' ' + r.kode).indexOf(norm(s.q)) < 0) return false;
    return true;
  };
  P.urutkan = function (rows) {
    var u = this.s.urut, a = u.arah;
    var nilai = {
      skor: function (r) { return r.dinilai ? r.skor : -Infinity; },
      peringkat: function (r) { return r.dinilai ? r.peringkat : Infinity; },
      nama: function (r) { return norm(r.nama); },
      prov: function (r) { return norm(r.provNama) + ' ' + norm(r.nama); },
      kelas: function (r) { return { TINGGI: 3, SEDANG: 2, RENDAH: 1 }[r.kelas] || 0; },
      seb: function (r) { return r.seb || 0; }
    }[u.kol] || function (r) { return r.skor; };
    return rows.slice().sort(function (x, y) {
      var p = nilai(x), q = nilai(y);
      return (p < q ? -1 : p > q ? 1 : 0) * a || (y.skor || 0) - (x.skor || 0);
    });
  };
  P.statistik = function (rows) {
    var d = rows.filter(function (r) { return r.dinilai; });
    var h = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
    d.forEach(function (r) { h[r.kelas]++; });
    var maks = null, min = null, jml = 0;
    d.forEach(function (r) { jml += r.skor; if (!maks || r.skor > maks.skor) maks = r; if (!min || r.skor < min.skor) min = r; });
    return { n: rows.length, dinilai: d.length, tanpa: rows.length - d.length, kelas: h, rata: d.length ? jml / d.length : null, maks: maks, min: min };
  };
  P.nama = function (r) { return this.tingkat === 'provinsi' ? r.nama : I.judul(r.nama); };
  P.namaProv = function () {
    var p = this.s.prov && I.D.idx.prov[this.s.prov];
    return p ? p.nama : '';
  };

  // ================================================================== UI
  P.kolom = function (label, isi, ikon) {
    var k = I.el('div', { class: 'irbi-jl-f' });
    k.appendChild(I.el('label', {}, (ikon ? '<i class="bi ' + ikon + '"></i> ' : '') + label));
    k.appendChild(isi);
    return k;
  };
  P.bangun = function () {
    var self = this, el = this.el, D = I.D;
    el.innerHTML = '';
    el.classList.add('irbi-jl', 'irbi-jl--' + this.mode);
    var f = this.elFilter = I.el('div', { class: 'irbi-jl-filter', role: 'search', 'aria-label': 'Filter data', id: this.id + '-filter' });

    if (this.tingkat === 'kabkota') {
      var sel = this.selIndeks = I.el('select', { class: 'form-select form-select-sm', 'aria-label': 'Jenis indeks' });
      D.jenis.forEach(function (j) { sel.appendChild(I.el('option', { value: j.slug, text: j.slug === 'irbi' ? 'Multi-bahaya (IRBI)' : j.nama })); });
      sel.addEventListener('change', function () {
        self.s.indeks = sel.value; self.s.min = self.s.max = null; self.s.kelas = SEMUA_KELAS.slice();
        self.render({ rentang: true });
      });
      f.appendChild(this.kolom('Indeks', sel, 'bi-layers'));
      if (!this.provKunci) {
        var sp = this.selProv = I.el('select', { class: 'form-select form-select-sm', 'aria-label': 'Provinsi' });
        sp.appendChild(I.el('option', { value: '', text: 'Seluruh Indonesia' }));
        D.provinsi.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); })
          .forEach(function (p) { sp.appendChild(I.el('option', { value: p.kode, text: p.nama })); });
        sp.addEventListener('change', function () { self.s.prov = sp.value; self.s.min = self.s.max = null; self.render({ rentang: true, zoom: true }); });
        f.appendChild(this.kolom('Wilayah', sp, 'bi-geo-alt'));
      }
    }
    this.elChips = I.el('div', { class: 'irbi-chips', role: 'group', 'aria-label': 'Saring kelas risiko' });
    f.appendChild(this.kolom('Kelas risiko', this.elChips, 'bi-funnel'));

    var r = I.el('div', { class: 'irbi-rentang' });
    this.inMin = I.el('input', { type: 'range', 'aria-label': 'Skor minimum', step: '0.01' });
    this.inMax = I.el('input', { type: 'range', 'aria-label': 'Skor maksimum', step: '0.01' });
    this.outRentang = I.el('output', { class: 'irbi-rentang-teks' });
    var trek = I.el('div', { class: 'irbi-rentang-trek' });
    this.trekIsi = I.el('div', { class: 'irbi-rentang-isi' });
    trek.appendChild(this.trekIsi);
    r.appendChild(trek); r.appendChild(this.inMin); r.appendChild(this.inMax);
    var wr = I.el('div', { class: 'irbi-rentang-wadah' });
    wr.appendChild(r); wr.appendChild(this.outRentang);
    var geser = I.tunda(function () { self.render(); }, 90);
    var atur = function (e) {
      var a = +self.inMin.value, b = +self.inMax.value;
      if (a > b) { if (e.target === self.inMin) self.inMin.value = a = b; else self.inMax.value = b = a; }
      self.s.min = a <= self.dom[0] + 1e-9 ? null : a;
      self.s.max = b >= self.dom[1] - 1e-9 ? null : b;
      self.tampilRentang();
      geser();
    };
    this.inMin.addEventListener('input', atur);
    this.inMax.addEventListener('input', atur);
    f.appendChild(this.kolom('Rentang skor', wr, 'bi-sliders'));

    var dl = this.id + '-daftar';
    this.inCari = I.el('input', { type: 'search', class: 'form-control form-control-sm', placeholder: this.tingkat === 'provinsi' ? 'Nama provinsi…' : 'Nama kab/kota atau provinsi…', list: dl, 'aria-label': 'Cari wilayah' });
    this.datalist = I.el('datalist', { id: dl });
    var cari = I.el('div', { class: 'irbi-cari' });
    cari.appendChild(this.inCari); cari.appendChild(this.datalist);
    var ketik = I.tunda(function () {
      self.s.q = self.inCari.value.trim();
      var cocok = self.cakupan.filter(function (r) { return norm(self.nama(r)) === norm(self.s.q); });
      if (cocok.length === 1) { self.s.q = ''; self.inCari.value = ''; self.render(); self.pilih(cocok[0].kode, 'cari'); return; }
      self.render();
    }, 220);
    this.inCari.addEventListener('input', ketik);
    f.appendChild(this.kolom('Cari', cari, 'bi-search'));

    var tReset = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi irbi-jl-reset', title: 'Hapus semua filter' }, '<i class="bi bi-x-circle"></i> Reset');
    tReset.addEventListener('click', function () { self.resetFilter(); });
    f.appendChild(I.el('div', { class: 'irbi-jl-f irbi-jl-f-tombol' })).appendChild(tReset);
    el.appendChild(f);

    // ringkasan + aksi
    var bar = I.el('div', { class: 'irbi-jl-ringkas' });
    this.elRingkas = I.el('div', { class: 'irbi-jl-ringkas-teks', 'aria-live': 'polite' });
    bar.appendChild(this.elRingkas);
    var aksi = I.el('div', { class: 'irbi-jl-aksi' });
    var tPdf = I.el('button', { type: 'button', class: 'btn btn-sm btn-irbi', title: 'PDF berisi peta, keterangan, ringkasan, dan tabel data lengkap sesuai filter' }, '<i class="bi bi-file-earmark-pdf"></i> Unduh PDF sesuai filter');
    tPdf.addEventListener('click', function () { self.unduhPdf(); });
    var tCsv = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'CSV berisi skor & kelas semua indeks untuk wilayah sesuai filter' }, '<i class="bi bi-filetype-csv"></i> CSV');
    tCsv.addEventListener('click', function () { self.unduhCsv(); });
    aksi.appendChild(tPdf); aksi.appendChild(tCsv);
    if (this.mode === 'penuh') {
      var tLink = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Salin tautan ke tampilan ini' }, '<i class="bi bi-link-45deg"></i> Tautan');
      tLink.addEventListener('click', function () {
        I.salin(location.href).then(function () { I.toast('Tautan tampilan ini disalin.', 'sukses'); }, function () { I.toast('Tautan: ' + I.esc(location.href), 'info', 8000); });
      });
      aksi.appendChild(tLink);
    }
    bar.appendChild(aksi);
    el.appendChild(bar);

    this.elKpi = I.el('div', { class: 'irbi-jl-kpi' });
    el.appendChild(this.elKpi);

    // peta + panel
    var isi = I.el('div', { class: 'irbi-jl-isi' });
    var kPeta = this.elPeta = I.el('div', { class: 'irbi-jl-peta' });
    var alat = I.el('div', { class: 'irbi-jl-alat' });
    [['bi-arrows-angle-contract', 'Perbesar ke hasil filter', function () { self.peta.fokusKe(self.cocokRows.map(function (r) { return r.kode; })); }],
      ['bi-arrow-counterclockwise', 'Kembalikan tampilan peta', function () { self.peta.reset(); }],
      ['bi-arrows-fullscreen', 'Layar penuh', function () { self.layarPenuh(); }]].forEach(function (t) {
      var b = I.el('button', { type: 'button', class: 'irbi-jl-alat-btn', title: t[1], 'aria-label': t[1] }, '<i class="bi ' + t[0] + '"></i>');
      b.addEventListener('click', t[2]);
      alat.appendChild(b);
    });
    kPeta.appendChild(alat);
    isi.appendChild(kPeta);
    if (this.mode === 'penuh') {
      var panel = this.elPanel = I.el('div', { class: 'irbi-jl-panel', role: 'complementary', 'aria-label': 'Daftar, grafik, dan profil' });
      var tabs = I.el('div', { class: 'irbi-tab', role: 'tablist' });
      [['daftar', 'bi-list-ol', 'Daftar'], ['grafik', 'bi-bar-chart', 'Grafik'], ['profil', 'bi-person-vcard', 'Profil wilayah']].forEach(function (t) {
        var b = I.el('button', { type: 'button', role: 'tab', 'data-tab': t[0], 'aria-selected': t[0] === self.s.tab ? 'true' : 'false' }, '<i class="bi ' + t[1] + '"></i> ' + t[2]);
        b.addEventListener('click', function () { self.bukaTab(t[0]); });
        tabs.appendChild(b);
      });
      panel.appendChild(tabs);
      this.tabDaftar = I.el('div', { class: 'irbi-tab-isi', 'data-isi': 'daftar', role: 'tabpanel' });
      this.tabGrafik = I.el('div', { class: 'irbi-tab-isi', 'data-isi': 'grafik', role: 'tabpanel' });
      this.tabProfil = I.el('div', { class: 'irbi-tab-isi', 'data-isi': 'profil', role: 'tabpanel' });
      [this.tabDaftar, this.tabGrafik, this.tabProfil].forEach(function (x) { panel.appendChild(x); });
      isi.appendChild(panel);
    }
    el.appendChild(isi);
    if (this.mode === 'sematan') el.appendChild(I.el('div', { class: 'irbi-jl-catatan' },
      '<i class="bi bi-info-circle"></i> Arahkan kursor ke wilayah untuk melihat skor; klik untuk profil risiko lengkap. ' +
      (this.tabelLuar ? 'Filter di atas juga berlaku untuk tabel di bawah.' : '') +
      ' Klik peta sekali untuk mengaktifkan zoom dengan roda tetikus.'));

    this.peta = new I.Peta(kPeta, {
      tingkat: this.tingkat, prov: this.provKunci || null, indeks: this.s.indeks,
      nilai: function (kode) { return I.nilai(self.s.indeks, kode); },
      cocok: function (kode) { return self.setCocok ? self.setCocok.has(kode) : true; },
      jenis: function () { return I.jenis(self.s.indeks); },
      judulLegenda: function () { return I.namaIndeks(self.s.indeks) + (self.s.prov && !self.provKunci ? ' · ' + self.namaProv() : ''); },
      onPilih: function (kode) { self.pilih(kode, 'peta'); },
      onSorot: function (kode) { self.sorotBaris(kode); },
      popup: this.mode === 'sematan' ? function (kode) { return self.profilHTML(kode, true); } : null
    });
    if (this.tabelLuar) this.siapkanTabelLuar();
    this.sinkronKontrol();
  };
  P.sinkronKontrol = function () {
    if (this.selIndeks) this.selIndeks.value = this.s.indeks;
    if (this.selProv) this.selProv.value = this.s.prov;
    if (this.inCari) this.inCari.value = this.s.q;
    if (this.elPanel) this.bukaTab(this.s.tab, true);
  };
  P.resetFilter = function () {
    this.s.kelas = SEMUA_KELAS.slice(); this.s.min = this.s.max = null; this.s.q = '';
    if (!this.provKunci) this.s.prov = '';
    this.sinkronKontrol();
    this.render({ rentang: true, zoom: true });
    I.toast('Filter dikembalikan.', 'info', 1800);
  };
  P.bukaTab = function (t, diam) {
    this.s.tab = t;
    this.elPanel.querySelectorAll('[role=tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    this.elPanel.querySelectorAll('.irbi-tab-isi').forEach(function (x) { x.hidden = x.dataset.isi !== t; });
    if (t === 'grafik') this.renderGrafik(true);
    if (!diam && this.mode === 'penuh') this.tulisHash();
  };
  P.layarPenuh = function () {
    var target = this.mode === 'penuh' ? this.el : this.elPeta;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (target.requestFullscreen) target.requestFullscreen();
  };

  // ================================================================== render
  P.render = function (opsi) {
    opsi = opsi || {};
    this.cakupan = this.lingkup();
    if (opsi.rentang || !this.dom) this.aturRentang();
    var self = this;
    this.cocokRows = this.urutkan(this.cakupan.filter(function (r) { return self.lolos(r); }));
    this.setCocok = new Set(this.cocokRows.map(function (r) { return r.kode; }));
    this.renderChips();
    this.renderRingkas();
    this.renderKpi();
    this.peta.o.indeks = this.s.indeks;
    this.peta.perbarui();
    if (opsi.zoom) {
      if (this.s.prov && !this.provKunci) this.peta.fokusKe(I.D.idx.kabProv[this.s.prov]);
      else if (!this.provKunci) this.peta.reset();
    }
    this.renderDaftar();
    this.renderGrafik();
    this.renderProfil();
    if (this.tabelLuar) this.renderTabelLuar();
    this.isiDatalist();
    if (this.mode === 'penuh') this.tulisHash();
  };
  P.aturRentang = function () {
    var self = this;
    var nilai = this.cakupan.filter(function (r) { return r.dinilai && (!self.s.prov || self.tingkat === 'provinsi' || r.prov === self.s.prov); }).map(function (r) { return r.skor; });
    var mn = nilai.length ? Math.floor(Math.min.apply(null, nilai) * 100) / 100 : 0;
    var mx = nilai.length ? Math.ceil(Math.max.apply(null, nilai) * 100) / 100 : 1;
    if (mn === mx) mx = mn + 1;
    this.dom = [mn, mx];
    [this.inMin, this.inMax].forEach(function (x) { x.min = mn; x.max = mx; });
    this.inMin.value = this.s.min !== null ? Math.max(mn, this.s.min) : mn;
    this.inMax.value = this.s.max !== null ? Math.min(mx, this.s.max) : mx;
    this.tampilRentang();
  };
  P.tampilRentang = function () {
    var a = +this.inMin.value, b = +this.inMax.value, d = this.dom;
    var pa = (a - d[0]) / (d[1] - d[0]) * 100, pb = (b - d[0]) / (d[1] - d[0]) * 100;
    this.trekIsi.style.left = pa + '%';
    this.trekIsi.style.width = Math.max(0, pb - pa) + '%';
    this.outRentang.textContent = I.fmt(a) + ' – ' + I.fmt(b);
    this.outRentang.classList.toggle('aktif', this.s.min !== null || this.s.max !== null);
  };
  P.renderChips = function () {
    var self = this;
    var c = { TINGGI: 0, SEDANG: 0, RENDAH: 0, TANPA: 0 };
    this.cakupan.forEach(function (r) { if (self.lolos(r, true)) c[r.dinilai ? r.kelas : 'TANPA']++; });
    this.elChips.innerHTML = '';
    SEMUA_KELAS.forEach(function (k) {
      if (k === 'TANPA' && !c.TANPA) return;
      var aktif = self.s.kelas.indexOf(k) >= 0;
      var b = I.el('button', { type: 'button', class: 'irbi-chip' + (aktif ? ' aktif' : ''), 'aria-pressed': aktif ? 'true' : 'false',
        title: (aktif ? 'Sembunyikan ' : 'Tampilkan ') + I.LABEL[k].toLowerCase() + ' (klik ganda: hanya kelas ini)' },
        '<span class="titik" style="background:' + (k === 'TANPA' ? I.warna('tanpa', '#D5D5D5') : I.warnaKelas(k)) + '"></span>' + I.LABEL[k] + ' <b>' + c[k] + '</b>');
      b.addEventListener('click', function () {
        var i = self.s.kelas.indexOf(k);
        if (i >= 0) self.s.kelas.splice(i, 1); else self.s.kelas.push(k);
        self.render();
      });
      b.addEventListener('dblclick', function (e) { e.preventDefault(); self.s.kelas = [k]; self.render(); });
      self.elChips.appendChild(b);
    });
  };
  P.teksFilter = function (panjang) {
    var s = this.s, out = [];
    if (this.tingkat === 'kabkota') out.push((panjang ? 'Indeks: ' : '') + I.namaIndeks(s.indeks));
    var wil = this.provKunci ? this.namaProv() : (s.prov ? 'Provinsi ' + this.namaProv() : (this.tingkat === 'provinsi' ? '38 provinsi' : 'Seluruh Indonesia'));
    out.push((panjang ? 'Wilayah: ' : '') + wil);
    var ada = this.kelasAda();
    var semua = ada.every(function (k) { return s.kelas.indexOf(k) >= 0; });
    var pilih = s.kelas.filter(function (k) { return ada.indexOf(k) >= 0; });
    if (!semua) out.push((panjang ? 'Kelas: ' : 'kelas ') + (pilih.length ? pilih.map(function (k) { return I.LABEL[k]; }).join(', ') : '(tidak ada)'));
    if (s.min !== null || s.max !== null) out.push((panjang ? 'Rentang skor: ' : 'skor ') + I.fmt(s.min !== null ? s.min : this.dom[0]) + ' – ' + I.fmt(s.max !== null ? s.max : this.dom[1]));
    if (s.q) out.push((panjang ? 'Kata kunci: ' : 'cari ') + '"' + s.q + '"');
    return out;
  };
  /** Kelas yang benar-benar ada di cakupan saat ini (mis. 'Tidak dinilai' hanya untuk ancaman tertentu). */
  P.kelasAda = function () {
    var ada = {};
    (this.cakupan || []).forEach(function (r) { ada[r.dinilai ? r.kelas : 'TANPA'] = 1; });
    return SEMUA_KELAS.filter(function (k) { return ada[k]; });
  };
  P.renderRingkas = function () {
    var n = this.cocokRows.length, N = this.cakupan.length;
    var satuan = this.tingkat === 'provinsi' ? 'provinsi' : 'kab/kota';
    var f = this.teksFilter(false);
    this.elRingkas.innerHTML = '<b>' + n + '</b> dari ' + N + ' ' + satuan + ' · ' + f.map(I.esc).join(' · ');
  };
  P.renderKpi = function () {
    var st = this.statistik(this.cocokRows);
    var self = this;
    var kartu = function (label, nilai, sub, kelas) {
      return '<div class="irbi-kpi' + (kelas ? ' irbi-kpi-' + kelas : '') + '"><span class="label">' + label + '</span><span class="nilai">' + nilai + '</span><span class="sub">' + (sub || '') + '</span></div>';
    };
    var total = this.cakupan.length;
    var sebaran = ['TINGGI', 'SEDANG', 'RENDAH'].map(function (k) {
      return st.kelas[k] ? '<span class="seg" style="flex:' + st.kelas[k] + ';background:' + I.warnaKelas(k) + '" title="' + I.LABEL[k] + ': ' + st.kelas[k] + '"></span>' : '';
    }).join('') + (st.tanpa ? '<span class="seg" style="flex:' + st.tanpa + ';background:' + I.warna('tanpa', '#D5D5D5') + '" title="Tidak dinilai: ' + st.tanpa + '"></span>' : '');
    this.elKpi.innerHTML =
      kartu('Wilayah ditampilkan', String(st.n), 'dari ' + total + ' · ' + (total ? Math.round(st.n / total * 100) : 0) + '%') +
      kartu('Rata-rata skor', I.fmt(st.rata), I.namaIndeks(this.s.indeks, true)) +
      kartu('Skor tertinggi', st.maks ? I.fmt(st.maks.skor) : '–', st.maks ? I.esc(self.nama(st.maks)) : '', st.maks ? st.maks.kelas.toLowerCase() : '') +
      kartu('Skor terendah', st.min ? I.fmt(st.min.skor) : '–', st.min ? I.esc(self.nama(st.min)) : '', st.min ? st.min.kelas.toLowerCase() : '') +
      '<div class="irbi-kpi irbi-kpi-sebaran"><span class="label">Sebaran kelas</span><div class="irbi-bar irbi-bar-lentur">' + (sebaran || '<span class="seg" style="flex:1;background:var(--irbi-garis)"></span>') + '</div>' +
      '<span class="sub">' + ['TINGGI', 'SEDANG', 'RENDAH'].map(function (k) { return '<i style="background:' + I.warnaKelas(k) + '"></i>' + st.kelas[k]; }).join(' ') +
      (st.tanpa ? ' <i style="background:' + I.warna('tanpa') + '"></i>' + st.tanpa : '') + '</span></div>';
  };
  P.kolomTabel = function () {
    if (this.tingkat === 'provinsi') return [['peringkat', '#'], ['nama', 'Provinsi'], ['seb', 'SEB'], ['skor', '2025'], ['kelas', 'Kelas']];
    var k = [['peringkat', '#'], ['nama', 'Kabupaten/Kota']];
    if (!this.provKunci && !this.s.prov) k.push(['prov', 'Provinsi']);
    k.push(['skor', 'Skor'], ['kelas', 'Kelas']);
    return k;
  };
  P.selTabel = function (r, kol) {
    switch (kol) {
      case 'peringkat': return '<td class="angka">' + (r.dinilai ? r.peringkat : '–') + '</td>';
      case 'nama': return '<td class="nama">' + I.esc(this.nama(r)) + (r.diubah ? ' <span class="irbi-tanda-ubah" title="Nilai diubah melalui Studio (' + (r.sumber === 'rata-rata' ? 'rata-rata kab/kota' : 'nilai buku ' + I.fmt(r.asli.skor)) + ')">●</span>' : '') + '</td>';
      case 'prov': return '<td>' + I.esc(r.provNama) + '</td>';
      case 'seb': return '<td class="angka">' + I.fmt(r.seb) + '</td>';
      case 'skor': return '<td class="angka">' + (r.dinilai ? I.fmt(r.skor) : '–') + '</td>';
      case 'kelas': return '<td>' + I.lencana(r.dinilai ? r.kelas : null) + '</td>';
    }
    return '<td></td>';
  };
  P.htmlTabel = function (rows, batas) {
    var self = this, kol = this.kolomTabel(), u = this.s.urut;
    var h = '<thead><tr>' + kol.map(function (k) {
      var arah = u.kol === k[0] ? (u.arah > 0 ? 'ascending' : 'descending') : null;
      return '<th scope="col" data-kol="' + k[0] + '"' + (arah ? ' aria-sort="' + arah + '"' : '') + ' class="bisa-urut' + (['peringkat', 'skor', 'seb'].indexOf(k[0]) >= 0 ? ' angka' : '') + '" tabindex="0">' + k[1] + '</th>';
    }).join('') + '</tr></thead><tbody>';
    var tampil = batas ? rows.slice(0, batas) : rows;
    tampil.forEach(function (r) {
      h += '<tr data-kode="' + I.esc(r.kode) + '" data-kelas="' + (r.kelas || 'TANPA') + '"' + (r.kode === self.s.pilih ? ' class="terpilih"' : '') + ' tabindex="0">' +
        kol.map(function (k) { return self.selTabel(r, k[0]); }).join('') + '</tr>';
    });
    if (!rows.length) h += '<tr><td colspan="' + kol.length + '" class="irbi-kosong">Tidak ada wilayah yang sesuai filter.</td></tr>';
    return h + '</tbody>';
  };
  P.pasangInteraksiTabel = function (table) {
    var self = this;
    table.querySelectorAll('th[data-kol]').forEach(function (th) {
      var urut = function () {
        var k = th.dataset.kol;
        self.s.urut = { kol: k, arah: self.s.urut.kol === k ? -self.s.urut.arah : (k === 'nama' || k === 'prov' || k === 'peringkat' ? 1 : -1) };
        self.render();
      };
      th.addEventListener('click', urut);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); urut(); } });
    });
    table.querySelectorAll('tbody tr[data-kode]').forEach(function (tr) {
      var kode = tr.dataset.kode;
      tr.addEventListener('mouseenter', function () { self.peta.sorot(kode, true); });
      tr.addEventListener('mouseleave', function () { self.peta.sorot(kode, false); });
      tr.addEventListener('click', function () { self.pilih(kode, 'tabel'); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') self.pilih(kode, 'tabel'); });
    });
  };
  P.renderDaftar = function () {
    if (!this.tabDaftar) return;
    var t = this.tabDaftar.querySelector('table');
    if (!t) {
      this.tabDaftar.innerHTML = '';
      var w = I.el('div', { class: 'irbi-tabel-wrap irbi-jl-tabel' });
      t = I.el('table', { class: 'irbi-tabel' });
      w.appendChild(t);
      this.tabDaftar.appendChild(w);
    }
    t.innerHTML = this.htmlTabel(this.cocokRows);
    this.pasangInteraksiTabel(t);
  };
  P.siapkanTabelLuar = function () {
    var t = this.tabelLuar;
    this.capAsli = t.caption ? t.caption.textContent : '';
    var wrap = t.closest('.irbi-tabel-wrap');
    if (wrap) wrap.classList.add('irbi-jl-tabel-luar');
    var self = this;
    var info = this.infoLuar = I.el('div', { class: 'irbi-tabel-info-luar' });
    (wrap || t).parentNode.insertBefore(info, wrap || t);
    info.addEventListener('click', function (e) {
      var a = e.target.closest('[data-aksi]');
      if (!a) return;
      e.preventDefault();
      if (a.dataset.aksi === 'filter') self.elFilter.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (a.dataset.aksi === 'reset') self.resetFilter();
      if (a.dataset.aksi === 'csv') self.unduhCsv();
    });
  };
  P.renderTabelLuar = function () {
    var t = this.tabelLuar;
    var cap = t.caption ? t.caption.outerHTML : '';
    t.innerHTML = cap + this.htmlTabel(this.cocokRows);
    if (t.caption && this.tingkat === 'kabkota' && this.s.indeks !== (this.el.dataset.indeks || 'irbi')) {
      t.caption.textContent = this.capAsli + ' — ' + I.namaIndeks(this.s.indeks);
    } else if (t.caption) t.caption.textContent = this.capAsli;
    this.pasangInteraksiTabel(t);
    var f = this.teksFilter(false);
    var adaFilter = this.cocokRows.length !== this.cakupan.length || (this.s.indeks !== (this.el.dataset.indeks || this.s.indeks));
    this.infoLuar.innerHTML = '<span><i class="bi bi-funnel"></i> Menampilkan <b>' + this.cocokRows.length + '</b> dari ' + this.cakupan.length + ' baris · ' +
      f.map(I.esc).join(' · ') + '</span><span class="irbi-tabel-info-aksi"><a href="#" data-aksi="filter">Ubah filter</a>' +
      (adaFilter ? ' · <a href="#" data-aksi="reset">Reset</a>' : '') + ' · <a href="#" data-aksi="csv">Unduh CSV</a></span>';
  };
  P.renderGrafik = function (paksa) {
    if (!this.tabGrafik || (this.tabGrafik.hidden && !paksa)) { this._grafikKotor = true; return; }
    if (this.tabGrafik.hidden) return;
    this._grafikKotor = false;
    var self = this, j = I.jenis(this.s.indeks);
    this.tabGrafik.innerHTML = '<h5 class="irbi-panel-judul">Sebaran skor</h5><div class="irbi-jl-hist"></div>' +
      '<h5 class="irbi-panel-judul">Skor tertinggi dalam filter</h5><div class="irbi-jl-top"></div>';
    var nilai = this.cocokRows.filter(function (r) { return r.dinilai; }).map(function (r) { return r.skor; });
    I.grafik.histogram(this.tabGrafik.querySelector('.irbi-jl-hist'), nilai, {
      jenis: j.rentang ? j : null, kelasDari: function (v) { return I.kelasDari(j, v); }, judulX: 'Skor ' + I.namaIndeks(this.s.indeks, true)
    });
    var top = this.cocokRows.filter(function (r) { return r.dinilai; }).slice().sort(function (a, b) { return b.skor - a.skor; }).slice(0, 12);
    I.grafik.batang(this.tabGrafik.querySelector('.irbi-jl-top'), top.map(function (r) {
      return { label: self.nama(r), nilai: r.skor, warna: I.warnaKelas(r.kelas), sub: I.esc(r.provNama || '') + ' · ' + I.LABEL[r.kelas], kode: r.kode };
    }), { tinggiBaris: 24, onKlik: function (d) { self.pilih(d.kode, 'grafik'); } });
  };
  P.profilHTML = function (kode, ringkas) {
    var D = I.D, self = this;
    if (this.tingkat === 'provinsi') {
      var p = D.idx.prov[kode], v = I.nilai('provinsi', kode);
      if (!p) return '';
      var anak = I.baris('irbi', { prov: kode });
      var c = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
      anak.forEach(function (r) { c[r.kelas]++; });
      var top = anak.slice().sort(function (a, b) { return b.skor - a.skor; }).slice(0, 5);
      return '<div class="irbi-profil"><div class="irbi-profil-kepala"><img src="' + I.akar + 'assets/img/lambang/' + p.kode + '.png" alt=""><div><h4>' + I.esc(p.nama) + '</h4>' +
        '<div class="sub">Peringkat ' + v.peringkat + ' dari ' + D.provinsi.length + ' provinsi</div></div></div>' +
        '<div class="irbi-profil-utama"><span class="nilai">' + I.fmt(v.skor) + '</span>' + I.lencana(v.kelas) + '<span class="sub">Nilai IRB 2025 · SEB ' + I.fmt(p.seb) + '</span></div>' +
        '<div class="irbi-profil-sub">' + anak.length + ' kab/kota: ' + c.TINGGI + ' tinggi · ' + c.SEDANG + ' sedang · ' + c.RENDAH + ' rendah</div>' +
        '<ol class="irbi-profil-top">' + top.map(function (r) { return '<li>' + I.esc(I.judul(r.nama)) + ' <b>' + I.fmt(r.skor) + '</b></li>'; }).join('') + '</ol>' +
        '<a class="irbi-profil-tautan" href="' + I.esc(I.akar + p.halaman) + '">Buka halaman ' + I.esc(p.nama) + ' <i class="bi bi-arrow-right"></i></a></div>';
    }
    var k = D.idx.kab[kode];
    if (!k) return '';
    var prov = D.idx.prov[k.prov];
    var h = '<div class="irbi-profil"><div class="irbi-profil-kepala"><img src="' + I.akar + 'assets/img/lambang/' + prov.kode + '.png" alt=""><div><h4>' + I.esc(I.judul(k.nama)) + '</h4>' +
      '<div class="sub">' + I.esc(prov.nama) + ' · kode ' + I.esc(kode) + '</div></div></div>';
    var vi = I.nilai('irbi', kode);
    h += '<div class="irbi-profil-utama"><span class="nilai">' + I.fmt(vi.skor) + '</span>' + I.lencana(vi.kelas) +
      '<span class="sub">Multi-bahaya · peringkat ' + vi.peringkat + ' dari ' + vi.total + '</span></div>';
    h += '<div class="irbi-profil-ancaman">';
    D.jenis.forEach(function (j) {
      if (j.slug === 'irbi') return;
      var v = I.nilai(j.slug, kode);
      var maks = 36;
      h += '<div class="baris' + (j.slug === self.s.indeks ? ' aktif' : '') + '"><span class="nm">' + I.esc(j.nama) + '</span>' +
        '<span class="trek"><span style="width:' + (v ? Math.min(100, v.skor / maks * 100) : 0) + '%;background:' + (v ? I.warnaKelas(v.kelas) : 'transparent') + '"></span></span>' +
        '<span class="nl">' + (v ? I.fmt(v.skor) : '–') + '</span>' + (v ? I.lencana(v.kelas) : '<span class="kelas kelas-tanpa">–</span>') + '</div>';
    });
    h += '</div><a class="irbi-profil-tautan" href="' + I.esc(I.akar + prov.halaman) + '">Buka halaman ' + I.esc(prov.nama) + ' <i class="bi bi-arrow-right"></i></a>';
    if (!ringkas && this.mode === 'penuh') h += ' <a class="irbi-profil-tautan" href="#" data-aksi="fokus">Perbesar di peta <i class="bi bi-zoom-in"></i></a>';
    return h + '</div>';
  };
  P.renderProfil = function () {
    if (!this.tabProfil) return;
    var self = this;
    if (!this.s.pilih) {
      this.tabProfil.innerHTML = '<div class="irbi-kosong"><i class="bi bi-hand-index"></i> Klik wilayah pada peta, daftar, atau grafik untuk melihat profil risikonya pada semua jenis ancaman.</div>';
      return;
    }
    this.tabProfil.innerHTML = this.profilHTML(this.s.pilih);
    var f = this.tabProfil.querySelector('[data-aksi=fokus]');
    if (f) f.addEventListener('click', function (e) { e.preventDefault(); self.peta.pilih(self.s.pilih, { zoom: true }); });
  };
  P.pilih = function (kode, asal) {
    this.s.pilih = kode;
    var zoom = asal !== 'peta';
    this.peta.pilih(kode, { zoom: zoom, popup: this.mode === 'sematan' });
    var self = this;
    [this.tabDaftar, this.tabelLuar].forEach(function (wadah) {
      if (!wadah) return;
      wadah.querySelectorAll('tr.terpilih').forEach(function (tr) { tr.classList.remove('terpilih'); });
      var tr = wadah.querySelector('tr[data-kode="' + kode + '"]');
      if (tr) {
        tr.classList.add('terpilih');
        if (asal !== 'tabel' && wadah === self.tabDaftar) tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    if (this.mode === 'sematan' && asal === 'tabel') this.elPeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (this.elPanel) {
      this.renderProfil();
      if (asal === 'peta' || asal === 'grafik' || asal === 'cari' || asal === 'awal') this.bukaTab('profil', asal === 'awal');
    }
    if (this.mode === 'penuh') this.tulisHash();
  };
  P.sorotBaris = function (kode) {
    [this.tabDaftar, this.tabelLuar].forEach(function (w) {
      if (!w) return;
      w.querySelectorAll('tr.disorot').forEach(function (tr) { tr.classList.remove('disorot'); });
      if (kode) { var tr = w.querySelector('tr[data-kode="' + kode + '"]'); if (tr) tr.classList.add('disorot'); }
    });
  };
  P.isiDatalist = function () {
    var self = this;
    var kunci = this.s.indeks + '|' + this.s.prov;
    if (this._dlKunci === kunci) return;
    this._dlKunci = kunci;
    this.datalist.innerHTML = this.cakupan.filter(function (r) { return !self.s.prov || self.tingkat === 'provinsi' || r.prov === self.s.prov; })
      .map(function (r) { return '<option value="' + I.esc(self.nama(r)) + '">'; }).join('');
  };

  // ================================================================== URL (#indeks=…&prov=…)
  P.bacaHash = function () {
    var p = new URLSearchParams(location.hash.replace(/^#/, ''));
    var s = this.s;
    // mulai dari nilai bawaan, lalu terapkan yang disebut di alamat
    s.indeks = this.tingkat === 'provinsi' ? 'provinsi' : (this.el.dataset.indeks || 'irbi');
    if (!this.provKunci) s.prov = '';
    s.kelas = SEMUA_KELAS.slice();
    s.tab = 'daftar';
    s.urut = { kol: 'skor', arah: -1 };
    if (p.get('indeks') && I.D.idx.jenis[p.get('indeks')] && this.tingkat === 'kabkota') s.indeks = p.get('indeks');
    if (p.has('prov') && (p.get('prov') === '' || I.D.idx.prov[p.get('prov')]) && !this.provKunci) s.prov = p.get('prov');
    if (p.get('kelas')) s.kelas = p.get('kelas').split(',').filter(function (k) { return SEMUA_KELAS.indexOf(k) >= 0; });
    s.min = p.get('min') ? +p.get('min') : null;
    s.max = p.get('max') ? +p.get('max') : null;
    s.q = p.get('q') || '';
    s.pilih = p.get('pilih') || null;
    if (p.get('tab')) s.tab = p.get('tab');
    if (p.get('urut')) { var u = p.get('urut').split(':'); s.urut = { kol: u[0], arah: u[1] === 'naik' ? 1 : -1 }; }
  };
  P.tulisHash = function () {
    var s = this.s, p = new URLSearchParams();
    if (this.tingkat === 'kabkota' && s.indeks !== 'irbi') p.set('indeks', s.indeks);
    if (s.prov && !this.provKunci) p.set('prov', s.prov);
    if (SEMUA_KELAS.some(function (k) { return s.kelas.indexOf(k) < 0; })) p.set('kelas', s.kelas.join(','));
    if (s.min !== null) p.set('min', s.min.toFixed(2));
    if (s.max !== null) p.set('max', s.max.toFixed(2));
    if (s.q) p.set('q', s.q);
    if (s.pilih) p.set('pilih', s.pilih);
    if (s.tab && s.tab !== 'daftar') p.set('tab', s.tab);
    if (s.urut.kol !== 'skor' || s.urut.arah !== -1) p.set('urut', s.urut.kol + ':' + (s.urut.arah > 0 ? 'naik' : 'turun'));
    var h = p.toString();
    var self = this;
    this._tulisHash = true;
    history.replaceState(null, '', location.pathname + location.search + (h ? '#' + h : ''));
    setTimeout(function () { self._tulisHash = false; }, 0);
  };

  // ================================================================== unduhan
  P.namaBerkas = function (ext) {
    var bag = ['irbi-2025', this.tingkat === 'provinsi' ? 'provinsi' : I.slug(this.s.indeks)];
    if (this.s.prov) bag.push(I.slug(this.namaProv()));
    else if (this.tingkat === 'kabkota') bag.push('nasional');
    var s = this.s, ada = this.kelasAda();
    if (ada.some(function (k) { return s.kelas.indexOf(k) < 0; })) bag.push(s.kelas.filter(function (k) { return ada.indexOf(k) >= 0; }).map(function (k) { return k.toLowerCase(); }).join('-'));
    if (s.min !== null || s.max !== null || s.q) bag.push('terfilter');
    return bag.join('_') + '.' + ext;
  };
  P.unduhCsv = function () {
    var rows = this.cocokRows, out;
    if (this.tingkat === 'provinsi') {
      out = [['kode', 'provinsi', 'irbi_seb', 'irbi_2025', 'kelas', 'peringkat', 'jumlah_kabkota', 'kabkota_tinggi', 'kabkota_sedang', 'kabkota_rendah', 'diubah_studio']];
      rows.forEach(function (r) {
        var anak = I.baris('irbi', { prov: r.kode }), c = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
        anak.forEach(function (a) { c[a.kelas]++; });
        out.push([r.kode, r.namaBuku, r.seb, r.skor.toFixed(2), r.kelas, r.peringkat, anak.length, c.TINGGI, c.SEDANG, c.RENDAH, r.diubah ? 'ya' : '']);
      });
    } else {
      var jenis = I.D.jenis;
      var kepala = ['kode', 'kabupaten_kota', 'provinsi'];
      jenis.forEach(function (j) { kepala.push(j.slug + '_skor', j.slug + '_kelas', j.slug + '_peringkat'); });
      kepala.push('diubah_studio');
      out = [kepala];
      rows.forEach(function (r) {
        var b = [r.kode, r.nama, r.provBuku], ubah = false;
        jenis.forEach(function (j) {
          var v = I.nilai(j.slug, r.kode);
          if (v && v.diubah) ubah = true;
          b.push(v ? v.skor.toFixed(2) : '', v ? v.kelas : '', v ? v.peringkat : '');
        });
        b.push(ubah ? 'ya' : '');
        out.push(b);
      });
    }
    I.unduh(I.keCSV(out), this.namaBerkas('csv'));
    I.toast('CSV berisi ' + rows.length + ' baris diunduh.', 'sukses');
  };
  P.specPdf = function () {
    var s = this.s, j = I.jenis(s.indeks);
    var namaIdx = I.namaIndeks(s.indeks);
    var wil = this.tingkat === 'provinsi' ? 'Tingkat Provinsi' : (s.prov ? 'di ' + (/^(ACEH|DAERAH ISTIMEWA)/.test(I.D.idx.prov[s.prov].nama_buku) ? '' : 'Provinsi ') + this.namaProv() : 'Kabupaten/Kota Seluruh Indonesia');
    var judul = 'Peta Indeks Risiko Bencana ' + (this.tingkat === 'kabkota' && s.indeks !== 'irbi' ? namaIdx + ' ' : '') + wil;
    return {
      tingkat: this.tingkat, indeks: s.indeks, namaIndeks: namaIdx, jenis: j, prov: s.prov, provNama: this.namaProv(), provKunci: this.provKunci,
      judul: judul, subjudul: 'Indeks Risiko Bencana Indonesia (IRBI) Tahun ' + I.D.tahun,
      filterTeks: this.teksFilter(true), baris: this.cocokRows, cakupan: this.cakupan, setCocok: this.setCocok,
      statistik: this.statistik(this.cocokRows), namaBerkas: this.namaBerkas('pdf'),
      pdfStandar: this.tingkat === 'provinsi' ? I.D.pdf.provinsi : (s.prov ? I.D.idx.prov[s.prov].pdf : I.D.pdf[s.indeks])
    };
  };
  P.unduhPdf = function () {
    var spec = this.specPdf();
    if (!spec.baris.length) { I.toast('Tidak ada wilayah yang sesuai filter.', 'galat'); return; }
    I.modul('pdf').then(function () { I.pdf.dialog(spec); }).catch(function (e) { I.toast('Modul PDF gagal dimuat: ' + I.esc(e.message), 'galat'); });
  };

  I.Jelajah = Jelajah;
})();
