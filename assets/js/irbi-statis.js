/* IRBI 2025 — komponen statis yang mengikuti data efektif (termasuk editan Studio):
 * kartu ringkasan [data-kartu], kartu provinsi, kartu ancaman, dan tabel cadangan (cari & urut).
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.statis) return;

  function rata(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; }
  function hitung(rows) {
    var c = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
    rows.forEach(function (r) { if (r.kelas) c[r.kelas]++; });
    return c;
  }
  function pct(a, b) { return b ? String(Math.round(a / b * 1000) / 10).replace('.', ',') + '%' : '–'; }

  /** Mengembalikan daftar kartu: [label, nilai(angka|teks), sub, kelas, desimal] */
  function isiKartu(spec) {
    var D = I.D, bag = spec.split(':');
    if (bag[0] === 'nasional') {
      var kab = I.baris('irbi'), prov = I.baris('provinsi');
      var ck = hitung(kab), cp = hitung(prov);
      var tk = kab.slice().sort(function (a, b) { return b.skor - a.skor; })[0];
      var tp = prov.slice().sort(function (a, b) { return b.skor - a.skor; })[0];
      return [
        ['Rata-rata IRBI kab/kota', rata(kab.map(function (r) { return r.skor; })), 'dihitung dari ' + kab.length + ' kab/kota', '', 2],
        ['Kab/kota kelas tinggi', ck.TINGGI, ck.SEDANG + ' sedang · ' + ck.RENDAH + ' rendah', 'kelas-tinggi', 0],
        ['Provinsi kelas tinggi', cp.TINGGI, cp.SEDANG + ' sedang · ' + cp.RENDAH + ' rendah', 'kelas-tinggi', 0],
        ['Skor kab/kota tertinggi', tk.skor, I.judul(tk.nama) + ', ' + tk.provNama, '', 2],
        ['Skor provinsi tertinggi', tp.skor, tp.nama, '', 2]
      ];
    }
    if (bag[0] === 'prov') {
      var p = D.idx.prov[bag[1]];
      if (!p) return [];
      var v = I.nilai('provinsi', p.kode);
      var anak = I.baris('irbi', { prov: p.kode });
      var c = hitung(anak);
      var top = anak.slice().sort(function (a, b) { return b.skor - a.skor; })[0];
      return [
        ['Nilai IRB ' + D.tahun, v.skor, 'Kelas ' + I.LABEL[v.kelas] + (v.diubah ? ' · diubah' : ''), 'kelas-' + v.kelas.toLowerCase(), 2],
        ['Peringkat provinsi', v.peringkat + ' / ' + D.provinsi.length, 'urut dari skor tertinggi', '', null],
        ['Jumlah kabupaten/kota', anak.length, ['TINGGI', 'SEDANG', 'RENDAH'].filter(function (k) { return c[k]; }).map(function (k) { return c[k] + ' ' + I.LABEL[k].toLowerCase(); }).join(' · '), '', 0],
        ['Skor kab/kota tertinggi', top ? top.skor : null, top ? I.judul(top.nama) : '', '', 2]
      ];
    }
    if (bag[0] === 'ancaman') {
      var rows = I.baris(bag[1]).filter(function (r) { return r.dinilai; });
      var h = hitung(rows), n = rows.length;
      var t = rows.slice().sort(function (a, b) { return b.skor - a.skor; })[0];
      return [
        ['Kab/kota dinilai', n, 'dari ' + D.kabkota.length + ' kab/kota', '', 0],
        ['Kelas tinggi', h.TINGGI, pct(h.TINGGI, n) + ' dari yang dinilai', 'kelas-tinggi', 0],
        ['Kelas sedang', h.SEDANG, pct(h.SEDANG, n), 'kelas-sedang', 0],
        ['Kelas rendah', h.RENDAH, pct(h.RENDAH, n), 'kelas-rendah', 0],
        ['Skor tertinggi', t ? t.skor : null, t ? I.judul(t.nama) + ', ' + t.provNama : '', '', 2]
      ];
    }
    return [];
  }

  var animasiNyala = function () {
    return document.documentElement.getAttribute('data-irbi-animasi') !== 'mati' &&
      !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  function hitungNaik(el, nilai, desimal) {
    if (typeof nilai !== 'number' || !animasiNyala()) { el.textContent = typeof nilai === 'number' ? I.fmt(nilai, desimal) : nilai; return; }
    var t0 = null, dur = 750;
    var langkah = function (t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = I.fmt(nilai * e, desimal);
      if (p < 1) requestAnimationFrame(langkah);
    };
    requestAnimationFrame(langkah);
  }
  function renderKartu(grid, pertama) {
    var isi = isiKartu(grid.getAttribute('data-kartu'));
    if (!isi.length) return;
    grid.innerHTML = '';
    isi.forEach(function (k) {
      var kartu = I.el('div', { class: 'irbi-kartu ' + (k[3] || '') });
      kartu.appendChild(I.el('div', { class: 'irbi-kartu-label', text: k[0] }));
      var n = I.el('div', { class: 'irbi-kartu-nilai' });
      kartu.appendChild(n);
      kartu.appendChild(I.el('div', { class: 'irbi-kartu-sub', text: k[2] }));
      grid.appendChild(kartu);
      if (k[4] === null || k[4] === undefined || k[1] === null) n.textContent = k[1] === null ? '–' : k[1];
      else if (pertama) hitungNaik(n, k[1], k[4]);
      else n.textContent = I.fmt(k[1], k[4]);
    });
  }

  function perbaruiGridProvinsi() {
    document.querySelectorAll('.irbi-prov-kartu[data-kode]').forEach(function (a) {
      var v = I.nilai('provinsi', a.dataset.kode);
      if (!v) return;
      var n = a.querySelector('.irbi-prov-nilai'), k = a.querySelector('.kelas');
      if (n) n.textContent = I.fmt(v.skor);
      if (k) { k.className = 'kelas kelas-' + v.kelas.toLowerCase(); k.textContent = I.LABEL[v.kelas]; }
      a.classList.toggle('diubah', !!v.diubah);
    });
  }
  /** Blok judul provinsi (lambang, jumlah kab/kota, nilai & kelas) mengikuti data efektif, termasuk editan Studio. */
  function perbaruiJudulEkstra() {
    document.querySelectorAll('[data-hero^="prov:"]').forEach(function (el) {
      var kode = el.getAttribute('data-hero').split(':')[1];
      var v = I.nilai('provinsi', kode);
      if (!v) return;
      var isi = function (k) { return el.querySelector('[data-hero-isi="' + k + '"]'); };
      var n = isi('nilai'), k = isi('kelas'), j = isi('jumlah');
      if (n) {
        n.textContent = I.fmt(v.skor);
        if (v.diubah) n.appendChild(I.el('span', { class: 'irbi-tanda-ubah', title: 'Nilai diubah di Studio', text: '*' }));
      }
      if (k) { k.className = 'kelas kelas-' + v.kelas.toLowerCase(); k.textContent = I.LABEL[v.kelas]; }
      if (j) j.textContent = I.baris('irbi', { prov: kode }).length;
    });
  }
  function perbaruiGridAncaman() {
    document.querySelectorAll('.irbi-ancaman-kartu[data-slug]').forEach(function (a) {
      var rows = I.baris(a.dataset.slug).filter(function (r) { return r.dinilai; });
      var h = hitung(rows), n = rows.length || 1;
      var sub = a.querySelector('.sub'), bar = a.querySelector('.irbi-bar');
      if (sub) sub.textContent = rows.length + ' kab/kota dinilai · ' + h.TINGGI + ' tinggi';
      if (bar) bar.innerHTML = ['TINGGI', 'SEDANG', 'RENDAH'].filter(function (k) { return h[k]; }).map(function (k) {
        return '<span class="seg kelas-' + k.toLowerCase() + '" style="width:' + (h[k] / n * 100).toFixed(2) + '%" title="' + I.LABEL[k] + ': ' + h[k] + '"></span>';
      }).join('');
    });
  }

  // ------------------------------------------------------------------ tabel cadangan (tidak diadopsi Jelajah)
  function tingkatkanTabel(t) {
    if (t.dataset.siap) return;
    t.dataset.siap = '1';
    var tbody = t.tBodies[0];
    if (!tbody || !t.tHead) return;
    var baris = Array.prototype.slice.call(tbody.rows);
    var kepala = Array.prototype.slice.call(t.tHead.rows[0].cells);
    var wrap = t.closest('.irbi-tabel-wrap') || t;
    var bilah = I.el('div', { class: 'irbi-tabel-bilah' });
    var cari = I.el('input', { type: 'search', class: 'form-control form-control-sm', placeholder: 'Cari…', 'aria-label': 'Cari pada tabel' });
    var info = I.el('span', { class: 'irbi-tabel-info' });
    bilah.appendChild(cari); bilah.appendChild(info);
    wrap.parentNode.insertBefore(bilah, wrap);
    var terapkan = function () {
      var q = cari.value.trim().toLowerCase(), n = 0;
      baris.forEach(function (r) { var ok = !q || r.textContent.toLowerCase().indexOf(q) >= 0; r.hidden = !ok; if (ok) n++; });
      info.textContent = n + ' dari ' + baris.length + ' baris';
    };
    cari.addEventListener('input', terapkan);
    terapkan();
    var kol = -1, arah = 1;
    kepala.forEach(function (th, i) {
      th.classList.add('bisa-urut'); th.tabIndex = 0;
      var urut = function () {
        arah = kol === i ? -arah : 1; kol = i;
        var angka = th.dataset.tipe === 'angka';
        baris.sort(function (a, b) {
          var x = a.cells[i].textContent.trim(), y = b.cells[i].textContent.trim();
          if (angka) { x = I.angka(x); y = I.angka(y); } else { x = x.toLowerCase(); y = y.toLowerCase(); }
          return (x < y ? -1 : x > y ? 1 : 0) * arah;
        });
        baris.forEach(function (r) { tbody.appendChild(r); });
        kepala.forEach(function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', arah > 0 ? 'ascending' : 'descending');
      };
      th.addEventListener('click', urut);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter') urut(); });
    });
  }

  function pasang() {
    var grids = document.querySelectorAll('[data-kartu]');
    grids.forEach(function (g) { I.saatTerlihat(g, function () { renderKartu(g, true); g.dataset.siap = '1'; }); });
    perbaruiGridProvinsi();
    perbaruiGridAncaman();
    perbaruiJudulEkstra();
    document.querySelectorAll('table.irbi-tabel:not([data-diadopsi])').forEach(function (t) {
      if (!t.closest('.irbi-jelajah, .irbi-studio-data')) tingkatkanTabel(t);
    });
    document.addEventListener('irbi:kustom', function (e) {
      if (e.detail && e.detail.bagian === 'teks') return;
      grids.forEach(function (g) { if (g.dataset.siap) renderKartu(g, false); });
      perbaruiGridProvinsi();
      perbaruiGridAncaman();
      perbaruiJudulEkstra();
    });
  }

  I.statis = { pasang: pasang, isiKartu: isiKartu };
})();
