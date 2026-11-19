/* IRBI 2025 — PDF sesuai filter, dibuat sepenuhnya di peramban (jsPDF + svg2pdf.js + jspdf-autotable).
 * Isi: peta vektor berketerangan, ringkasan filter & statistik, klasifikasi kelas, parameter, dan tabel data lengkap.
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.pdf) return;
  var BBOX_INDONESIA = [94.9, -11.1, 141.1, 6.2];
  var PARAMETER = [
    'Indeks Bahaya BNPB 2021',
    'Hasil Proyeksi IRBI 2025-2045: Indeks Jiwa Terpapar, Indeks Kerugian, dan Indeks Kerusakan Lingkungan Proyeksi 2025',
    'Indeks Kapasitas Daerah (IKD) 2025'
  ];
  var SINGKAT = {
    'irbi': 'Multi-bahaya', 'banjir': 'Banjir', 'gempabumi': 'Gempa', 'tsunami': 'Tsunami', 'letusan-gunungapi': 'Gunung api',
    'banjir-bandang': 'Banjir bandang', 'gelombang-ekstrem-abrasi': 'Gelombang & abrasi', 'kebakaran-hutan-lahan': 'Karhutla',
    'tanah-longsor': 'Longsor', 'kekeringan': 'Kekeringan', 'likuefaksi': 'Likuefaksi', 'cuaca-ekstrem': 'Cuaca ekstrem'
  };

  // ------------------------------------------------------------------ util
  var WINANSI = '–—‘’‚“”„•…‰‹›€™ŒœŠšŽžŸƒˆ˜†‡';
  function aman(s) {
    return String(s === null || s === undefined ? '' : s).replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/−/g, '-')
      .replace(/[^\x00-\xFF]/g, function (c) { return WINANSI.indexOf(c) >= 0 ? c : '?'; });
  }
  function rgb(hex) { var c = I.warnaUtil.hexKeRgb(hex); return c || [120, 120, 120]; }
  function teksAtas(hex) { return I.warnaUtil.terang(hex) ? [30, 30, 30] : [255, 255, 255]; }
  function tanggal() {
    var d = new Date();
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  function f2(x) { return I.fmt(x); }
  /** Palet PDF (selalu versi terang agar tercetak baik, tetapi mengikuti tema/palet Studio). */
  function warnaPdf() {
    var C = { primer: rgb(I.warna('primer', '#0B3C49')), aksen: rgb(I.warna('aksen', '#A68B5B')), teks: [31, 45, 51], abu: [85, 101, 109], garis: [200, 211, 216] };
    if (I.gelap()) C.primer = rgb(I.warnaUtil.campur(I.warna('primer', '#0B3C49'), '#0B3C49', 0.5));
    return C;
  }

  // ------------------------------------------------------------------ dialog
  var BATAS_PROFIL_KAB = 60;
  function dialog(spec, mode) {
    var lama = document.querySelector('dialog.irbi-dialog-pdf');
    if (lama) lama.remove();
    var d = I.el('dialog', { class: 'irbi-dialog irbi-dialog-pdf', 'aria-labelledby': 'irbi-dlg-pdf-judul' });
    var satuan = spec.tingkat === 'provinsi' ? 'provinsi' : 'kabupaten/kota';
    var n = spec.baris.length, bisaKab = spec.tingkat === 'kabkota' && n <= BATAS_PROFIL_KAB;
    var judulLaporan = spec.judul.replace(/^Peta /, 'Laporan ');
    d.innerHTML =
      '<form class="irbi-dialog-isi">' +
      '<header><h3 id="irbi-dlg-pdf-judul"><i class="bi bi-file-earmark-pdf"></i> Unduh PDF sesuai filter</h3>' +
      '<button type="button" class="irbi-dialog-tutup" aria-label="Tutup"><i class="bi bi-x-lg"></i></button></header>' +
      '<div class="irbi-dialog-badan">' +
      '<div class="irbi-dlg-filter">' + spec.filterTeks.map(function (t) { return '<span class="irbi-pil">' + I.esc(t) + '</span>'; }).join('') + '</div>' +
      '<fieldset class="irbi-dlg-f irbi-dlg-jenis"><legend>Jenis dokumen</legend>' +
      '<label class="irbi-cek"><input type="radio" name="jenis" value="ringkas"> <span><b>Peta &amp; tabel</b> — lanskap, ringkas: peta berketerangan, ringkasan statistik, dan tabel data</span></label>' +
      '<label class="irbi-cek"><input type="radio" name="jenis" value="laporan"> <span><b>Laporan lengkap seperti buku</b> — A4: sampul, daftar isi, narasi hasil, pendahuluan &amp; metodologi buku, peta, grafik, profil wilayah, penutup, dan lampiran</span></label>' +
      '</fieldset>' +
      '<label class="irbi-dlg-f">Judul dokumen<input type="text" name="judul" class="form-control" maxlength="140"></label>' +
      '<div data-untuk="ringkas">' +
      '<fieldset class="irbi-dlg-f"><legend>Isi PDF</legend>' +
      '<label class="irbi-cek"><input type="checkbox" name="peta" checked> Peta berketerangan (legenda, skala, arah utara' + (spec.prov ? ', inset lokasi' : '') + ')</label>' +
      '<label class="irbi-cek"><input type="checkbox" name="ringkasan" checked> Ringkasan filter, statistik, klasifikasi kelas, dan parameter</label>' +
      '<label class="irbi-cek"><input type="checkbox" name="tabel" checked> Tabel data</label>' +
      (spec.tingkat === 'kabkota' ? '<div class="irbi-dlg-sub"><label class="irbi-cek"><input type="radio" name="lengkap" value="ya" checked> Lengkap: skor &amp; kelas multi-bahaya dan 11 ancaman</label>' +
        '<label class="irbi-cek"><input type="radio" name="lengkap" value="tidak"> Hanya indeks terpilih (' + I.esc(spec.namaIndeks) + ')</label></div>' : '') +
      '</fieldset>' +
      '<div class="irbi-dlg-baris"><label class="irbi-dlg-f">Ukuran kertas<select name="kertas" class="form-select"><option value="a4">A4 lanskap</option><option value="a3">A3 lanskap</option></select></label></div>' +
      '</div>' +
      '<div data-untuk="laporan" hidden><fieldset class="irbi-dlg-f"><legend>Isi laporan</legend>' +
      '<label class="irbi-cek"><input type="checkbox" checked disabled> Sampul, daftar isi, ringkasan &amp; narasi hasil, peta, grafik, dan penutup</label>' +
      '<label class="irbi-cek"><input type="checkbox" name="pengantar" checked> Pendahuluan &amp; metodologi (teks buku, tabel parameter sesuai indeks)</label>' +
      '<label class="irbi-cek"><input type="checkbox" name="profilProv" checked> Profil per provinsi (gambaran wilayah dari buku + analisis data)</label>' +
      (spec.tingkat === 'kabkota' ? '<label class="irbi-cek"><input type="checkbox" name="profilKab"' + (bisaKab ? ' checked' : ' disabled') + '> Profil setiap kabupaten/kota' +
        (bisaKab ? '' : ' <small>(tersedia bila hasil filter ≤ ' + BATAS_PROFIL_KAB + ' wilayah; saat ini ' + n + ')</small>') + '</label>' : '') +
      '<label class="irbi-cek"><input type="checkbox" name="lampiran" checked> Lampiran tabel data lengkap</label>' +
      '</fieldset>' +
      (n > 150 ? '<p class="irbi-dlg-info"><i class="bi bi-hourglass-split"></i> Laporan untuk ' + n + ' wilayah cukup tebal dan butuh beberapa detik untuk dibuat.</p>' : '') +
      '</div>' +
      '<p class="irbi-dlg-info"><i class="bi bi-info-circle"></i> <b>' + n + '</b> ' + satuan + ' sesuai filter akan dimuat. PDF dibuat di peramban Anda; tidak ada data yang dikirim ke server.' +
      (spec.pdfStandar ? ' Perlu peta baku tanpa filter? <a href="' + I.esc(I.akar + spec.pdfStandar) + '" target="_blank" rel="noopener">Unduh PDF standar</a>.' : '') + '</p>' +
      '<div class="irbi-dlg-progres" hidden><div class="irbi-dlg-progres-bar"><span></span></div><span class="teks">Menyiapkan…</span></div>' +
      '</div>' +
      '<footer><button type="button" class="btn btn-outline-irbi" data-batal>Batal</button>' +
      '<button type="submit" class="btn btn-irbi"><i class="bi bi-download"></i> Buat PDF</button></footer></form>';
    document.body.appendChild(d);
    var form = d.querySelector('form');
    var jenis = function () { return form.querySelector('input[name=jenis]:checked').value; };
    var aturJenis = function (j) {
      form.querySelector('input[name=jenis][value="' + j + '"]').checked = true;
      d.querySelectorAll('[data-untuk]').forEach(function (b) { b.hidden = b.getAttribute('data-untuk') !== j; });
      if (!form.judul.dataset.diubah) form.judul.value = j === 'laporan' ? judulLaporan : spec.judul;
    };
    form.judul.addEventListener('input', function () { form.judul.dataset.diubah = '1'; });
    form.querySelectorAll('input[name=jenis]').forEach(function (r) { r.addEventListener('change', function () { aturJenis(r.value); }); });
    aturJenis(mode === 'laporan' ? 'laporan' : 'ringkas');
    var tutup = function () { d.close(); d.remove(); };
    d.querySelector('.irbi-dialog-tutup').addEventListener('click', tutup);
    d.querySelector('[data-batal]').addEventListener('click', tutup);
    d.addEventListener('cancel', function (e) { e.preventDefault(); tutup(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lap = jenis() === 'laporan', jalan;
      var pr = d.querySelector('.irbi-dlg-progres');
      var lapor = function (teks, t) { pr.querySelector('.teks').textContent = teks; pr.querySelector('.irbi-dlg-progres-bar span').style.width = Math.round(t * 100) + '%'; };
      if (lap) {
        var opsiL = { judul: form.judul.value.trim() || judulLaporan, pengantar: form.pengantar.checked, profilProv: form.profilProv.checked,
          profilKab: !!(form.profilKab && form.profilKab.checked && !form.profilKab.disabled), lampiran: form.lampiran.checked };
        jalan = function () { return I.modul('laporan').then(function () { return I.laporan.buat(spec, opsiL, lapor); }); };
      } else {
        var opsi = {
          judul: form.judul.value.trim() || spec.judul, peta: form.peta.checked, ringkasan: form.ringkasan.checked, tabel: form.tabel.checked,
          lengkap: spec.tingkat === 'kabkota' ? form.querySelector('input[name=lengkap]:checked').value === 'ya' : true, kertas: form.kertas.value
        };
        if (!opsi.peta && !opsi.ringkasan && !opsi.tabel) { I.toast('Pilih minimal satu isi PDF.', 'galat'); return; }
        jalan = function () { return buat(spec, opsi, lapor); };
      }
      pr.hidden = false;
      form.querySelectorAll('button, input, select').forEach(function (x) { x.disabled = true; });
      jalan().then(function (nama) {
        tutup();
        I.toast((lap ? 'Laporan' : 'PDF') + ' <b>' + I.esc(nama) + '</b> berhasil dibuat.', 'sukses', 5000);
      }).catch(function (err) {
        if (window.console) console.error(err);
        lapor('Gagal membuat PDF: ' + (err && err.message), 1);
        form.querySelectorAll('button, input, select').forEach(function (x) { x.disabled = x.hasAttribute('data-kunci'); });
      });
    });
    form.querySelectorAll('input[disabled]').forEach(function (x) { x.setAttribute('data-kunci', ''); });
    d.showModal();
    form.judul.focus();
    form.judul.select();
  }

  // ------------------------------------------------------------------ peta SVG (port dari scripts/peta_svg.py)
  function dp(pts, tol) {
    var n = pts.length;
    if (n < 4) return pts;
    var keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    var st = [[0, n - 1]], t2 = tol * tol;
    while (st.length) {
      var ab = st.pop(), a = ab[0], b = ab[1];
      var ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L2 = dx * dx + dy * dy;
      var best = -1, idx = -1;
      for (var i = a + 1; i < b; i++) {
        var px = pts[i][0], py = pts[i][1], d2;
        if (L2 === 0) d2 = (px - ax) * (px - ax) + (py - ay) * (py - ay);
        else { var t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; var qx = ax + t * dx - px, qy = ay + t * dy - py; d2 = qx * qx + qy * qy; }
        if (d2 > best) { best = d2; idx = i; }
      }
      if (best > t2 && idx > 0) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
    }
    return pts.filter(function (p, i) { return keep[i]; });
  }
  function proyeksi(bbox, box) {
    var lon0 = bbox[0], lat0 = bbox[1], lon1 = bbox[2], lat1 = bbox[3];
    var kx = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
    var gw = (lon1 - lon0) * kx, gh = lat1 - lat0;
    var sc = Math.min(box[2] / gw, box[3] / gh);
    var ox = box[0] + (box[2] - gw * sc) / 2 - lon0 * kx * sc;
    var oy = box[1] + (box[3] - gh * sc) / 2 + lat1 * sc;
    return {
      xy: function (lon, lat) { return [lon * kx * sc + ox, -lat * sc + oy]; },
      lonlat: function (x, y) { return [(x - ox) / (kx * sc), -(y - oy) / sc]; },
      kmPerPx: 111.32 / sc
    };
  }
  function jalur(geom, pr, tol, minLuas) {
    var out = '';
    var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    polys.forEach(function (poly) {
      for (var k = 0; k < poly.length; k++) {
        var pts = poly[k].map(function (c) { return pr.xy(c[0], c[1]); });
        var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        pts.forEach(function (p) { if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]; if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1]; });
        if ((mxx - mnx) * (mxy - mny) < minLuas) { if (k === 0) break; continue; }
        pts = dp(pts, tol);
        if (pts.length < 3) continue;
        out += 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'Z';
      }
    });
    return out;
  }
  function tumpang(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }
  function gabungBbox(bbs) {
    return [Math.min.apply(null, bbs.map(function (b) { return b[0]; })), Math.min.apply(null, bbs.map(function (b) { return b[1]; })),
      Math.max.apply(null, bbs.map(function (b) { return b[2]; })), Math.max.apply(null, bbs.map(function (b) { return b[3]; }))];
  }
  function langkahGrid(span) { return [0.25, 0.5, 1, 2, 5, 10].find(function (s) { return span / s <= 6; }) || 10; }
  function labelDerajat(v, pos, neg) { if (Math.abs(v) < 1e-9) return '0°'; return Math.abs(+v.toFixed(2)) + '° ' + (v > 0 ? pos : neg); }

  function petaSVG(spec, W, H) {
    var G = window.IRBI_GEO_DETAIL, NS = 'http://www.w3.org/2000/svg';
    var kabF = G.kabkota.features, provF = G.provinsi.features;
    var lingkupProv = spec.tingkat === 'kabkota' ? spec.prov : '';
    var fokus = spec.tingkat === 'provinsi' ? provF : kabF.filter(function (f) { return !lingkupProv || f.properties.kode.split('.')[0] === lingkupProv; });
    var bbox = lingkupProv ? gabungBbox(fokus.map(function (f) { return f.properties.bbox; })) : BBOX_INDONESIA.slice();
    var pad = lingkupProv ? 0.07 : 0.0;
    var dx = (bbox[2] - bbox[0]) * pad, dy = (bbox[3] - bbox[1]) * pad;
    var ml = 64, mr = 14, mt = 30, mb = 34;
    var frame = [ml, mt, W - ml - mr, H - mt - mb];
    var pr = proyeksi([bbox[0] - dx, bbox[1] - dy, bbox[2] + dx, bbox[3] + dy], frame);
    var tl = pr.lonlat(frame[0], frame[1]), br = pr.lonlat(frame[0] + frame[2], frame[1] + frame[3]);
    var vis = [tl[0], br[1], br[0], tl[1]];
    var o = [];
    o.push('<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    o.push('<defs><clipPath id="irbi-klip"><rect x="' + frame[0] + '" y="' + frame[1] + '" width="' + frame[2] + '" height="' + frame[3] + '"/></clipPath></defs>');
    o.push('<g clip-path="url(#irbi-klip)">');
    o.push('<rect x="' + frame[0] + '" y="' + frame[1] + '" width="' + frame[2] + '" height="' + frame[3] + '" fill="#DCEBF1"/>');
    // darat konteks
    if (lingkupProv) {
      var ctx = kabF.filter(function (f) { return f.properties.kode.split('.')[0] !== lingkupProv && tumpang(f.properties.bbox, vis); })
        .map(function (f) { return jalur(f.geometry, pr, 0.9, 2); }).join('');
      if (ctx) o.push('<path d="' + ctx + '" fill="#EFEDE7" stroke="#C9C6BC" stroke-width="0.7" fill-rule="evenodd"/>');
    }
    // wilayah fokus dikelompokkan menurut warna
    var grup = {};
    var redup = '#C3CBCF', tanpa = '#E2E5E7';
    fokus.forEach(function (f) {
      var kode = f.properties.kode;
      var v = I.nilai(spec.indeks, kode);
      var cocok = spec.setCocok.has(kode);
      var warna = !cocok ? redup : (v && v.kelas ? I.warnaKelas(v.kelas) : tanpa);
      var d = jalur(f.geometry, pr, 0.6, 0.6);
      if (d) (grup[warna] = grup[warna] || []).push(d);
    });
    Object.keys(grup).forEach(function (w) {
      o.push('<path d="' + grup[w].join('') + '" fill="' + w + '" stroke="#FFFFFF" stroke-width="' + (lingkupProv ? 1.1 : 0.6) + '" stroke-linejoin="round" fill-rule="evenodd"/>');
    });
    // batas provinsi
    var bp = provF.filter(function (f) { return tumpang(f.properties.bbox, vis); }).map(function (f) { return jalur(f.geometry, pr, 0.8, 4); }).join('');
    if (bp) o.push('<path d="' + bp + '" fill="none" stroke="#3E4C52" stroke-width="' + (spec.tingkat === 'provinsi' ? 1.2 : 1.5) + '" stroke-linejoin="round"/>');
    // graticule
    var step = langkahGrid(Math.max(vis[2] - vis[0], vis[3] - vis[1]));
    var g = '';
    for (var lon = Math.ceil(vis[0] / step) * step; lon <= vis[2]; lon += step) { var x = pr.xy(lon, 0)[0]; g += 'M' + x.toFixed(1) + ' ' + frame[1] + 'V' + (frame[1] + frame[3]); }
    for (var lat = Math.ceil(vis[1] / step) * step; lat <= vis[3]; lat += step) { var y = pr.xy(0, lat)[1]; g += 'M' + frame[0] + ' ' + y.toFixed(1) + 'H' + (frame[0] + frame[2]); }
    o.push('<path d="' + g + '" fill="none" stroke="#7A8C96" stroke-width="0.6" stroke-dasharray="4 4" stroke-opacity="0.7"/>');
    // label
    if (lingkupProv) {
      var lbl = fokus.filter(function (f) { return spec.setCocok.has(f.properties.kode); });
      if (lbl.length <= 45) {
        var fs = lbl.length <= 12 ? 17 : lbl.length <= 25 ? 15 : 12.5;
        lbl.forEach(function (f) {
          var p = pr.xy(f.properties.lng, f.properties.lat);
          var nm = aman(I.judul(I.D.idx.kab[f.properties.kode] ? I.D.idx.kab[f.properties.kode].nama : f.properties.nama));
          var esc = I.esc(nm);
          o.push('<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + fs / 3).toFixed(1) + '" font-family="helvetica" font-size="' + fs + '" font-weight="bold" text-anchor="middle" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3.2" stroke-linejoin="round">' + esc + '</text>');
          o.push('<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + fs / 3).toFixed(1) + '" font-family="helvetica" font-size="' + fs + '" font-weight="bold" text-anchor="middle" fill="#1F2D33">' + esc + '</text>');
        });
      }
    }
    o.push('</g>');
    // bingkai & koordinat
    o.push('<rect x="' + frame[0] + '" y="' + frame[1] + '" width="' + frame[2] + '" height="' + frame[3] + '" fill="none" stroke="#1F2D33" stroke-width="1.6"/>');
    for (lon = Math.ceil(vis[0] / step) * step; lon <= vis[2]; lon += step) {
      x = pr.xy(lon, 0)[0];
      o.push('<text x="' + x.toFixed(1) + '" y="' + (frame[1] - 9) + '" font-family="helvetica" font-size="14" text-anchor="middle" fill="#33454E">' + labelDerajat(lon, 'BT', 'BB') + '</text>');
    }
    for (lat = Math.ceil(vis[1] / step) * step; lat <= vis[3]; lat += step) {
      y = pr.xy(0, lat)[1];
      o.push('<text x="' + (frame[0] - 6) + '" y="' + (y + 5).toFixed(1) + '" font-family="helvetica" font-size="14" text-anchor="end" fill="#33454E">' + labelDerajat(lat, 'LU', 'LS') + '</text>');
    }
    // panah utara
    var nx = frame[0] + frame[2] - 50, ny = frame[1] + 20;
    o.push('<g transform="translate(' + nx + ' ' + ny + ')"><circle cx="0" cy="30" r="26" fill="#FFFFFF" fill-opacity="0.92" stroke="#1F2D33" stroke-width="1"/>' +
      '<path d="M0 8 L12 44 L0 36 Z" fill="#1F2D33"/><path d="M0 8 L-12 44 L0 36 Z" fill="#FFFFFF" stroke="#1F2D33" stroke-width="1"/>' +
      '<text x="0" y="2" font-family="helvetica" font-size="15" font-weight="bold" text-anchor="middle" fill="#1F2D33">U</text></g>');
    // skala batang
    var tgt = frame[2] * 0.16 * pr.kmPerPx;
    var km = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(function (n) { return n >= tgt; }) || 1000;
    var px = km / pr.kmPerPx, sx = frame[0] + frame[2] - px - 40, sy = frame[1] + frame[3] - 34;
    o.push('<g transform="translate(' + sx.toFixed(1) + ' ' + sy + ')"><rect x="-16" y="-26" width="' + (px + 50).toFixed(1) + '" height="46" rx="4" fill="#FFFFFF" fill-opacity="0.92"/>' +
      '<rect x="0" y="0" width="' + (px / 2).toFixed(1) + '" height="8" fill="#1F2D33"/><rect x="' + (px / 2).toFixed(1) + '" y="0" width="' + (px / 2).toFixed(1) + '" height="8" fill="#FFFFFF" stroke="#1F2D33" stroke-width="1"/>' +
      '<text x="0" y="-7" font-family="helvetica" font-size="12" text-anchor="middle" fill="#1F2D33">0</text>' +
      '<text x="' + (px / 2).toFixed(1) + '" y="-7" font-family="helvetica" font-size="12" text-anchor="middle" fill="#1F2D33">' + (km / 2) + '</text>' +
      '<text x="' + px.toFixed(1) + '" y="-7" font-family="helvetica" font-size="12" text-anchor="middle" fill="#1F2D33">' + km + ' km</text></g>');
    // inset lokasi (peta provinsi)
    if (lingkupProv) {
      var iw = Math.min(260, frame[2] * 0.26), ih = iw * 0.42;
      var ix = frame[0] + 10, iy = frame[1] + 10;
      var pi = proyeksi(BBOX_INDONESIA, [ix + 4, iy + 4, iw - 8, ih - 8]);
      var semua = provF.map(function (f) { return jalur(f.geometry, pi, 0.7, 0.4); }).join('');
      var ini = provF.filter(function (f) { return f.properties.kode === lingkupProv; }).map(function (f) { return jalur(f.geometry, pi, 0.4, 0.05); }).join('');
      var b = gabungBbox(fokus.map(function (f) { return f.properties.bbox; }));
      var p0 = pi.xy(b[0], b[3]), p1 = pi.xy(b[2], b[1]);
      o.push('<g><rect x="' + ix + '" y="' + iy + '" width="' + iw.toFixed(1) + '" height="' + ih.toFixed(1) + '" fill="#F4F8FA" stroke="#1F2D33" stroke-width="1"/>' +
        '<path d="' + semua + '" fill="#C9CFD2" stroke="#FFFFFF" stroke-width="0.3"/>' +
        '<path d="' + ini + '" fill="' + I.warna('primer', '#0B3C49') + '"/>' +
        '<rect x="' + (p0[0] - 3).toFixed(1) + '" y="' + (p0[1] - 3).toFixed(1) + '" width="' + (p1[0] - p0[0] + 6).toFixed(1) + '" height="' + (p1[1] - p0[1] + 6).toFixed(1) + '" fill="none" stroke="#E5242A" stroke-width="1.4"/>' +
        '<text x="' + (ix + 6) + '" y="' + (iy + ih - 6).toFixed(1) + '" font-family="helvetica" font-size="11" fill="#33454E">Lokasi</text></g>');
    }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = o.join('');
    return svg;
  }

  // ------------------------------------------------------------------ halaman PDF
  function buat(spec, opsi, lapor) {
    lapor = lapor || function () {};
    lapor('Memuat pustaka PDF…', 0.08);
    return Promise.all([I.muatPdf(), I.muatGeoDetail()]).then(function () {
      lapor('Menyusun halaman…', 0.25);
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: opsi.kertas || 'a4', compress: true });
      if (typeof doc.autoTable !== 'function' && window.jspdf_autotable) window.jspdf_autotable.applyPlugin(jsPDF);
      var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10;
      var judul = aman(opsi.judul);
      doc.setProperties({ title: judul, subject: aman(spec.filterTeks.join(' · ')), author: 'Badan Nasional Penanggulangan Bencana (edisi digital IRBI 2025)',
        keywords: 'IRBI 2025, indeks risiko bencana, ' + aman(spec.namaIndeks), creator: 'Edisi digital IRBI 2025 (jsPDF, dibuat di peramban)' });
      var C = warnaPdf();
      var dibuat = tanggal();
      var nUbah = spec.baris.filter(function (r) { return r.diubah; }).length;

      var y0 = kepala(doc, C, W, M, judul, aman(spec.subjudul + ' · ' + spec.filterTeks.slice(0, 2).join(' · ')));
      var tinggiIsi = H - y0 - 14;
      var antrian = Promise.resolve();
      if (opsi.peta || opsi.ringkasan) {
        var lebarPanel = opsi.ringkasan ? (opsi.peta ? 84 : W - 2 * M) : 0;
        var lebarPeta = opsi.peta ? W - 2 * M - (opsi.ringkasan ? lebarPanel + 5 : 0) : 0;
        if (opsi.peta) {
          antrian = antrian.then(function () {
            lapor('Menggambar peta…', 0.45);
            var skala = 8;
            var svg = petaSVG(spec, Math.round(lebarPeta * skala), Math.round(tinggiIsi * skala));
            var wadah = I.el('div', { style: 'position:fixed;left:-20000px;top:0;width:10px;height:10px;overflow:hidden', 'aria-hidden': 'true' });
            wadah.appendChild(svg);
            document.body.appendChild(wadah);
            return doc.svg(svg, { x: M, y: y0, width: lebarPeta, height: tinggiIsi }).then(function () { wadah.remove(); }, function (e) { wadah.remove(); throw e; });
          });
        }
        if (opsi.ringkasan) {
          antrian = antrian.then(function () {
            lapor('Menulis ringkasan & keterangan…', 0.62);
            panel(doc, C, spec, opsi.peta ? W - M - lebarPanel : M, y0, lebarPanel, H - 14, nUbah, dibuat, !opsi.peta);
          });
        }
      }
      return antrian.then(function () {
        if (opsi.tabel) {
          lapor('Menyusun tabel data…', 0.78);
          tabel(doc, C, spec, opsi, W, M, judul, (opsi.peta || opsi.ringkasan) ? null : y0);
        }
        lapor('Menyelesaikan…', 0.95);
        kakiSemua(doc, C, W, H, M, dibuat);
        doc.save(spec.namaBerkas);
        lapor('Selesai', 1);
        return spec.namaBerkas;
      });
    });
  }

  function kepala(doc, C, W, M, judul, sub) {
    doc.setFillColor.apply(doc, C.primer);
    doc.roundedRect(M, M, W - 2 * M, 19, 2, 2, 'F');
    var logo = window.IRBI_ASET && window.IRBI_ASET.logo;
    if (logo) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M + 3, M + 2.5, 14, 14, 1.5, 1.5, 'F');
      try { doc.addImage(logo, 'PNG', M + 4, M + 3.2, 12, 12.6); } catch (e) { /* logo opsional */ }
    }
    var tx = M + (logo ? 21 : 5);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    var uk = 14;
    doc.setFontSize(uk);
    var maks = W - 2 * M - (logo ? 21 : 5) - 46;
    while (doc.getTextWidth(judul.toUpperCase()) > maks && uk > 9) { uk -= 0.5; doc.setFontSize(uk); }
    doc.text(judul.toUpperCase(), tx, M + 8.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(214, 228, 233);
    doc.text(doc.splitTextToSize(sub, maks)[0], tx, M + 14.2);
    doc.setFontSize(7);
    doc.text(['Badan Nasional', 'Penanggulangan Bencana'], W - M - 4, M + 8, { align: 'right' });
    return M + 19 + 4;
  }

  function judulBagian(doc, C, teks, x, y, w) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor.apply(doc, C.primer);
    doc.text(aman(teks).toUpperCase(), x, y);
    doc.setDrawColor.apply(doc, C.aksen);
    doc.setLineWidth(0.4);
    doc.line(x, y + 1.2, x + w, y + 1.2);
    return y + 4.6;
  }

  function panel(doc, C, spec, x, y, w, bawah, nUbah, dibuat, lebar) {
    var st = spec.statistik, j = spec.jenis;
    var satuan = spec.tingkat === 'provinsi' ? 'provinsi' : 'kab/kota';
    var baris = function (teks, uk, warna, tebal) {
      doc.setFont('helvetica', tebal ? 'bold' : 'normal');
      doc.setFontSize(uk || 7.3);
      doc.setTextColor.apply(doc, warna || C.teks);
      var l = doc.splitTextToSize(aman(teks), w);
      doc.text(l, x, y);
      y += l.length * (uk || 7.3) * 0.42 + 0.8;
    };
    // ---- filter
    y = judulBagian(doc, C, 'Ringkasan filter', x, y, w);
    spec.filterTeks.forEach(function (t) { baris('• ' + t, 7.3); });
    y += 1.5;
    // ---- KPI 2x2
    y = judulBagian(doc, C, 'Statistik', x, y, w);
    var kw = (w - 3) / 2, kh = 13;
    var kpi = [
      ['Wilayah ditampilkan', String(st.n), 'dari ' + spec.cakupan.length + ' ' + satuan],
      ['Rata-rata skor', f2(st.rata), spec.namaIndeks],
      ['Skor tertinggi', st.maks ? f2(st.maks.skor) : '-', st.maks ? I.judul(st.maks.nama) : ''],
      ['Skor terendah', st.min ? f2(st.min.skor) : '-', st.min ? I.judul(st.min.nama) : '']
    ];
    kpi.forEach(function (k, i) {
      var kx = x + (i % 2) * (kw + 3), ky = y + Math.floor(i / 2) * (kh + 2.5);
      doc.setFillColor(246, 248, 249); doc.setDrawColor.apply(doc, C.garis); doc.setLineWidth(0.2);
      doc.roundedRect(kx, ky, kw, kh, 1.2, 1.2, 'FD');
      doc.setFillColor.apply(doc, i === 2 && st.maks ? rgb(I.warnaKelas(st.maks.kelas)) : i === 3 && st.min ? rgb(I.warnaKelas(st.min.kelas)) : C.primer);
      doc.rect(kx, ky, 1.1, kh, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.8); doc.setTextColor.apply(doc, C.abu);
      doc.text(aman(k[0]).toUpperCase(), kx + 3, ky + 3.6);
      doc.setFontSize(11.5); doc.setTextColor.apply(doc, C.primer);
      doc.text(aman(k[1]), kx + 3, ky + 8.8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor.apply(doc, C.abu);
      doc.text(doc.splitTextToSize(aman(k[2]), kw - 4)[0] || '', kx + 3, ky + 11.8);
    });
    y += 2 * kh + 2.5 + 4;
    // ---- sebaran kelas
    y = judulBagian(doc, C, 'Sebaran kelas risiko', x, y, w);
    var total = st.n || 1, bx = x;
    [['TINGGI', st.kelas.TINGGI], ['SEDANG', st.kelas.SEDANG], ['RENDAH', st.kelas.RENDAH], ['TANPA', st.tanpa]].forEach(function (k) {
      if (!k[1]) return;
      var bw = w * k[1] / total;
      doc.setFillColor.apply(doc, k[0] === 'TANPA' ? [213, 213, 213] : rgb(I.warnaKelas(k[0])));
      doc.rect(bx, y, bw, 3.2, 'F');
      bx += bw;
    });
    y += 6;
    var ket = [['TINGGI', st.kelas.TINGGI], ['SEDANG', st.kelas.SEDANG], ['RENDAH', st.kelas.RENDAH]];
    if (st.tanpa) ket.push(['TANPA', st.tanpa]);
    var rentang = j.rentang ? { RENDAH: '< ' + f2(j.batas_sedang), SEDANG: f2(j.batas_sedang) + ' - ' + f2(j.batas_tinggi), TINGGI: '> ' + f2(j.batas_tinggi) } : null;
    ket.forEach(function (k) {
      doc.setFillColor.apply(doc, k[0] === 'TANPA' ? [213, 213, 213] : rgb(I.warnaKelas(k[0])));
      doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.15);
      doc.rect(x, y - 2.6, 6, 3.4, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.3); doc.setTextColor.apply(doc, C.teks);
      doc.text(I.LABEL[k[0]], x + 8, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor.apply(doc, C.abu);
      if (rentang && rentang[k[0]]) doc.text('skor ' + rentang[k[0]], x + 26, y);
      doc.setTextColor.apply(doc, C.teks);
      doc.text(k[1] + ' (' + String(Math.round(k[1] / total * 1000) / 10).replace('.', ',') + '%)', x + w, y, { align: 'right' });
      y += 4.6;
    });
    // wilayah abu-abu yang benar-benar tergambar di peta (dalam lingkup provinsi bila ada)
    var luar = spec.cakupan.filter(function (r) { return (!spec.prov || r.prov === spec.prov) && !spec.setCocok.has(r.kode); }).length;
    if (luar) {
      doc.setFillColor(195, 203, 207); doc.rect(x, y - 2.6, 6, 3.4, 'F');
      doc.setFontSize(7); doc.setTextColor.apply(doc, C.abu);
      doc.text('Di luar filter, abu-abu pada peta (' + luar + ')', x + 8, y);
      y += 4.6;
    }
    if (!rentang) { baris('Kelas per ancaman mengikuti tabel per ancaman pada buku IRBI 2025.', 6.6, C.abu); }
    y += 1.5;
    // ---- parameter
    if (!lebar || y < bawah - 40) {
      y = judulBagian(doc, C, 'Parameter penyusun IRB 2025', x, y, w);
      PARAMETER.forEach(function (p, i) { baris((i + 1) + '. ' + p, 6.6); });
      y += 1.5;
    }
    // ---- catatan
    y = judulBagian(doc, C, 'Catatan', x, y, w);
    if (nUbah) baris('Sebagian nilai telah diubah melalui Studio edisi digital (' + nUbah + ' wilayah ditandai * pada tabel); nilai lain sesuai buku IRBI 2025.', 6.6, [154, 52, 18]);
    baris('Peta dan tabel dibuat ' + dibuat + ' dari edisi digital IRBI 2025 sesuai filter di atas.', 6.6, C.abu);
    baris('Sumber data: Buku Indeks Risiko Bencana Indonesia (IRBI) 2025, BNPB. Batas wilayah: Kepmendagri No. 300.2.2-2430 Tahun 2025 (data cahyadsn/wilayah_boundaries).', 6.6, C.abu);
  }

  function tabel(doc, C, spec, opsi, W, M, judul, mulaiY) {
    var kab = spec.tingkat === 'kabkota';
    var head, body = [], colStyles = {};
    var selSkor = function (v, tanda) {
      if (!v) return { content: '-', styles: { textColor: [150, 150, 150], halign: 'center' } };
      var w = I.warnaKelas(v.kelas);
      return { content: f2(v.skor) + (tanda && v.diubah ? '*' : ''), styles: { fillColor: rgb(w), textColor: teksAtas(w), halign: 'right' } };
    };
    var selKelas = function (k) {
      if (!k) return { content: 'Tidak dinilai', styles: { textColor: [120, 120, 120] } };
      var w = I.warnaKelas(k);
      return { content: I.LABEL[k], styles: { fillColor: rgb(w), textColor: teksAtas(w), fontStyle: 'bold', halign: 'center' } };
    };
    if (!kab) {
      head = [['No', 'Kode', 'Provinsi', 'SEB', 'IRB 2025', 'Kelas', 'Peringkat', 'Kab/kota', 'Tinggi', 'Sedang', 'Rendah']];
      spec.baris.forEach(function (r, i) {
        var anak = I.baris('irbi', { prov: r.kode }), c = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
        anak.forEach(function (a) { c[a.kelas]++; });
        body.push([i + 1, r.kode, aman(r.nama) + (r.diubah ? ' *' : ''), f2(r.seb), selSkor(r, false), selKelas(r.kelas), r.peringkat, anak.length, c.TINGGI, c.SEDANG, c.RENDAH]);
      });
      colStyles = { 0: { halign: 'center', cellWidth: 9 }, 1: { cellWidth: 11 }, 3: { halign: 'right' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' }, 9: { halign: 'center' }, 10: { halign: 'center' } };
    } else if (opsi.lengkap) {
      var jenis = I.D.jenis;
      head = [['No', 'Kode', 'Kabupaten/Kota', 'Provinsi'].concat(jenis.map(function (j) { return SINGKAT[j.slug] || j.nama; }))];
      spec.baris.forEach(function (r, i) {
        var b = [i + 1, r.kode, aman(I.judul(r.nama)), aman(r.provNama)];
        jenis.forEach(function (j) { b.push(selSkor(I.nilai(j.slug, r.kode), true)); });
        body.push(b);
      });
      colStyles = { 0: { halign: 'center', cellWidth: 7 }, 1: { cellWidth: 10 }, 2: { cellWidth: 31 }, 3: { cellWidth: 25 } };
      var aktif = jenis.map(function (j) { return j.slug; }).indexOf(spec.indeks);
      if (aktif >= 0) colStyles[4 + aktif] = { lineWidth: 0.5, lineColor: C.primer };
    } else {
      head = [['No', 'Kode', 'Kabupaten/Kota', 'Provinsi', 'Skor ' + aman(spec.namaIndeks), 'Kelas', 'Peringkat nasional']];
      spec.baris.forEach(function (r, i) {
        body.push([i + 1, r.kode, aman(I.judul(r.nama)), aman(r.provNama), r.dinilai ? selSkor(r, true) : selSkor(null), selKelas(r.dinilai ? r.kelas : null),
          r.dinilai ? r.peringkat + ' / ' + r.total : '-']);
      });
      colStyles = { 0: { halign: 'center', cellWidth: 10 }, 1: { cellWidth: 14 }, 6: { halign: 'center' } };
    }
    var pertama = mulaiY !== null;   // tabel di halaman 1 memakai kepala utama; halaman tabel lain diberi pita judul
    var halTabelAwal = null;
    if (mulaiY === null) { doc.addPage(); halTabelAwal = doc.getNumberOfPages(); }
    var startY = mulaiY === null ? 30 : mulaiY + 8;
    var judulTabel = function (y) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor.apply(doc, C.primer);
      doc.text(aman('Tabel data ' + (kab ? (opsi.lengkap ? 'lengkap (multi-bahaya & 11 ancaman)' : spec.namaIndeks) : 'provinsi') + ' - ' + spec.baris.length + ' wilayah sesuai filter'), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor.apply(doc, C.abu);
      doc.text(aman('Warna sel = kelas risiko (merah tinggi, kuning sedang, hijau rendah); "-" = tidak dinilai; * = nilai diubah melalui Studio. Urutan mengikuti tabel di aplikasi.'), M, y + 3.6);
    };
    judulTabel(startY - 6);
    doc.autoTable({
      startY: startY, head: head, body: body, theme: 'grid',
      styles: { font: 'helvetica', fontSize: kab && opsi.lengkap ? 6.2 : 7.4, cellPadding: kab && opsi.lengkap ? 0.9 : 1.3, lineColor: C.garis, lineWidth: 0.15, textColor: C.teks, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: C.primer, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: kab && opsi.lengkap ? 6.2 : 7.4 },
      alternateRowStyles: { fillColor: [244, 247, 248] },
      columnStyles: colStyles,
      margin: { top: 24, left: M, right: M, bottom: 14 },
      rowPageBreak: 'avoid',
      didDrawPage: function (data) {
        if (pertama) { pertama = false; return; }
        doc.setFillColor.apply(doc, C.primer);
        doc.rect(M, M, W - 2 * M, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
        doc.text(doc.splitTextToSize(judul, W - 2 * M - 60)[0], M + 3, M + 5.4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.text(doc.getNumberOfPages() === halTabelAwal ? 'Tabel data' : 'Tabel data (lanjutan)', W - M - 3, M + 5.4, { align: 'right' });
      }
    });
  }

  function kakiSemua(doc, C, W, H, M, dibuat) {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, C.garis); doc.setLineWidth(0.2);
      doc.line(M, H - 9, W - M, H - 9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor.apply(doc, C.abu);
      doc.text(aman('IRBI 2025 · edisi digital · dibuat ' + dibuat + ' · Sumber: Buku IRBI 2025 (BNPB); batas wilayah Kepmendagri No. 300.2.2-2430/2025'), M, H - 5.5);
      doc.text('Halaman ' + i + ' dari ' + n, W - M, H - 5.5, { align: 'right' });
    }
  }

  I.pdf = { dialog: dialog, buat: buat, petaSVG: petaSVG,
    util: { aman: aman, rgb: rgb, teksAtas: teksAtas, tanggal: tanggal, warna: warnaPdf, singkat: SINGKAT } };
})();
