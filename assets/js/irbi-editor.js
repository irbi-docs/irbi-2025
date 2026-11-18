/* IRBI 2025 — Studio Data: lembar kerja untuk mengubah skor & ambang langsung di peramban.
 * Perubahan langsung berlaku di semua halaman (peta, tabel, kartu, grafik, CSV, PDF) di peramban ini.
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.EditorData) return;
  var S = I.kustom;

  function EditorData(el) {
    this.el = el;
    this.s = { tingkat: 'kabkota', indeks: 'irbi', prov: '', kelas: '', q: '', hanyaUbah: false, urut: { kol: 'asli', arah: -1 }, pilih: null };
    this.undo = []; this.redo = [];
    this.bangun();
    this.render(true);
    var self = this;
    document.addEventListener('irbi:kustom', function (e) {
      if (e.detail && (e.detail.bagian === 'teks' || e.detail.bagian === 'tampilan')) return;
      if (!self._sibuk) self.render(false);
    });
    window.addEventListener('beforeunload', function () { /* tersimpan otomatis; tidak perlu konfirmasi */ });
  }
  var P = EditorData.prototype;

  P.kunci = function () { return this.s.tingkat === 'provinsi' ? 'provinsi' : this.s.indeks; };
  P.wadahUbah = function (l, kunci) {
    if (kunci === 'provinsi') return l.data.provinsi;
    if (kunci === 'irbi') return l.data.kabkota;
    l.data.ancaman[kunci] = l.data.ancaman[kunci] || {};
    return l.data.ancaman[kunci];
  };
  P.bangun = function () {
    var self = this, D = I.D, el = this.el;
    el.innerHTML = '';
    el.classList.add('irbi-ed');
    var bilah = I.el('div', { class: 'irbi-ed-bilah' });
    var kol = function (label, isi) { var d = I.el('label', { class: 'irbi-ed-f' }); d.appendChild(I.el('span', { text: label })); d.appendChild(isi); bilah.appendChild(d); return isi; };
    this.sTingkat = kol('Tingkat', I.el('select', { class: 'form-select form-select-sm' }, '<option value="kabkota">Kabupaten/kota</option><option value="provinsi">Provinsi</option>'));
    this.sIndeks = kol('Jenis indeks', I.el('select', { class: 'form-select form-select-sm' }));
    D.jenis.forEach(function (j) { self.sIndeks.appendChild(I.el('option', { value: j.slug, text: j.slug === 'irbi' ? 'Multi-bahaya (IRBI)' : j.nama })); });
    this.sProv = kol('Provinsi', I.el('select', { class: 'form-select form-select-sm' }));
    this.sProv.appendChild(I.el('option', { value: '', text: 'Semua provinsi' }));
    D.provinsi.slice().sort(function (a, b) { return a.nama.localeCompare(b.nama); }).forEach(function (p) { self.sProv.appendChild(I.el('option', { value: p.kode, text: p.nama })); });
    this.sKelas = kol('Kelas', I.el('select', { class: 'form-select form-select-sm' }, '<option value="">Semua kelas</option><option value="TINGGI">Tinggi</option><option value="SEDANG">Sedang</option><option value="RENDAH">Rendah</option>'));
    this.iCari = kol('Cari', I.el('input', { type: 'search', class: 'form-control form-control-sm', placeholder: 'Nama atau kode…' }));
    var cek = I.el('label', { class: 'irbi-sakelar irbi-ed-cek' });
    this.cUbah = I.el('input', { type: 'checkbox' });
    cek.appendChild(this.cUbah); cek.appendChild(I.el('span')); cek.appendChild(document.createTextNode('Hanya yang diubah'));
    bilah.appendChild(cek);
    el.appendChild(bilah);

    var aksi = I.el('div', { class: 'irbi-ed-aksi' });
    this.tUndo = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Urungkan (Ctrl/⌘+Z)' }, '<i class="bi bi-arrow-counterclockwise"></i> Urungkan');
    this.tRedo = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi', title: 'Ulangi (Ctrl/⌘+Y)' }, '<i class="bi bi-arrow-clockwise"></i> Ulangi');
    var gAmbang = I.el('div', { class: 'irbi-ed-ambang' });
    this.iSedang = I.el('input', { type: 'text', inputmode: 'decimal', class: 'form-control form-control-sm', 'aria-label': 'Ambang sedang' });
    this.iTinggi = I.el('input', { type: 'text', inputmode: 'decimal', class: 'form-control form-control-sm', 'aria-label': 'Ambang tinggi' });
    var tAmbang = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi' }, 'Terapkan');
    gAmbang.innerHTML = '<span>Ambang kelas: sedang ≥</span>';
    gAmbang.appendChild(this.iSedang); gAmbang.appendChild(I.el('span', { text: 'tinggi >' })); gAmbang.appendChild(this.iTinggi); gAmbang.appendChild(tAmbang);
    var tImpor = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi' }, '<i class="bi bi-upload"></i> Impor CSV');
    var menu = I.el('details', { class: 'irbi-ed-menu' });
    menu.innerHTML = '<summary class="btn btn-sm btn-irbi"><i class="bi bi-download"></i> Ekspor</summary><div class="irbi-ed-menu-isi">' +
      '<button type="button" data-ekspor="kabkota">irbi_kabkota.csv <small>skor multi-bahaya kab/kota</small></button>' +
      '<button type="button" data-ekspor="ancaman">irbi_ancaman.csv <small>skor 11 ancaman</small></button>' +
      '<button type="button" data-ekspor="provinsi">irbi_provinsi.csv <small>nilai provinsi</small></button>' +
      '<button type="button" data-ekspor="jenis">jenis_indeks.csv <small>ambang kelas</small></button>' +
      '<button type="button" data-ekspor="paket">Paket kustomisasi (.json) <small>data, tampilan, teks</small></button></div>';
    var tBalik = I.el('button', { type: 'button', class: 'btn btn-sm btn-outline-irbi' }, '<i class="bi bi-arrow-repeat"></i> Data buku');
    this.status = I.el('span', { class: 'irbi-ed-status', 'aria-live': 'polite' });
    [this.tUndo, this.tRedo, gAmbang, tImpor, menu, tBalik, this.status].forEach(function (x) { aksi.appendChild(x); });
    el.appendChild(aksi);

    var isi = I.el('div', { class: 'irbi-ed-isi' });
    this.wrap = I.el('div', { class: 'irbi-tabel-wrap irbi-ed-grid' });
    this.tabel = I.el('table', { class: 'irbi-tabel' });
    this.wrap.appendChild(this.tabel);
    isi.appendChild(this.wrap);
    this.kanan = I.el('div', { class: 'irbi-ed-peta' });
    isi.appendChild(this.kanan);
    el.appendChild(isi);
    el.appendChild(I.el('p', { class: 'irbi-ed-kaki' }, '<i class="bi bi-lightbulb"></i> Tips: tekan <kbd>Enter</kbd> untuk menyimpan dan turun ke baris berikutnya, <kbd>Esc</kbd> untuk membatalkan sel. ' +
      'Tempel satu kolom angka dari Excel ke sel mana pun untuk mengisi baris-baris di bawahnya sekaligus. Kelas dihitung otomatis dari ambang.'));

    this.sTingkat.addEventListener('change', function () {
      self.s.tingkat = self.sTingkat.value;
      self.sIndeks.disabled = self.sProv.disabled = self.s.tingkat === 'provinsi';
      if (self.s.tingkat === 'provinsi') self.sIndeks.value = 'irbi';
      self.s.indeks = self.sIndeks.value;
      self.render(true);
    });
    this.sIndeks.addEventListener('change', function () { self.s.indeks = self.sIndeks.value; self.render(true); });
    this.sProv.addEventListener('change', function () { self.s.prov = self.sProv.value; self.render(false); if (self.peta) self.peta.fokusKe(self.s.prov ? I.D.idx.kabProv[self.s.prov] : null); });
    this.sKelas.addEventListener('change', function () { self.s.kelas = self.sKelas.value; self.render(false); });
    this.iCari.addEventListener('input', I.tunda(function () { self.s.q = self.iCari.value.trim().toLowerCase(); self.render(false); }, 180));
    this.cUbah.addEventListener('change', function () { self.s.hanyaUbah = self.cUbah.checked; self.render(false); });
    this.tUndo.addEventListener('click', function () { self.urungkan(); });
    this.tRedo.addEventListener('click', function () { self.ulangi(); });
    tAmbang.addEventListener('click', function () { self.aturAmbang(); });
    tImpor.addEventListener('click', function () { I.studio.pilihBerkas('.csv,text/csv', function (f) { I.studio.alurImporCSV(f); }); });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ekspor]');
      if (!b) return;
      menu.open = false;
      self.ekspor(b.dataset.ekspor);
    });
    tBalik.addEventListener('click', function () {
      var n = S.jumlah(S.lokal).data;
      if (!n) { I.toast('Belum ada perubahan data lokal.', 'info'); return; }
      if (confirm('Kembalikan semua ' + n + ' perubahan data ke data buku?')) { S.hapus('data'); self.undo = []; self.redo = []; self.render(true); }
    });
    el.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.target.matches('input[type=search]')) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); self.urungkan(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); self.ulangi(); }
    });
  };

  P.baris = function () {
    var s = this.s, kunci = this.kunci();
    var rows = I.baris(kunci, { prov: s.tingkat === 'kabkota' ? (s.prov || null) : null }).filter(function (r) { return r.dinilai; });
    rows = rows.filter(function (r) {
      if (s.kelas && r.kelas !== s.kelas) return false;
      if (s.hanyaUbah && !r.diubah) return false;
      if (s.q && (r.nama + ' ' + r.kode + ' ' + (r.provNama || '')).toLowerCase().indexOf(s.q) < 0) return false;
      return true;
    });
    var u = s.urut;
    var nilai = { kode: function (r) { return r.kode; }, nama: function (r) { return r.nama; }, asli: function (r) { return r.asli.skor; }, skor: function (r) { return r.skor; } }[u.kol];
    return rows.sort(function (a, b) { var x = nilai(a), y = nilai(b); return (x < y ? -1 : x > y ? 1 : 0) * u.arah; });
  };
  P.render = function (petaBaru) {
    var self = this, kunci = this.kunci(), j = I.jenis(kunci);
    this.iSedang.value = I.fmt(j.batas_sedang);
    this.iTinggi.value = I.fmt(j.batas_tinggi);
    var rows = this.rows = this.baris();
    var prov = this.s.tingkat === 'kabkota' && !this.s.prov;
    var u = this.s.urut;
    var th = function (kol, label, cls) {
      var arah = u.kol === kol ? (u.arah > 0 ? 'ascending' : 'descending') : null;
      return '<th data-kol="' + kol + '" class="' + (cls || '') + (kol ? ' bisa-urut' : '') + '"' + (arah ? ' aria-sort="' + arah + '"' : '') + (kol ? ' tabindex="0"' : '') + '>' + label + '</th>';
    };
    var h = '<thead><tr>' + th('kode', 'Kode') + th('nama', this.s.tingkat === 'provinsi' ? 'Provinsi' : 'Kabupaten/Kota') + (prov ? th('', 'Provinsi') : '') +
      th('asli', 'Skor buku', 'angka') + th('skor', 'Skor saat ini', 'angka') + th('', 'Selisih', 'angka') + th('', 'Kelas') + th('', '') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var d = r.skor - r.asli.skor;
      h += '<tr data-kode="' + I.esc(r.kode) + '" class="' + (r.diubah ? 'diubah' : '') + (r.kode === self.s.pilih ? ' terpilih' : '') + '">' +
        '<td class="kode">' + I.esc(r.kode) + '</td><td>' + I.esc(self.s.tingkat === 'provinsi' ? r.nama : I.judul(r.nama)) +
        (r.sumber === 'rata-rata' ? ' <span class="irbi-tanda-ubah" title="Dihitung ulang dari rata-rata kab/kota yang diubah">ø</span>' : '') + '</td>' +
        (prov ? '<td>' + I.esc(r.provNama) + '</td>' : '') +
        '<td class="angka">' + I.fmt(r.asli.skor) + '</td>' +
        '<td class="angka"><input type="text" inputmode="decimal" value="' + I.fmt(r.skor) + '" data-kode="' + I.esc(r.kode) + '" aria-label="Skor ' + I.esc(r.nama) + '"' + (r.sumber === 'rata-rata' ? ' title="Isi untuk menetapkan nilai provinsi secara manual"' : '') + '></td>' +
        '<td class="angka selisih ' + (d > 0 ? 'naik' : d < 0 ? 'turun' : '') + '">' + (r.diubah ? (d > 0 ? '+' : '') + I.fmt(d) : '') + '</td>' +
        '<td class="kls">' + I.lencana(r.kelas) + '</td>' +
        '<td>' + (r.diubah && r.sumber === 'studio' ? '<button type="button" class="irbi-ed-balik" data-balik="' + I.esc(r.kode) + '" title="Kembalikan ke nilai buku"><i class="bi bi-x-circle"></i></button>' : '') + '</td></tr>';
    });
    if (!rows.length) h += '<tr><td colspan="8" class="irbi-kosong">Tidak ada baris yang sesuai.</td></tr>';
    this.tabel.innerHTML = h + '</tbody>';
    this.pasangInteraksi();
    this.perbaruiStatus();
    if (petaBaru || !this.peta || this.peta.tingkat !== this.s.tingkat) this.bangunPeta();
    else { this.peta.o.indeks = kunci; this.peta.perbarui(); }
  };
  P.pasangInteraksi = function () {
    var self = this;
    this.tabel.querySelectorAll('th[data-kol]').forEach(function (th) {
      if (!th.dataset.kol) return;
      var urut = function () {
        var k = th.dataset.kol;
        self.s.urut = { kol: k, arah: self.s.urut.kol === k ? -self.s.urut.arah : (k === 'kode' || k === 'nama' ? 1 : -1) };
        self.render(false);
      };
      th.addEventListener('click', urut);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter') urut(); });
    });
    var inputs = Array.prototype.slice.call(this.tabel.querySelectorAll('input[data-kode]'));
    inputs.forEach(function (inp, i) {
      var tr = inp.closest('tr');
      inp.dataset.awal = inp.value;
      inp.addEventListener('focus', function () { inp.select(); self.sorot(inp.dataset.kode, true); self.s.pilih = inp.dataset.kode; });
      inp.addEventListener('blur', function () { self.sorot(inp.dataset.kode, false); self.simpanSel(inp); });
      inp.addEventListener('input', function () { inp.classList.toggle('galat', isNaN(I.angka(inp.value))); });
      inp.addEventListener('keydown', function (e) {
        var pindah = function (d) { var n = inputs[i + d]; if (n && n.isConnected) n.focus(); };
        if (e.key === 'Enter') { e.preventDefault(); self.simpanSel(inp); pindah(e.shiftKey ? -1 : 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); self.simpanSel(inp); pindah(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); self.simpanSel(inp); pindah(-1); }
        else if (e.key === 'Escape') { inp.value = inp.dataset.awal; inp.classList.remove('galat'); inp.blur(); }
      });
      inp.addEventListener('paste', function (e) {
        var teks = (e.clipboardData || window.clipboardData).getData('text');
        var nilai = teks.replace(/\r/g, '').split('\n').map(function (l) { return l.split('\t')[0].trim(); }).filter(function (v, k, arr) { return v !== '' || k < arr.length - 1; });
        if (nilai.length < 2) return;
        e.preventDefault();
        var batch = [];
        nilai.forEach(function (v, k) {
          var target = inputs[i + k];
          var x = I.angka(v);
          if (!target || isNaN(x)) return;
          batch.push(self.perubahan(target.dataset.kode, x));
        });
        self.terapkan(batch.filter(Boolean), true);
        I.toast(batch.length + ' nilai ditempel dari papan klip.', 'sukses');
      });
      tr.addEventListener('mouseenter', function () { self.sorot(inp.dataset.kode, true); });
      tr.addEventListener('mouseleave', function () { self.sorot(inp.dataset.kode, false); });
    });
    this.tabel.querySelectorAll('[data-balik]').forEach(function (b) {
      b.addEventListener('click', function () {
        var kode = b.dataset.balik, v = I.nilai(self.kunci(), kode);
        self.terapkan([self.perubahan(kode, v.asli.skor)].filter(Boolean), true);
      });
    });
  };
  P.perubahan = function (kode, nilaiBaru) {
    var kunci = this.kunci();
    var asli = I.nilai(kunci, kode);
    if (!asli) return null;
    var lokal = this.wadahUbah(S.lokal, kunci);
    var sebelum = Object.prototype.hasOwnProperty.call(lokal, kode) ? lokal[kode] : undefined;
    var sesudah = Math.abs(nilaiBaru - asli.asli.skor) < 1e-9 ? null : Math.round(nilaiBaru * 10000) / 10000;
    if (sebelum === sesudah || (sebelum === undefined && sesudah === null && !asli.diubah)) return null;
    return { kunci: kunci, kode: kode, sebelum: sebelum, sesudah: sesudah };
  };
  P.simpanSel = function (inp) {
    if (inp.value === inp.dataset.awal) return;
    var x = I.angka(inp.value);
    if (isNaN(x)) { I.toast('Nilai "' + I.esc(inp.value) + '" bukan angka.', 'galat'); inp.value = inp.dataset.awal; inp.classList.remove('galat'); return; }
    var p = this.perubahan(inp.dataset.kode, x);
    inp.dataset.awal = inp.value = I.fmt(x);
    if (p) this.terapkan([p], true);
  };
  P.terapkan = function (batch, catat) {
    if (!batch.length) return;
    var self = this;
    this._sibuk = true;
    S.ubah('data', function (l) {
      batch.forEach(function (p) {
        var w = self.wadahUbah(l, p.kunci);
        if (p.sesudah === undefined) delete w[p.kode]; else w[p.kode] = p.sesudah;
      });
    });
    this._sibuk = false;
    if (catat) { this.undo.push(batch); this.redo = []; }
    // perbarui baris di tempat agar fokus & posisi gulir tidak hilang
    if (batch.every(function (p) { return p.kunci === self.kunci(); })) {
      this.perbaruiBaris();
      this.perbaruiStatus();
      this.peta.perbarui();
    } else this.render(false);
  };
  /** Segarkan nilai, selisih, kelas, dan tanda ubah pada baris yang tampil tanpa menggambar ulang tabel. */
  P.perbaruiBaris = function () {
    var self = this, kunci = this.kunci();
    this.tabel.querySelectorAll('tbody tr[data-kode]').forEach(function (tr) {
      var r = I.nilai(kunci, tr.dataset.kode);
      if (!r) return;
      var inp = tr.querySelector('input[data-kode]');
      if (inp && document.activeElement !== inp) { inp.value = I.fmt(r.skor); inp.dataset.awal = inp.value; }
      var d = r.skor - r.asli.skor;
      var sel = tr.querySelector('.selisih');
      sel.className = 'angka selisih ' + (d > 0 ? 'naik' : d < 0 ? 'turun' : '');
      sel.textContent = r.diubah ? (d > 0 ? '+' : '') + I.fmt(d) : '';
      tr.querySelector('.kls').innerHTML = I.lencana(r.kelas);
      tr.classList.toggle('diubah', !!r.diubah);
      var sel2 = tr.lastElementChild;
      if (r.diubah && r.sumber === 'studio' && !sel2.querySelector('[data-balik]')) {
        var b = I.el('button', { type: 'button', class: 'irbi-ed-balik', 'data-balik': tr.dataset.kode, title: 'Kembalikan ke nilai buku' }, '<i class="bi bi-x-circle"></i>');
        b.addEventListener('click', function () { self.terapkan([self.perubahan(tr.dataset.kode, r.asli.skor)].filter(Boolean), true); });
        sel2.appendChild(b);
      } else if (!(r.diubah && r.sumber === 'studio')) sel2.innerHTML = '';
    });
  };
  P.urungkan = function () {
    var b = this.undo.pop();
    if (!b) { I.toast('Tidak ada yang bisa diurungkan.', 'info', 1800); return; }
    this.terapkan(b.map(function (p) { return { kunci: p.kunci, kode: p.kode, sesudah: p.sebelum }; }), false);
    this.redo.push(b);
    I.toast('Diurungkan (' + b.length + ' nilai).', 'info', 1800);
  };
  P.ulangi = function () {
    var b = this.redo.pop();
    if (!b) { I.toast('Tidak ada yang bisa diulangi.', 'info', 1800); return; }
    this.terapkan(b, false);
    this.undo.push(b);
  };
  P.aturAmbang = function () {
    var kunci = this.kunci(), slug = kunci === 'provinsi' ? 'irbi' : kunci;
    var s = I.angka(this.iSedang.value), t = I.angka(this.iTinggi.value);
    if (isNaN(s) || isNaN(t) || s > t) { I.toast('Ambang tidak valid: ambang sedang harus angka dan tidak lebih besar dari ambang tinggi.', 'galat', 5000); return; }
    var asli = I.D.idx.jenis[slug];
    S.ubah('data', function (l) {
      if (Math.abs(s - asli.batas_sedang) < 1e-9 && Math.abs(t - asli.batas_tinggi) < 1e-9) delete l.data.ambang[slug];
      else l.data.ambang[slug] = { batas_sedang: s, batas_tinggi: t };
    });
    I.toast('Ambang kelas ' + I.esc(I.namaIndeks(slug)) + ' diperbarui; kelas dihitung ulang.', 'sukses');
  };
  P.perbaruiStatus = function () {
    var n = S.jumlah(S.lokal).data;
    this.status.innerHTML = '<i class="bi bi-cloud-check"></i> ' + (n ? '<b>' + n + '</b> perubahan data tersimpan di peramban ini' : 'Belum ada perubahan') + ' · ' + this.rows.length + ' baris ditampilkan';
    this.tUndo.disabled = !this.undo.length;
    this.tRedo.disabled = !this.redo.length;
  };
  P.bangunPeta = function () {
    var self = this;
    if (this.peta) this.peta.hancurkan();
    this.kanan.innerHTML = '';
    var kartu = I.el('div', { class: 'irbi-ed-peta-kartu' });
    kartu.appendChild(I.el('div', { class: 'irbi-ed-peta-judul' }, '<i class="bi bi-map"></i> Pratinjau peta hasil editan'));
    var w = I.el('div', { class: 'irbi-jl-peta' });
    kartu.appendChild(w);
    this.kanan.appendChild(kartu);
    this.peta = new I.Peta(w, {
      tingkat: this.s.tingkat, indeks: this.kunci(),
      nilai: function (kode) { return I.nilai(self.kunci(), kode); },
      cocok: function (kode) { return !self.rows || self.rows.some(function (r) { return r.kode === kode; }); },
      jenis: function () { return I.jenis(self.kunci()); },
      judulLegenda: function () { return I.namaIndeks(self.kunci()); },
      onPilih: function (kode) {
        var inp = self.tabel.querySelector('input[data-kode="' + CSS.escape(kode) + '"]');
        if (inp) { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); inp.focus({ preventScroll: true }); }
        else I.toast('Wilayah ini tidak ada di baris yang ditampilkan (cek filter).', 'info');
      },
      onSorot: function (kode) {
        self.tabel.querySelectorAll('tr.disorot').forEach(function (tr) { tr.classList.remove('disorot'); });
        if (kode) { var tr = self.tabel.querySelector('tr[data-kode="' + CSS.escape(kode) + '"]'); if (tr) tr.classList.add('disorot'); }
      }
    });
    if (this.s.prov && this.s.tingkat === 'kabkota') this.peta.fokusKe(I.D.idx.kabProv[this.s.prov]);
  };
  P.sorot = function (kode, nyala) { if (this.peta) this.peta.sorot(kode, nyala); };

  // ------------------------------------------------------------------ ekspor (format sama dengan berkas data/)
  P.ekspor = function (jenis) {
    var D = I.D;
    if (jenis === 'paket') { I.studio.eksporPaket(); return; }
    var out;
    if (jenis === 'kabkota') {
      var nama = {};
      (window.IRBI_GEO ? window.IRBI_GEO.kabkota.features : []).forEach(function (f) { nama[f.properties.kode] = f.properties.nama; });
      out = [['kode', 'peringkat', 'kabkota', 'provinsi', 'skor', 'kelas', 'nama_resmi']];
      I.baris('irbi').sort(function (a, b) { return b.skor - a.skor; }).forEach(function (r, i) {
        out.push([r.kode, i + 1, r.nama, r.provBuku, +r.skor.toFixed(4), r.kelas, nama[r.kode] || '']);
      });
      I.unduh(I.keCSV(out), 'irbi_kabkota.csv');
    } else if (jenis === 'ancaman') {
      out = [['ancaman', 'peringkat', 'kode', 'kabkota', 'provinsi', 'skor', 'kelas']];
      D.jenis.forEach(function (j) {
        if (j.slug === 'irbi') return;
        I.baris(j.slug).filter(function (r) { return r.dinilai; }).sort(function (a, b) { return b.skor - a.skor; }).forEach(function (r, i) {
          out.push([j.slug, i + 1, r.kode, r.nama, r.provBuku, +r.skor.toFixed(4), r.kelas]);
        });
      });
      I.unduh(I.keCSV(out), 'irbi_ancaman.csv');
    } else if (jenis === 'provinsi') {
      out = [['kode', 'no', 'provinsi', 'irbi_seb', 'irbi_2025', 'kelas']];
      I.baris('provinsi').forEach(function (r, i) { out.push([r.kode, i + 1, r.namaBuku, r.seb, +r.skor.toFixed(4), r.kelas]); });
      I.unduh(I.keCSV(out), 'irbi_provinsi.csv');
    } else if (jenis === 'jenis') {
      out = [['slug', 'nama', 'batas_sedang', 'batas_tinggi', 'tampilkan_rentang', 'keterangan']];
      D.jenis.forEach(function (j) { var e = I.jenis(j.slug); out.push([j.slug, j.nama, e.batas_sedang, e.batas_tinggi, j.rentang ? 'ya' : 'tidak', e.diubah ? 'Ambang diubah melalui Studio Data' : (j.keterangan || '')]); });
      I.unduh(I.keCSV(out), 'jenis_indeks.csv');
    }
    I.toast('Berkas diekspor. Ganti berkas di folder <code>data/</code> lalu render ulang untuk memperbarui PDF buku.', 'sukses', 6000);
  };

  I.EditorData = EditorData;
})();
