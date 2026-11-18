/* IRBI 2025 — grafik SVG interaktif ringan (batang, histogram, batang bertumpuk) tanpa pustaka luar. */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.grafik) return;
  var NS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------------------ tooltip bersama
  var tipEl = null;
  function tip(html, e) {
    if (!tipEl) { tipEl = I.el('div', { class: 'irbi-tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
    if (!html) { tipEl.classList.remove('tampil'); return; }
    tipEl.innerHTML = html;
    tipEl.classList.add('tampil');
    var x = e.clientX + 14, y = e.clientY + 14;
    var r = tipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  function s(tag, attrs, teks) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); });
    if (teks !== undefined) e.textContent = teks;
    return e;
  }
  var kanvasUkur = document.createElement('canvas').getContext('2d');
  function lebarTeks(t, uk, tebal) {
    kanvasUkur.font = (tebal ? '600 ' : '400 ') + uk + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    return kanvasUkur.measureText(t).width;
  }
  function responsif(el, gambar) {
    var lebar = 0;
    var jalan = function () { var w = Math.floor(el.clientWidth); if (w && w !== lebar) { lebar = w; gambar(w); } };
    if ('ResizeObserver' in window) new ResizeObserver(I.tunda(jalan, 60)).observe(el);
    jalan();
    return function () { lebar = 0; jalan(); };
  }
  function warnaTeks() { return I.warna('teks', '#1F2D33'); }
  function warnaTeks2() { return I.warna('teks-2', '#55656D'); }
  function warnaGaris() { return I.warna('garis', '#D5DEE2'); }

  // ------------------------------------------------------------------ batang horizontal
  /** data: [{label, nilai, warna, sub, titik, href, kode}], opsi: {format, ambang:[{nilai,label}], maks, tinggiBaris, onKlik, judulSumbu} */
  function batang(el, data, opsi) {
    opsi = opsi || {};
    var fmt = opsi.format || function (v) { return I.fmt(v); };
    return responsif(el, function (W) {
      el.innerHTML = '';
      var tb = opsi.tinggiBaris || 26, atas = opsi.ambang && opsi.ambang.length ? 30 : 10, bawah = 30;
      var uk = W < 520 ? 12 : 13;
      var kiri = Math.min(W * 0.42, 14 + Math.max.apply(null, data.map(function (d) { return lebarTeks(d.label, uk, true); }).concat([40])));
      var kanan = 58;
      var H = atas + data.length * tb + bawah;
      var maks = opsi.maks || Math.max.apply(null, data.map(function (d) { return Math.max(d.nilai || 0, d.titik || 0); }).concat([1])) * 1.06;
      var sx = function (v) { return kiri + (W - kiri - kanan) * (v / maks); };
      var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'irbi-svg', role: 'img', 'aria-label': opsi.judul || 'Grafik batang' });
      var langkah = [10, 20, 25, 50, 100, 200, 250, 500].find(function (x) { return maks / x <= 7; }) || 1000;
      for (var v = 0; v <= maks; v += langkah) {
        svg.appendChild(s('line', { x1: sx(v), x2: sx(v), y1: atas - 6, y2: H - bawah + 4, stroke: warnaGaris(), 'stroke-width': 1 }));
        svg.appendChild(s('text', { x: sx(v), y: H - bawah + 18, 'text-anchor': 'middle', 'font-size': 11, fill: warnaTeks2() }, I.fmt(v, 0)));
      }
      (opsi.ambang || []).forEach(function (a) {
        if (a.nilai > maks) return;
        svg.appendChild(s('line', { x1: sx(a.nilai), x2: sx(a.nilai), y1: atas - 22, y2: H - bawah + 4, stroke: a.warna || I.warnaKelas('TINGGI'), 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
        svg.appendChild(s('text', { x: sx(a.nilai) + 5, y: atas - 12, 'font-size': 11, fill: a.warna || I.warnaKelas('TINGGI') }, a.label));
      });
      data.forEach(function (d, i) {
        var y = atas + i * tb;
        var g = s('g', { class: 'irbi-batang' + (d.href || opsi.onKlik ? ' bisa-klik' : ''), tabindex: d.href || opsi.onKlik ? 0 : null });
        g.appendChild(s('rect', { x: 0, y: y, width: W, height: tb, fill: 'transparent' }));
        g.appendChild(s('text', { x: kiri - 10, y: y + tb / 2 + 4, 'text-anchor': 'end', 'font-size': uk, 'font-weight': 600, fill: warnaTeks() }, d.label));
        var w = Math.max(1, sx(d.nilai || 0) - kiri);
        var r = s('rect', { x: kiri, y: y + 4, width: w, height: tb - 8, rx: 4, fill: d.warna || I.warna('primer'), class: 'irbi-batang-isi', style: 'animation-delay:' + Math.min(i * 18, 500) + 'ms' });
        g.appendChild(r);
        if (d.titik !== undefined && d.titik !== null) {
          g.appendChild(s('circle', { cx: sx(d.titik), cy: y + tb / 2, r: 4.5, fill: I.warna('primer', '#0B3C49'), stroke: I.warna('permukaan', '#fff'), 'stroke-width': 1.5 }));
        }
        g.appendChild(s('text', { x: kiri + w + 6, y: y + tb / 2 + 4, 'font-size': 12, fill: warnaTeks(), 'font-variant-numeric': 'tabular-nums' }, fmt(d.nilai)));
        var html = '<b>' + I.esc(d.label) + '</b><br>' + fmt(d.nilai) + (d.sub ? '<br><span>' + d.sub + '</span>' : '');
        g.addEventListener('mousemove', function (e) { tip(html, e); });
        g.addEventListener('mouseleave', function () { tip(null); });
        var klik = function () { if (opsi.onKlik) opsi.onKlik(d); else if (d.href) location.href = d.href; };
        if (d.href || opsi.onKlik) {
          g.addEventListener('click', klik);
          g.addEventListener('keydown', function (e) { if (e.key === 'Enter') klik(); });
        }
        svg.appendChild(g);
      });
      if (opsi.judulSumbu) svg.appendChild(s('text', { x: kiri, y: H - 2, 'font-size': 11, fill: warnaTeks2() }, opsi.judulSumbu));
      el.appendChild(svg);
    });
  }

  // ------------------------------------------------------------------ histogram
  /** nilai: number[], opsi: {jenis (ambang), kelasDari(v), bins, judulX, tinggi} */
  function histogram(el, nilai, opsi) {
    opsi = opsi || {};
    return responsif(el, function (W) {
      el.innerHTML = '';
      var H = opsi.tinggi || 190, kiri = 34, kanan = 12, atas = 14, bawah = 34;
      if (!nilai.length) { el.innerHTML = '<div class="irbi-kosong">Tidak ada data untuk filter ini.</div>'; return; }
      var mn = Math.min.apply(null, nilai), mx = Math.max.apply(null, nilai);
      if (mn === mx) { mn -= 1; mx += 1; }
      var n = opsi.bins || Math.max(6, Math.min(26, Math.round(Math.sqrt(nilai.length) * 2)));
      var lebar = (mx - mn) / n;
      var hit = new Array(n).fill(0);
      nilai.forEach(function (v) { var i = Math.min(n - 1, Math.floor((v - mn) / lebar)); hit[i]++; });
      var maksH = Math.max.apply(null, hit);
      var sx = function (v) { return kiri + (W - kiri - kanan) * ((v - mn) / (mx - mn)); };
      var sy = function (c) { return atas + (H - atas - bawah) * (1 - c / maksH); };
      var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'irbi-svg', role: 'img', 'aria-label': 'Histogram sebaran skor' });
      [0, 0.5, 1].forEach(function (t) {
        var c = Math.round(maksH * t);
        svg.appendChild(s('line', { x1: kiri, x2: W - kanan, y1: sy(c), y2: sy(c), stroke: warnaGaris() }));
        svg.appendChild(s('text', { x: kiri - 6, y: sy(c) + 4, 'text-anchor': 'end', 'font-size': 10, fill: warnaTeks2() }, c));
      });
      hit.forEach(function (c, i) {
        var a = mn + i * lebar, b = a + lebar;
        var kelas = opsi.kelasDari ? opsi.kelasDari((a + b) / 2) : null;
        var r = s('rect', { x: sx(a) + 1, y: sy(c), width: Math.max(1, sx(b) - sx(a) - 2), height: Math.max(0, H - bawah - sy(c)), rx: 2,
          fill: kelas ? I.warnaKelas(kelas) : I.warna('primer'), class: 'irbi-hist-batang' });
        r.addEventListener('mousemove', function (e) { tip('<b>' + c + ' wilayah</b><br>skor ' + I.fmt(a) + ' – ' + I.fmt(b), e); });
        r.addEventListener('mouseleave', function () { tip(null); });
        svg.appendChild(r);
      });
      if (opsi.jenis) {
        [opsi.jenis.batas_sedang, opsi.jenis.batas_tinggi].forEach(function (v) {
          if (v < mn || v > mx) return;
          svg.appendChild(s('line', { x1: sx(v), x2: sx(v), y1: atas - 6, y2: H - bawah, stroke: warnaTeks(), 'stroke-dasharray': '4 3', 'stroke-width': 1.2 }));
          svg.appendChild(s('text', { x: sx(v) + 3, y: atas + 2, 'font-size': 10, fill: warnaTeks() }, I.fmt(v)));
        });
      }
      [mn, (mn + mx) / 2, mx].forEach(function (v, i) {
        svg.appendChild(s('text', { x: sx(v), y: H - bawah + 16, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', 'font-size': 10, fill: warnaTeks2() }, I.fmt(v, 1)));
      });
      svg.appendChild(s('text', { x: (W + kiri) / 2, y: H - 4, 'text-anchor': 'middle', 'font-size': 11, fill: warnaTeks2() }, opsi.judulX || 'Skor'));
      el.appendChild(svg);
    });
  }

  // ------------------------------------------------------------------ batang bertumpuk
  /** baris: [{label, href, segmen:[{n, warna, label}], total}] */
  function tumpuk(el, baris, opsi) {
    opsi = opsi || {};
    return responsif(el, function (W) {
      el.innerHTML = '';
      var tb = 34, uk = W < 520 ? 12 : 13;
      var kiri = Math.min(W * 0.4, 16 + Math.max.apply(null, baris.map(function (b) { return lebarTeks(b.label, uk, true); })));
      var H = 8 + baris.length * tb + 26, kanan = 14;
      var total = opsi.total || Math.max.apply(null, baris.map(function (b) { return b.total; }));
      var sx = function (n) { return (W - kiri - kanan) * (n / total); };
      var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, class: 'irbi-svg', role: 'img', 'aria-label': opsi.judul || 'Grafik batang bertumpuk' });
      baris.forEach(function (b, i) {
        var y = 8 + i * tb;
        var g = s('g', { class: 'irbi-batang' + (b.href ? ' bisa-klik' : ''), tabindex: b.href ? 0 : null });
        g.appendChild(s('rect', { x: 0, y: y, width: W, height: tb, fill: 'transparent' }));
        g.appendChild(s('text', { x: kiri - 10, y: y + tb / 2 + 4, 'text-anchor': 'end', 'font-size': uk, 'font-weight': 600, fill: warnaTeks() }, b.label));
        var x = kiri;
        b.segmen.forEach(function (sg) {
          if (!sg.n) return;
          var w = sx(sg.n);
          g.appendChild(s('rect', { x: x, y: y + 6, width: Math.max(0.5, w - 1), height: tb - 12, fill: sg.warna, class: 'irbi-batang-isi' }));
          if (w > 30) {
            g.appendChild(s('text', { x: x + w / 2, y: y + tb / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700,
              fill: sg.teks || '#fff' }, sg.n));
          }
          x += w;
        });
        var html = '<b>' + I.esc(b.label) + '</b><br>' + b.segmen.map(function (sg) { return I.esc(sg.label) + ': ' + sg.n; }).join('<br>');
        g.addEventListener('mousemove', function (e) { tip(html, e); });
        g.addEventListener('mouseleave', function () { tip(null); });
        if (b.href) {
          g.addEventListener('click', function () { location.href = b.href; });
          g.addEventListener('keydown', function (e) { if (e.key === 'Enter') location.href = b.href; });
        }
        svg.appendChild(g);
      });
      el.appendChild(svg);
    });
  }

  // ------------------------------------------------------------------ grafik siap pasang
  function pasang(el) {
    if (el.dataset.siap) return;
    el.dataset.siap = '1';
    var jenis = el.dataset.jenis;
    var gambar = { provinsi: grafikProvinsi, ancaman: grafikAncaman, teratas: grafikTeratas }[jenis];
    if (!gambar) return;
    var ulang = function () { gambar(el); };
    ulang();
    document.addEventListener('irbi:kustom', function (e) { if (!e.detail || e.detail.bagian !== 'teks') ulang(); });
    document.addEventListener('irbi:tema', ulang);
  }
  function kontrol(el, html) {
    var k = el.querySelector('.irbi-grafik-kontrol');
    if (!k) { k = I.el('div', { class: 'irbi-grafik-kontrol' }, html); el.appendChild(k); }
    // area selalu dibuat baru agar pengamat ukuran (ResizeObserver) lama tidak menggambar data usang
    var lama = el.querySelector('.irbi-grafik-area');
    var area = I.el('div', { class: 'irbi-grafik-area' });
    if (lama) lama.replaceWith(area); else el.appendChild(area);
    return { k: k, area: area };
  }
  function grafikProvinsi(el) {
    var c = kontrol(el, '<div class="irbi-segmen" role="group" aria-label="Urutkan">' +
      '<button type="button" data-urut="skor" class="aktif">Skor tertinggi</button><button type="button" data-urut="abjad">Abjad</button>' +
      '<button type="button" data-urut="naik">Selisih dari SEB</button></div><label class="irbi-sakelar"><input type="checkbox" data-seb checked><span></span>Tampilkan nilai SEB</label>');
    var urut = el.dataset.urut || 'skor';
    var seb = el.dataset.seb !== 'tidak';
    if (!c.k.dataset.siap) {
      c.k.dataset.siap = '1';
      c.k.querySelectorAll('[data-urut]').forEach(function (b) {
        b.addEventListener('click', function () {
          el.dataset.urut = b.dataset.urut;
          c.k.querySelectorAll('[data-urut]').forEach(function (x) { x.classList.toggle('aktif', x === b); });
          grafikProvinsi(el);
        });
      });
      c.k.querySelector('[data-seb]').addEventListener('change', function (e) { el.dataset.seb = e.target.checked ? 'ya' : 'tidak'; grafikProvinsi(el); });
    }
    var rows = I.baris('provinsi');
    rows.sort(function (a, b) {
      if (urut === 'abjad') return a.nama.localeCompare(b.nama);
      if (urut === 'naik') return (b.skor - (b.seb || 0)) - (a.skor - (a.seb || 0));
      return b.skor - a.skor;
    });
    var j = I.jenis('irbi');
    batang(c.area, rows.map(function (r) {
      return { label: r.nama, nilai: r.skor, warna: I.warnaKelas(r.kelas), titik: seb ? r.seb : null,
        sub: I.LABEL[r.kelas] + ' · peringkat ' + r.peringkat + (r.seb ? ' · SEB ' + I.fmt(r.seb) : '') + (r.diubah ? ' · diubah' : ''),
        href: I.akar + I.D.idx.prov[r.kode].halaman };
    }), { ambang: [{ nilai: j.batas_tinggi, label: 'Ambang tinggi ' + I.fmt(j.batas_tinggi) }], judulSumbu: 'Nilai Indeks Risiko Bencana provinsi · titik = nilai kolom SEB', judul: 'Nilai IRB provinsi' });
  }
  function grafikAncaman(el) {
    var c = kontrol(el, '');
    var total = I.D.kabkota.length;
    var baris = I.D.jenis.filter(function (j) { return j.slug !== 'irbi'; }).map(function (j) {
      var rows = I.baris(j.slug).filter(function (r) { return r.dinilai; });
      var h = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
      rows.forEach(function (r) { h[r.kelas]++; });
      return { label: j.nama, total: total, href: I.akar + I.D.halaman_ancaman[j.slug], segmen: [
        { n: h.TINGGI, warna: I.warnaKelas('TINGGI'), label: 'Tinggi', teks: I.warna('tinggi-teks', '#fff') },
        { n: h.SEDANG, warna: I.warnaKelas('SEDANG'), label: 'Sedang', teks: I.warna('sedang-teks', '#2B2B00') },
        { n: h.RENDAH, warna: I.warnaKelas('RENDAH'), label: 'Rendah', teks: I.warna('rendah-teks', '#fff') },
        { n: total - rows.length, warna: I.warna('tanpa', '#D5D5D5'), label: 'Tidak dinilai', teks: '#333' }] };
    });
    tumpuk(c.area, baris, { total: total, judul: 'Jumlah kabupaten/kota per kelas risiko untuk setiap ancaman' });
  }
  function grafikTeratas(el) {
    var opsiIdx = I.D.jenis.map(function (j) { return '<option value="' + j.slug + '">' + I.esc(j.slug === 'irbi' ? 'Multi-bahaya (IRBI)' : j.nama) + '</option>'; }).join('');
    var c = kontrol(el, '<label class="irbi-mini-label">Indeks <select class="form-select form-select-sm" data-idx>' + opsiIdx + '</select></label>' +
      '<label class="irbi-mini-label">Jumlah <select class="form-select form-select-sm" data-n><option>10</option><option>15</option><option>25</option></select></label>');
    if (!c.k.dataset.siap) {
      c.k.dataset.siap = '1';
      c.k.querySelector('[data-idx]').addEventListener('change', function () { grafikTeratas(el); });
      c.k.querySelector('[data-n]').addEventListener('change', function () { grafikTeratas(el); });
    }
    var idx = c.k.querySelector('[data-idx]').value || 'irbi';
    var n = +c.k.querySelector('[data-n]').value || 10;
    var rows = I.baris(idx).filter(function (r) { return r.dinilai; }).sort(function (a, b) { return b.skor - a.skor; }).slice(0, n);
    batang(c.area, rows.map(function (r) {
      return { label: I.judul(r.nama), nilai: r.skor, warna: I.warnaKelas(r.kelas),
        sub: I.esc(r.provNama) + ' · ' + I.LABEL[r.kelas] + ' · peringkat ' + r.peringkat,
        href: I.akar + 'jelajah.html#indeks=' + idx + '&pilih=' + r.kode };
    }), { judulSumbu: 'Skor ' + I.namaIndeks(idx) + ' · klik untuk membuka di Jelajah Data', judul: 'Kabupaten/kota dengan skor tertinggi' });
  }

  I.grafik = { batang: batang, histogram: histogram, tumpuk: tumpuk, pasang: pasang, tip: tip };
})();
