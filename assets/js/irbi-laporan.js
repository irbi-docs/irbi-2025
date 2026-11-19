/* IRBI — "Laporan lengkap" sesuai filter, disusun seperti buku IRBI dan dibuat sepenuhnya di peramban
 * (jsPDF + svg2pdf.js + jspdf-autotable; tanpa server).
 *
 * - Narasi hasil (ringkasan, sebaran kelas, perbandingan nasional, profil wilayah) dihitung dari data efektif
 *   (data buku + perubahan Studio), jadi selalu sesuai filter dan tabel.
 * - Teks pendahuluan, metodologi, pengkelasan, profil provinsi, dan kutipan diambil dari sumber buku melalui
 *   assets/data/irbi-teks.js (dibuat scripts/bangun.py). Edisi berikutnya cukup memperbarui sumber .qmd/CSV.
 */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.laporan) return;
  var U = I.pdf.util, aman = U.aman, rgb = U.rgb, teksAtas = U.teksAtas;
  var PW = 210, PH = 297, ML = 20, MR = 20, MT = 24, MB = 20, LB = PW - ML - MR;
  var PT = 0.3528;                      // 1 pt dalam mm
  var KELAS = ['TINGGI', 'SEDANG', 'RENDAH'];
  var BATAS_PROFIL_KAB = 60;
  var T = {};                           // window.IRBI_TEKS

  // ================================================================== bahasa & angka
  function f2(x) { return I.fmt(x); }
  function persen(a, b) { return b ? I.fmt(a / b * 100, 1) + '%' : '0%'; }
  function seri(a) {
    a = a.filter(Boolean);
    return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + (a.length > 2 ? ', dan ' : ' dan ') + a[a.length - 1];
  }
  function kecil(k) { return (I.LABEL[k] || k || '').toLowerCase(); }
  function tahun() { return T.tahun || I.D.tahun; }
  function namaKab(kode) {
    return (T.nama_resmi && T.nama_resmi[kode]) || (I.D.idx.kab[kode] ? I.judul(I.D.idx.kab[kode].nama) : kode);
  }
  function namaProv(kode) {
    var p = I.D.idx.prov[kode];
    return p ? (/^DAERAH ISTIMEWA/.test(p.nama_buku) ? '' : 'Provinsi ') + p.nama : kode;
  }
  function multi(idx) { return idx === 'irbi' || idx === 'provinsi'; }
  function namaAncaman(idx) { return I.jenis(idx).nama.toLowerCase(); }
  function namaIRB(idx) { return multi(idx) ? 'IRB multi-bahaya' : 'IRB ' + namaAncaman(idx); }
  function namaIRBPanjang(idx) { return 'Indeks Risiko Bencana (IRB) ' + (multi(idx) ? 'multi-bahaya' : namaAncaman(idx)); }
  function normal(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function uniq(a) { var o = {}; return a.filter(function (x) { return o[x] ? false : (o[x] = 1); }); }
  function jeda() { return new Promise(function (ok) { setTimeout(ok, 0); }); }

  function stat(rows) {
    var d = rows.filter(function (r) { return r.dinilai && r.skor !== null && r.skor !== undefined; });
    var urut = d.slice().sort(function (a, b) { return b.skor - a.skor; });
    var sk = urut.map(function (r) { return r.skor; }).reverse();
    var n = sk.length, k = { TINGGI: 0, SEDANG: 0, RENDAH: 0 };
    d.forEach(function (r) { if (k[r.kelas] !== undefined) k[r.kelas]++; });
    return {
      n: rows.length, dinilai: n, tanpa: rows.length - n, kelas: k, urut: urut,
      rata: n ? sk.reduce(function (s, x) { return s + x; }, 0) / n : null,
      median: n ? (n % 2 ? sk[(n - 1) / 2] : (sk[n / 2 - 1] + sk[n / 2]) / 2) : null,
      maks: urut[0] || null, min: urut[n - 1] || null
    };
  }

  function konteks(spec) {
    var idx = spec.tingkat === 'provinsi' ? 'provinsi' : spec.indeks;
    var rows = spec.baris, prov = spec.tingkat === 'provinsi';
    var nasRows = I.baris(idx);
    var provs = uniq(rows.map(function (r) { return prov ? r.kode : r.prov; })).sort();
    var samaNas = rows.length === nasRows.length;
    var lingkup;
    if (prov) lingkup = samaNas ? 'di Indonesia' : 'sesuai filter';
    else if (spec.prov) lingkup = 'di ' + namaProv(spec.prov);
    else if (provs.length === 1) lingkup = 'di ' + namaProv(provs[0]);
    else lingkup = samaNas ? 'di seluruh Indonesia' : 'yang tersebar di ' + provs.length + ' provinsi';
    return {
      idx: idx, prov: prov, rows: rows, st: stat(rows), nas: stat(nasRows), samaNas: samaNas, provs: provs, kelasFilter: spec.kelasFilter || null,
      satuan: prov ? 'provinsi' : 'kabupaten/kota', lingkup: lingkup,
      nUbah: rows.filter(function (r) { return r.diubah; }).length, multiProv: provs.length > 1
    };
  }

  function namaRow(r, ctx) { return ctx.prov ? namaProv(r.kode) : namaKab(r.kode); }

  // ================================================================== narasi (dihitung dari data)
  /** kelasFilter: kelas yang dipilih pada filter (null = semua). Kelas yang disaring tidak disebut "tidak ada". */
  function kalimatSebaran(st, satuan, idx, kelasFilter) {
    if (!st.dinilai) return 'Tidak ada ' + satuan + ' yang dinilai pada cakupan ini.';
    var ada = [], nol = [];
    KELAS.forEach(function (k) {
      if (st.kelas[k]) ada.push(st.kelas[k] + ' (' + persen(st.kelas[k], st.dinilai) + ')' + (ada.length ? ' pada kelas ' : ' berada pada kelas risiko ') + kecil(k));
      else if (!kelasFilter || kelasFilter.indexOf(k) >= 0) nol.push(kecil(k));
    });
    var s = 'Dari ' + st.dinilai + ' ' + satuan + ' yang dinilai, ' + seri(ada);
    if (nol.length) s += ', sedangkan tidak ada yang berada pada kelas ' + seri(nol).replace(' dan ', ' maupun ');
    s += '.';
    var dom = KELAS.filter(function (k) { return st.kelas[k] / st.dinilai > 0.5; })[0];
    if (kelasFilter) s += ' Sesuai filter, laporan ini hanya memuat ' + satuan + ' dengan kelas ' +
      seri(kelasFilter.map(function (k) { return kecil(k); })) + '.';
    else if (dom) s += ' Dengan demikian, sebagian besar ' + satuan + ' pada laporan ini berada pada kelas risiko ' + kecil(dom) + '.';
    if (st.tanpa && !multi(idx)) s += ' Selain itu, ' + st.tanpa + ' ' + satuan + ' tidak dinilai untuk ancaman ' + namaAncaman(idx) + '.';
    return s;
  }
  function kalimatRata(ctx) {
    var st = ctx.st, nas = ctx.nas;
    if (!st.dinilai) return '';
    var s = 'Rata-rata skor ' + namaIRB(ctx.idx) + ' pada ' + ctx.satuan + ' yang dimuat adalah ' + f2(st.rata);
    if (ctx.samaNas) s += ', yang sekaligus merupakan rata-rata nasional.';
    else {
      var sel = st.rata - nas.rata, rel = nas.rata ? sel / nas.rata * 100 : 0;
      if (Math.abs(rel) < 1) s += ', relatif setara dengan rata-rata nasional sebesar ' + f2(nas.rata) + '.';
      else s += ', ' + (sel > 0 ? 'lebih tinggi' : 'lebih rendah') + ' ' + f2(Math.abs(sel)) + ' poin (' + I.fmt(Math.abs(rel), 1) +
        '%) dibandingkan rata-rata nasional sebesar ' + f2(nas.rata) + ' dari ' + nas.dinilai + ' ' + ctx.satuan + ' yang dinilai.';
    }
    if (st.dinilai > 1) s += ' Nilai tengah (median) skornya ' + f2(st.median) + ', dengan rentang ' + f2(st.min.skor) + ' hingga ' + f2(st.maks.skor) + '.';
    return s;
  }
  function kalimatEkstrem(ctx) {
    var st = ctx.st;
    if (st.dinilai < 2) return '';
    var nm = function (r) { return namaRow(r, ctx) + (ctx.multiProv && !ctx.prov ? ' (' + namaProv(r.prov) + ')' : ''); };
    var ket = function (r) { return f2(r.skor) + (r.diubah ? '*' : '') + '; kelas ' + kecil(r.kelas) + '; peringkat ' + r.peringkat + ' dari ' + r.total + ' secara nasional'; };
    return 'Skor tertinggi dimiliki oleh ' + nm(st.maks) + ' (' + ket(st.maks) + '), sedangkan skor terendah dimiliki oleh ' + nm(st.min) + ' (' + ket(st.min) + ').';
  }
  function kalimatTeratas(ctx) {
    if (ctx.st.dinilai < 6) return '';
    return 'Lima ' + ctx.satuan + ' dengan skor tertinggi adalah ' +
      seri(ctx.st.urut.slice(0, 5).map(function (r) { return namaRow(r, ctx) + ' (' + f2(r.skor) + ')'; })) + '.';
  }
  function rekapProv(rows) {
    var m = {};
    rows.forEach(function (r) { (m[r.prov] = m[r.prov] || { kode: r.prov, rows: [] }).rows.push(r); });
    return Object.keys(m).map(function (k) { m[k].st = stat(m[k].rows); return m[k]; });
  }
  function kalimatSebaranProv(ctx) {
    if (ctx.prov || !ctx.multiProv) return '';
    var g = rekapProv(ctx.rows).filter(function (x) { return x.st.kelas.TINGGI; })
      .sort(function (a, b) { return b.st.kelas.TINGGI - a.st.kelas.TINGGI || b.st.rata - a.st.rata; }).slice(0, 3);
    var s = 'Wilayah yang dimuat tersebar di ' + ctx.provs.length + ' provinsi.';
    if (g.length) s += ' Provinsi dengan jumlah kabupaten/kota berkelas risiko tinggi terbanyak adalah ' +
      seri(g.map(function (x, i) { return namaProv(x.kode) + ' (' + x.st.kelas.TINGGI + (i ? '' : ' kabupaten/kota') + ')'; })) + '.';
    return s;
  }
  function kalimatAmbang(idx) {
    var j = I.jenis(idx);
    if (multi(idx)) return 'Pengelasan mengikuti ambang IRBI ' + tahun() + ': rendah < ' + f2(j.batas_sedang) + ', sedang ' + f2(j.batas_sedang) +
      '–' + f2(j.batas_tinggi) + ', dan tinggi > ' + f2(j.batas_tinggi) + (j.diubah ? ' (ambang telah diubah melalui Studio)' : '') + '.';
    return 'Kelas risiko per ancaman mengikuti tabel per ancaman pada buku IRBI ' + tahun() + (j.diubah ? '; ambang ancaman ini telah diubah melalui Studio' : '') + '.';
  }

  // ================================================================== gambar (sampul & lambang)
  function muatGambar(url, maks, format) {
    return new Promise(function (ok) {
      var img = new Image(), beres = false;
      var akhiri = function (v) { if (!beres) { beres = true; clearTimeout(t); ok(v); } };
      var t = setTimeout(function () { akhiri(null); }, 8000);
      img.onload = function () {
        try {
          var s = Math.min(1, (maks || 1200) / img.naturalWidth);
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
          var g = c.getContext('2d');
          if (format !== 'PNG') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(img, 0, 0, c.width, c.height);
          akhiri({ data: c.toDataURL(format === 'PNG' ? 'image/png' : 'image/jpeg', 0.8), w: c.width, h: c.height, format: format || 'JPEG' });
        } catch (e) { akhiri(null); }   // dibuka dari berkas (file://): kanvas "tercemar", gambar dilewati
      };
      img.onerror = function () { akhiri(null); };
      img.src = url;
    });
  }

  // ================================================================== penulis halaman (alur teks seperti buku)
  function Penulis(doc, C) {
    this.doc = doc; this.C = C; this.y = MT; this.isi = []; this.bab = ''; this.babHal = {}; this.halBabAwal = {};
    this.noBab = 0; this.noSub = 0; this.noGbr = 0; this.noTbl = 0; this.outline = {};
  }
  var P = Penulis.prototype;
  P.hal = function () { return this.doc.getNumberOfPages(); };
  P.halBaru = function () { this.doc.addPage('a4', 'portrait'); this.y = MT; this.babHal[this.hal()] = this.bab; };
  P.muat = function (h) { if (this.y + h > PH - MB) { this.halBaru(); return true; } return false; };
  P.huruf = function (gaya, uk, warna) {
    var d = this.doc;
    d.setFont('helvetica', gaya || 'normal'); d.setFontSize(uk); d.setTextColor.apply(d, warna || this.C.teks);
  };
  function rataPenuh(d, b, x, y, w) {
    var kata = b.trim().split(/\s+/);
    if (kata.length < 2) { d.text(b, x, y); return; }
    var lebar = kata.reduce(function (s, k) { return s + d.getTextWidth(k); }, 0);
    var celah = (w - lebar) / (kata.length - 1);
    if (celah > d.getTextWidth(' ') * 3.2) { d.text(b, x, y); return; }   // jangan renggangkan berlebihan
    var cx = x;
    kata.forEach(function (k) { d.text(k, cx, y); cx += d.getTextWidth(k) + celah; });
  }
  P.paragraf = function (teks, o) {
    o = o || {};
    if (!teks) return;
    var d = this.doc, uk = o.uk || 10, lh = uk * PT * (o.spasi || 1.42), x = ML + (o.kiri || 0), w = (o.lebar || LB) - (o.kiri || 0);
    var gaya = o.gaya || 'normal', warna = o.warna || this.C.teks;
    this.huruf(gaya, uk, warna);
    var baris = d.splitTextToSize(aman(teks), w);
    this.muat(lh * Math.min(2, baris.length));
    for (var i = 0; i < baris.length; i++) {
      if (this.y + lh > PH - MB) { this.halBaru(); this.huruf(gaya, uk, warna); }
      var yb = this.y + uk * PT * 0.82;
      if (o.rata === 'tengah') d.text(baris[i], x + w / 2, yb, { align: 'center' });
      else if (o.rata !== 'kiri' && i < baris.length - 1) rataPenuh(d, baris[i], x, yb, w);
      else d.text(baris[i], x, yb);
      if (i === 0 && o.penanda) { d.text(o.penanda, ML + (o.kiriPenanda || 0), yb); }
      this.y += lh;
    }
    this.y += o.jarak === undefined ? uk * PT * 0.65 : o.jarak;
  };
  P.daftar = function (butir, nomor, o) {
    var self = this;
    o = o || {};
    butir.forEach(function (b, i) {
      self.paragraf(b, { kiri: (o.kiri || 0) + 6, kiriPenanda: (o.kiri || 0) + 1, penanda: nomor ? (i + 1) + '.' : '•', jarak: 1.2, uk: o.uk });
    });
    this.y += 1.8;
  };
  P.catatOutline = function (tingkat, judul) {
    try {
      var induk = tingkat === 1 ? null : this.outline[1] || null;
      var n = this.doc.outline.add(induk, aman(judul), { pageNumber: this.hal() });
      this.outline[tingkat] = n;
    } catch (e) { /* bookmark opsional */ }
  };
  /** Bab baru: selalu mulai di halaman baru, dengan pembuka bergaya buku. */
  P.mulaiBab = function (judul, label) {
    this.bab = judul; this.noSub = 0;
    var no = label || ('BAB ' + (++this.noBab));
    this.halBaru();
    this.halBabAwal[this.hal()] = true;
    var d = this.doc, C = this.C, y = MT - 2;
    d.setFillColor.apply(d, C.primer); d.rect(0, 0, PW, 7, 'F');
    d.setFillColor.apply(d, C.aksen); d.rect(0, 7, PW, 1.1, 'F');
    this.huruf('bold', 9, C.aksen);
    d.text(no, ML, y + 6, { charSpace: 0.6 });
    this.huruf('bold', 22, C.primer);
    var l = d.splitTextToSize(aman(judul), LB);
    d.text(l, ML, y + 16);
    y += 16 + (l.length - 1) * 9;
    d.setDrawColor.apply(d, C.aksen); d.setLineWidth(1.1); d.line(ML, y + 5, ML + 26, y + 5);
    d.setDrawColor.apply(d, C.garis); d.setLineWidth(0.25); d.line(ML + 28, y + 5, PW - MR, y + 5);
    this.y = y + 13;
    this.isi.push({ tingkat: 1, label: label ? label.replace(/^LAMPIRAN/, 'Lampiran') : 'Bab ' + this.noBab, judul: judul, hal: this.hal() });
    this.catatOutline(1, (label ? label.replace(/^LAMPIRAN/, 'Lampiran') : this.noBab + '.') + ' ' + judul);
  };
  P.subjudul = function (judul, opsi) {
    opsi = opsi || {};
    this.y += 2;
    this.muat(opsi.ruang || 24);
    var no = this.noBab && !opsi.tanpaNomor ? this.noBab + '.' + (++this.noSub) + ' ' : '';
    var d = this.doc, C = this.C;
    this.huruf('bold', 13, C.primer);
    var l = d.splitTextToSize(aman(no + judul), LB - (opsi.kanan || 0));
    d.text(l, ML, this.y + 4.6);
    this.y += 4.6 + (l.length - 1) * 5.6 + 3;
    d.setDrawColor.apply(d, C.aksen); d.setLineWidth(0.5); d.line(ML, this.y - 1, ML + 14, this.y - 1);
    this.y += 3;
    this.isi.push({ tingkat: 2, label: no.trim(), judul: judul, hal: this.hal(), bab: this.bab });
    this.catatOutline(2, no + judul);
  };
  P.subsub = function (judul) {
    this.y += 1;
    this.muat(16);
    this.huruf('bold', 10.5, this.C.teks);
    this.doc.text(aman(judul), ML, this.y + 3.8);
    this.y += 7;
  };
  P.keterangan = function (teks, posisi) {      // keterangan gambar/tabel bergaya buku
    if (posisi === 'atas') this.muat(26);
    this.huruf('bold', 8.6, this.C.primer);
    var d = this.doc, l = d.splitTextToSize(aman(teks), LB);
    d.text(l, ML, this.y + 3.2);
    this.y += 3.2 + l.length * 3.8 + (posisi === 'atas' ? 0.6 : 2.5);
  };
  P.sumber = function (teks) {
    this.paragraf(teks, { uk: 7.6, gaya: 'italic', warna: this.C.abu, rata: 'kiri', jarak: 3 });
  };
  P.kutipan = function (teks, sumber) {
    var d = this.doc, C = this.C, uk = 11.5, lh = uk * PT * 1.42;
    this.huruf('bolditalic', uk, C.primer);
    var l = d.splitTextToSize(aman(teks), LB - 22);
    var h = l.length * lh + (sumber ? 7 : 3) + 6;
    this.muat(h + 4);
    var y0 = this.y + 2;
    d.setFillColor(244, 247, 248); d.rect(ML, y0, LB, h, 'F');
    d.setFillColor.apply(d, C.aksen); d.rect(ML, y0, 1.6, h, 'F');
    this.huruf('bold', 30, C.aksen); d.text('“', ML + 5, y0 + 12);
    this.huruf('bolditalic', uk, C.primer);
    l.forEach(function (b, i) { d.text(b, ML + 15, y0 + 6 + uk * PT * 0.82 + i * lh); });
    if (sumber) { this.huruf('normal', 7.6, C.abu); d.text(aman(sumber), ML + 15, y0 + h - 3.5); }
    this.y = y0 + h + 5;
  };
  P.rumus = function (r) {
    var d = this.doc, C = this.C;
    this.muat(26);
    var y = this.y + 4, cx = PW / 2;
    d.setFillColor(244, 247, 248); d.roundedRect(ML + 18, y - 2, LB - 36, 20, 2, 2, 'F');
    if (!r.atas) { this.huruf('bold', 11, C.primer); d.text(aman(r.teks || ''), cx, y + 10, { align: 'center' }); this.y = y + 24; return; }
    this.huruf('bold', 11, C.primer);
    var kiri = aman(r.kiri), kanan = aman(r.kanan) + ' ×', atas = aman(r.atas), bawah = aman(r.bawah);
    var wk = d.getTextWidth(kiri), wka = d.getTextWidth(kanan), wf = Math.max(d.getTextWidth(atas), d.getTextWidth(bawah));
    var total = wk + 9 + wka + 3 + wf, x = cx - total / 2, yb = y + 9.3;
    d.text(kiri, x, yb);
    x += wk + 2.2;
    d.setFontSize(12); d.text('~', x, yb - 1.4); d.text('~', x, yb + 0.5);   // tanda "kira-kira sama dengan"
    d.setFontSize(11);
    x += 6.8;
    d.text(kanan, x, yb);
    x += wka + 3;
    d.text(atas, x + wf / 2, yb - 3.4, { align: 'center' });
    d.setDrawColor.apply(d, C.primer); d.setLineWidth(0.35); d.line(x, yb - 1.4, x + wf, yb - 1.4);
    d.text(bawah, x + wf / 2, yb + 3.6, { align: 'center' });
    this.y = y + 24;
  };
  /** Teks sel tabel juga harus aman untuk huruf standar PDF (mis. "→" pada tabel klasifikasi buku). */
  function selAman(c) {
    if (c === null || c === undefined) return '';
    if (typeof c === 'object') { if (typeof c.content === 'string') c.content = aman(c.content); return c; }
    return aman(String(c));
  }
  /** Tabel (autoTable). Keterangan di atas tabel, seperti buku. */
  P.tabel = function (head, body, o) {
    o = o || {};
    var d = this.doc, C = this.C;
    if (o.judul) this.keterangan('Tabel ' + (++this.noTbl) + '. ' + o.judul, 'atas');
    head = head.map(function (r) { return r.map(selAman); });
    body = body.map(function (r) { return r.map(selAman); });
    var self = this;
    d.autoTable({
      startY: this.y, head: head, body: body, theme: 'grid',
      margin: { left: ML + (o.kiri || 0), right: MR, top: MT, bottom: MB },
      tableWidth: o.lebar || 'auto',
      styles: { font: 'helvetica', fontSize: o.uk || 8, cellPadding: o.pad === undefined ? 1.3 : o.pad, lineColor: C.garis, lineWidth: 0.15,
        textColor: C.teks, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: C.primer, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle', fontSize: o.ukKepala || o.uk || 8 },
      alternateRowStyles: { fillColor: [246, 248, 249] },
      columnStyles: o.kolom || {}, rowPageBreak: 'avoid', showHead: 'everyPage',
      didAddPage: function () { self.babHal[self.hal()] = self.bab; }
    });
    this.y = d.lastAutoTable.finalY + (o.jarak === undefined ? 5 : o.jarak);
  };
  P.gambarSVG = function (svg, w, h) {
    var d = this.doc, x = ML + (LB - w) / 2, y = this.y;
    var wadah = I.el('div', { style: 'position:fixed;left:-20000px;top:0;width:10px;height:10px;overflow:hidden', 'aria-hidden': 'true' });
    wadah.appendChild(svg);
    document.body.appendChild(wadah);
    var self = this;
    return d.svg(svg, { x: x, y: y, width: w, height: h }).then(function () { wadah.remove(); self.y = y + h + 2; }, function (e) { wadah.remove(); throw e; });
  };

  // ------------------------------------------------------------------ elemen grafis
  function selKelas(k, uk) {
    if (!k) return { content: 'Tidak dinilai', styles: { textColor: [130, 130, 130], halign: 'center', fontSize: uk } };
    var w = I.warnaKelas(k);
    return { content: I.LABEL[k], styles: { fillColor: rgb(w), textColor: teksAtas(w), fontStyle: 'bold', halign: 'center' } };
  }
  /** Sel teks dari tabel buku: nama kelas ("Rendah", "Sedang", "Tinggi") diwarnai sesuai kelasnya. */
  function selBuku(c) {
    var k = { rendah: 'RENDAH', sedang: 'SEDANG', tinggi: 'TINGGI' }[normal(c)];
    return k ? selKelas(k) : c;
  }
  // label kolom sempit (tabel lampiran & pita profil kab/kota), dipecah dua baris dengan sengaja
  var LABEL_SEMPIT = {
    'irbi': 'Multi-\nbahaya', 'banjir': 'Banjir', 'gempabumi': 'Gempa-\nbumi', 'tsunami': 'Tsunami', 'letusan-gunungapi': 'Gunung\napi',
    'banjir-bandang': 'Banjir\nbandang', 'gelombang-ekstrem-abrasi': 'Gel. &\nabrasi', 'kebakaran-hutan-lahan': 'Karhutla',
    'tanah-longsor': 'Tanah\nlongsor', 'kekeringan': 'Keke-\nringan', 'likuefaksi': 'Likue-\nfaksi', 'cuaca-ekstrem': 'Cuaca\nekstrem'
  };
  function labelSempit(j) { return LABEL_SEMPIT[j.slug] || j.nama; }
  function selSkor(v, uk) {
    if (!v) return { content: '–', styles: { textColor: [150, 150, 150], halign: 'center' } };
    var w = I.warnaKelas(v.kelas);
    return { content: f2(v.skor) + (v.diubah ? '*' : ''), styles: { fillColor: rgb(w), textColor: teksAtas(w), halign: 'right', fontSize: uk } };
  }
  function selJumlah(n, k) {
    if (!n) return { content: '0', styles: { halign: 'center', textColor: [150, 150, 150] } };
    return { content: String(n), styles: { halign: 'center', fontStyle: 'bold', fillColor: rgb(I.warnaUtil.campur(I.warnaKelas(k), '#FFFFFF', 0.62)) } };
  }
  P.kpi = function (item) {
    var d = this.doc, C = this.C, n = item.length, g = 3, w = (LB - g * (n - 1)) / n, h = 17;
    this.muat(h + 4);
    var y = this.y;
    item.forEach(function (k, i) {
      var x = ML + i * (w + g);
      d.setFillColor(246, 248, 249); d.setDrawColor.apply(d, C.garis); d.setLineWidth(0.2);
      d.roundedRect(x, y, w, h, 1.4, 1.4, 'FD');
      d.setFillColor.apply(d, k.warna ? rgb(k.warna) : C.primer); d.rect(x, y, 1.2, h, 'F');
      d.setFont('helvetica', 'bold'); d.setFontSize(6.2); d.setTextColor.apply(d, C.abu);
      d.text(aman(k.label).toUpperCase(), x + 3.5, y + 4.6);
      d.setFontSize(14); d.setTextColor.apply(d, C.primer);
      d.text(aman(k.nilai), x + 3.5, y + 11);
      d.setFont('helvetica', 'normal'); d.setFontSize(6.4); d.setTextColor.apply(d, C.abu);
      d.text(d.splitTextToSize(aman(k.ket || ''), w - 5)[0] || '', x + 3.5, y + 14.8);
    });
    this.y = y + h + 5;
  };
  P.batangSebaran = function (st) {
    var d = this.doc, C = this.C, total = st.n || 1, x = ML;
    this.muat(16);
    var y = this.y;
    [['TINGGI', st.kelas.TINGGI], ['SEDANG', st.kelas.SEDANG], ['RENDAH', st.kelas.RENDAH], ['TANPA', st.tanpa]].forEach(function (k) {
      if (!k[1]) return;
      var w = LB * k[1] / total, warna = k[0] === 'TANPA' ? '#D5D5D5' : I.warnaKelas(k[0]);
      d.setFillColor.apply(d, rgb(warna)); d.rect(x, y, w, 6, 'F');
      if (w > 14) {
        d.setFont('helvetica', 'bold'); d.setFontSize(7); d.setTextColor.apply(d, teksAtas(warna));
        d.text(k[1] + ' (' + persen(k[1], total) + ')', x + w / 2, y + 4.1, { align: 'center' });
      }
      x += w;
    });
    y += 9.5;
    var lx = ML;
    [['TINGGI', st.kelas.TINGGI], ['SEDANG', st.kelas.SEDANG], ['RENDAH', st.kelas.RENDAH]].concat(st.tanpa ? [['TANPA', st.tanpa]] : []).forEach(function (k) {
      var warna = k[0] === 'TANPA' ? '#D5D5D5' : I.warnaKelas(k[0]);
      d.setFillColor.apply(d, rgb(warna)); d.setDrawColor(150, 150, 150); d.setLineWidth(0.15); d.rect(lx, y - 2.6, 4, 3.2, 'FD');
      d.setFont('helvetica', 'normal'); d.setFontSize(7.6); d.setTextColor.apply(d, C.teks);
      var t = I.LABEL[k[0]] + ': ' + k[1];
      d.text(t, lx + 5.5, y);
      lx += 5.5 + d.getTextWidth(t) + 7;
    });
    this.y = y + 5;
  };
  /** Grafik batang horizontal (skor per wilayah, diwarnai kelas). */
  P.grafikBatang = function (item, o) {
    o = o || {};
    var d = this.doc, C = this.C, bh = 4.1, g = 1.3, lw = o.lebarLabel || 56, x0 = ML + lw + 2, w = LB - lw - 16;
    var maks = Math.max.apply(null, item.map(function (it) { return it.nilai; })) || 1;
    var langkah = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find(function (s) { return maks / s <= 6; }) || 100;
    var ujung = Math.ceil(maks / langkah) * langkah;
    var tinggi = item.length * (bh + g) + 8;
    this.muat(Math.min(tinggi, 60) + 8);
    var y = this.y + 2, self = this;
    var sumbu = function (y1, y2) {
      d.setDrawColor(222, 228, 231); d.setLineWidth(0.2);
      for (var v = 0; v <= ujung + 1e-9; v += langkah) {
        var gx = x0 + w * v / ujung;
        d.line(gx, y1, gx, y2);
        d.setFont('helvetica', 'normal'); d.setFontSize(6.4); d.setTextColor.apply(d, C.abu);
        d.text(I.fmt(v, langkah < 1 ? 1 : 0), gx, y2 + 3.2, { align: 'center' });
      }
    };
    var awal = y, i0 = 0;
    item.forEach(function (it, i) {
      if (y + bh > PH - MB - 6) { sumbu(awal - 1, y); self.halBaru(); y = self.y + 2; awal = y; i0 = i; }
      var warna = I.warnaKelas(it.kelas);
      d.setFont('helvetica', 'normal'); d.setFontSize(7.2); d.setTextColor.apply(d, C.teks);
      var lbl = d.splitTextToSize(aman(it.label), lw)[0];
      d.text(lbl, x0 - 2, y + bh * 0.72, { align: 'right' });
      d.setFillColor.apply(d, rgb(warna)); d.rect(x0, y, Math.max(0.4, w * it.nilai / ujung), bh, 'F');
      d.setFont('helvetica', 'bold'); d.setFontSize(6.8); d.setTextColor.apply(d, C.teks);
      d.text(f2(it.nilai) + (it.tanda ? '*' : ''), x0 + w * it.nilai / ujung + 1.2, y + bh * 0.72);
      y += bh + g;
    });
    sumbu(awal - 1, y);
    this.y = y + 7;
  };
  P.legenda = function (ctx, spec) {
    var d = this.doc, C = this.C, j = I.jenis(ctx.idx), st = ctx.st;
    var rentang = multi(ctx.idx) ? { RENDAH: '< ' + f2(j.batas_sedang), SEDANG: f2(j.batas_sedang) + '–' + f2(j.batas_tinggi), TINGGI: '> ' + f2(j.batas_tinggi) } : {};
    var item = KELAS.map(function (k) { return { warna: I.warnaKelas(k), teks: I.LABEL[k] + (rentang[k] ? ' (' + rentang[k] + ')' : '') + ': ' + st.kelas[k] }; });
    if (st.tanpa) item.push({ warna: '#E2E5E7', teks: 'Tidak dinilai: ' + st.tanpa });
    var luar = spec.cakupan.filter(function (r) { return (!spec.prov || r.prov === spec.prov) && !spec.setCocok.has(r.kode); }).length;
    if (luar) item.push({ warna: '#C3CBCF', teks: 'Di luar filter: ' + luar });
    this.muat(8);
    var x = ML, y = this.y + 1;
    item.forEach(function (it) {
      d.setFont('helvetica', 'normal'); d.setFontSize(7.6);
      var w = 6 + d.getTextWidth(aman(it.teks)) + 7;
      if (x + w > PW - MR) { x = ML; y += 5; }
      d.setFillColor.apply(d, rgb(it.warna)); d.setDrawColor(140, 140, 140); d.setLineWidth(0.15); d.rect(x, y - 2.7, 4.2, 3.4, 'FD');
      d.setTextColor.apply(d, C.teks); d.text(aman(it.teks), x + 5.6, y);
      x += w;
    });
    this.y = y + 5;
  };

  // ================================================================== bagian laporan
  function teksBuku(W, blok, o) {
    o = o || {};
    blok.forEach(function (b) {
      if (b.judul) {
        if (b.tingkat === 2 && !o.judulKecil) W.subjudul(b.judul);
        else W.subsub(b.judul);
      } else if (b.p) W.paragraf(b.p);
      else if (b.daftar) W.daftar(b.daftar, b.nomor);
      else if (b.rumus) W.rumus(b.rumus);
      else if (b.kutipan) W.kutipan(b.kutipan, 'Buku IRBI ' + tahun());
      else if (b.tabel && !o.tanpaTabel) {
        var t = b.tabel;
        W.tabel([t.kepala], t.baris.map(function (r) { return r.map(selBuku); }), { judul: t.judul || '', uk: 7.6 });
      }
    });
  }

  function babRingkasan(W, spec, opsi, ctx) {
    W.mulaiBab('Ringkasan');
    W.subjudul('Tentang laporan ini');
    W.paragraf('Laporan ini disusun otomatis oleh edisi digital IRBI ' + tahun() + ' berdasarkan filter yang dipilih pengguna. Narasi hasil dihitung langsung dari data, sedangkan teks pendahuluan, metodologi, dan profil provinsi dikutip dari Buku Indeks Risiko Bencana Indonesia (IRBI) ' + tahun() + ' yang diterbitkan oleh Badan Nasional Penanggulangan Bencana (BNPB).');
    W.tabel([['Filter', 'Keterangan']], spec.filterTeks.map(function (t) {
      var i = t.indexOf(': ');
      return i > 0 ? [t.slice(0, i), t.slice(i + 2)] : ['Filter', t];
    }).concat([['Jumlah wilayah', ctx.st.n + ' ' + ctx.satuan + (ctx.samaNas ? '' : ' dari ' + ctx.nas.n)], ['Dibuat', U.tanggal()]]),
    { uk: 8.4, kolom: { 0: { fontStyle: 'bold', cellWidth: 40 } } });
    if (ctx.nUbah) W.paragraf('Sebanyak ' + ctx.nUbah + ' nilai pada laporan ini telah diubah melalui Studio edisi digital dan ditandai dengan tanda bintang (*); nilai lainnya sesuai buku.', { warna: [154, 52, 18] });

    W.subjudul('Ringkasan hasil');
    var st = ctx.st;
    W.paragraf('Laporan ini menyajikan ' + namaIRBPanjang(ctx.idx) + ' tahun ' + tahun() + ' untuk ' + st.n + ' ' + ctx.satuan + ' ' + ctx.lingkup +
      (ctx.samaNas ? '' : ' yang sesuai dengan filter') + '. Nilai bersumber dari Buku IRBI ' + tahun() + ' (BNPB).');
    W.kpi([
      { label: 'Wilayah', nilai: String(st.n), ket: ctx.satuan + (ctx.samaNas ? '' : ' dari ' + ctx.nas.n) },
      { label: 'Rata-rata skor', nilai: f2(st.rata), ket: 'nasional ' + f2(ctx.nas.rata) },
      { label: 'Skor tertinggi', nilai: st.maks ? f2(st.maks.skor) : '–', ket: st.maks ? namaRow(st.maks, ctx) : '', warna: st.maks ? I.warnaKelas(st.maks.kelas) : null },
      { label: 'Skor terendah', nilai: st.min ? f2(st.min.skor) : '–', ket: st.min ? namaRow(st.min, ctx) : '', warna: st.min ? I.warnaKelas(st.min.kelas) : null }
    ]);
    W.batangSebaran(st);
    W.paragraf(kalimatSebaran(st, ctx.satuan, ctx.idx, ctx.kelasFilter));
    W.paragraf(kalimatRata(ctx));
    W.paragraf(kalimatEkstrem(ctx));
    W.paragraf(kalimatTeratas(ctx));
    W.paragraf(kalimatSebaranProv(ctx));
    W.paragraf(kalimatAmbang(ctx.idx));

    if ((T.nasional || []).length) {
      W.subjudul('Konteks nasional');
      W.sumber('Bagian ini dikutip dari Buku IRBI ' + tahun() + ' (bab Hasil Analisis Data) dan menggambarkan kondisi tingkat nasional.');
      teksBuku(W, T.nasional);
      var kt = (T.ringkasan || []).filter(function (b) { return b.kutipan; })[0];
      if (kt) W.kutipan(kt.kutipan, 'Buku IRBI ' + tahun() + ', Ringkasan Eksekutif');
    }
  }

  function babPendahuluan(W) {
    if (!(T.pendahuluan || []).length) return;
    W.mulaiBab('Pendahuluan');
    W.sumber('Teks bab ini dikutip dari Buku IRBI ' + tahun() + ' (BNPB).');
    teksBuku(W, T.pendahuluan);
  }

  /** Sarikan tabel klasifikasi buku untuk satu jenis ancaman: bobot & skor komponen, lalu indeks per kelas kapasitas. */
  function parameterAncaman(W, tabel, idx) {
    var nama = I.jenis(idx).nama, komp = [], kap = null;
    tabel.forEach(function (t) {
      var kp = t.kepala, kol = kp.findIndex(function (k) { return /parameter|jenis bencana/i.test(k); });
      var kb = kp.findIndex(function (k) { return /^bobot$/i.test(k); });
      if (kol < 0) return;
      var judul = (t.judul || '').replace(/;\s*format:.*$/i, '');
      if (kb >= 0) {                      // tabel A, B1–B3, C: Parameter | Bobot | kelas 1–3
        var kelasKol = kp.map(function (k, i) { return i; }).filter(function (i) { return i > kb; });
        t.baris.forEach(function (b) {
          if (normal(b[kol]) !== normal(nama) && !/kapasitas/i.test(b[kol])) return;
          komp.push([judul, b[kb]].concat(kelasKol.map(function (i) {
            var m = /:\s*(.+)$/.exec(kp[i]);            // "Kelas 1: < 500" → "0,4 (< 500)"
            return b[i] + (m ? '  (' + m[1] + ')' : '');
          })));
        });
      } else {                            // tabel D: Jenis bencana | Kelas risiko | C = 1..3
        var grup = '', baris = [];
        t.baris.forEach(function (b) {
          if (b[kol]) grup = b[kol];
          if (grup.split(/,\s*/).some(function (x) { return normal(x) === normal(nama); })) baris.push(b.filter(function (x, i) { return i !== kol; }));
        });
        if (baris.length) kap = { kepala: kp.filter(function (x, i) { return i !== kol; }), baris: baris };
      }
    });
    if (komp.length) W.tabel([['Komponen', 'Bobot', 'Kelas 1', 'Kelas 2', 'Kelas 3']], komp,
      { judul: 'Bobot dan skor komponen untuk ancaman ' + namaAncaman(idx) + ' (disarikan dari tabel klasifikasi buku)', uk: 7.6,
        kolom: { 0: { cellWidth: 64 }, 1: { halign: 'center', cellWidth: 15 }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } } });
    if (kap) W.tabel([kap.kepala], kap.baris.map(function (r) { return r.map(selBuku); }),
      { judul: 'Indeks risiko ' + namaAncaman(idx) + ' per kelas kapasitas daerah (R = H × V / C)', uk: 7.8,
        kolom: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } } });
  }

  function babMetodologi(W, ctx) {
    if (!(T.metodologi || []).length) return;
    W.mulaiBab('Metodologi');
    W.sumber('Teks bab ini dikutip dari Buku IRBI ' + tahun() + ' (BNPB); tabel parameter disesuaikan dengan jenis indeks pada laporan.');
    teksBuku(W, T.metodologi);
    if ((T.pengkelasan || []).length) {
      W.subjudul('Pengkelasan indeks risiko');
      teksBuku(W, T.pengkelasan);
    }
    var kl = T.klasifikasi || [];
    if (kl.length) {
      W.subjudul('Klasifikasi, pembobotan, dan skoring');
      teksBuku(W, kl.filter(function (b) { return !b.tabel && !(b.judul && b.tingkat === 2); }), { judulKecil: true });
      var tabel = kl.filter(function (b) { return b.tabel; }).map(function (b) { return b.tabel; });
      if (multi(ctx.idx)) {
        tabel.forEach(function (t) { W.tabel([t.kepala], t.baris.map(function (r) { return r.map(selBuku); }), { judul: t.judul || '', uk: 7.4 }); });
      } else {
        parameterAncaman(W, tabel, ctx.idx);
      }
    }
    W.subjudul('Parameter data dan ambang kelas');
    W.paragraf('Parameter penyusun IRB ' + tahun() + ' yang digunakan dalam laporan ini adalah sebagai berikut:');
    W.daftar((I.D.parameter || []).map(String), true);
    W.paragraf(kalimatAmbang(ctx.idx));
    // rentang skor per kelas pada data nasional (fakta data, bukan definisi)
    var nas = ctx.nas, body = KELAS.map(function (k) {
      var r = nas.urut.filter(function (x) { return x.kelas === k; });
      return [selKelas(k), String(r.length), r.length ? f2(r[r.length - 1].skor) : '–', r.length ? f2(r[0].skor) : '–'];
    });
    W.tabel([['Kelas', 'Jumlah ' + ctx.satuan + ' (nasional)', 'Skor terendah', 'Skor tertinggi']], body,
      { judul: 'Rentang skor ' + namaIRB(ctx.idx) + ' per kelas pada data nasional', uk: 8.2, kolom: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  }

  function babHasil(W, spec, opsi, ctx) {
    W.mulaiBab('Hasil');
    var st = ctx.st;
    // ---- peta
    W.subjudul('Peta ' + namaIRB(ctx.idx));
    var lebar = LB, tinggi = tinggiPeta(spec, lebar);
    W.muat(tinggi + 22);
    var svg = I.pdf.petaSVG(spec, Math.round(lebar * 8), Math.round(tinggi * 8));
    return W.gambarSVG(svg, lebar, tinggi).then(function () {
      W.legenda(ctx, spec);
      W.keterangan('Gambar ' + (++W.noGbr) + '. Peta ' + namaIRBPanjang(ctx.idx) + ' tahun ' + tahun() + ' ' + ctx.satuan + ' ' + ctx.lingkup +
        (ctx.samaNas ? '' : ' (sesuai filter; wilayah di luar filter berwarna abu-abu)') + '.');
      // ---- sebaran
      W.subjudul('Sebaran kelas risiko');
      var j = I.jenis(ctx.idx);
      var rentang = multi(ctx.idx) ? { RENDAH: '< ' + f2(j.batas_sedang), SEDANG: f2(j.batas_sedang) + '–' + f2(j.batas_tinggi), TINGGI: '> ' + f2(j.batas_tinggi) } : null;
      var body = KELAS.map(function (k) {
        var r = st.urut.filter(function (x) { return x.kelas === k; });
        return [selKelas(k)].concat(rentang ? [rentang[k]] : []).concat([String(st.kelas[k]), st.dinilai ? persen(st.kelas[k], st.dinilai) : '–',
          r.length ? f2(r.reduce(function (s, x) { return s + x.skor; }, 0) / r.length) : '–']);
      });
      if (st.tanpa) body.push([selKelas(null)].concat(rentang ? ['–'] : []).concat([String(st.tanpa), '–', '–']));
      W.tabel([['Kelas'].concat(rentang ? ['Rentang skor'] : []).concat(['Jumlah', 'Persentase', 'Rata-rata skor'])], body,
        { judul: 'Sebaran kelas ' + namaIRB(ctx.idx) + ' ' + ctx.satuan + ' ' + ctx.lingkup, uk: 8.4, kolom: { 0: { cellWidth: 32 } } });
      W.paragraf(kalimatSebaran(st, ctx.satuan, ctx.idx, ctx.kelasFilter));
      // ---- peringkat
      if (st.dinilai) {
        W.subjudul('Peringkat ' + ctx.satuan);
        var semua = st.dinilai <= 30, item = (semua ? st.urut : st.urut.slice(0, 15)).map(function (r) {
          return { label: namaRow(r, ctx), nilai: r.skor, kelas: r.kelas, tanda: r.diubah };
        });
        W.grafikBatang(item);
        W.keterangan('Gambar ' + (++W.noGbr) + '. ' + (semua ? 'Skor ' + namaIRB(ctx.idx) + ' seluruh ' + ctx.satuan + ' pada laporan, diurutkan dari tertinggi'
          : 'Lima belas ' + ctx.satuan + ' dengan skor ' + namaIRB(ctx.idx) + ' tertinggi') + '. Warna batang menunjukkan kelas risiko.');
        if (!semua) {
          var bawah = st.urut.slice(-10).map(function (r) { return { label: namaRow(r, ctx), nilai: r.skor, kelas: r.kelas, tanda: r.diubah }; });
          W.grafikBatang(bawah);
          W.keterangan('Gambar ' + (++W.noGbr) + '. Sepuluh ' + ctx.satuan + ' dengan skor ' + namaIRB(ctx.idx) + ' terendah.');
        }
        W.paragraf(kalimatEkstrem(ctx));
        W.paragraf(kalimatTeratas(ctx));
      }
      // ---- rekap per provinsi
      if (!ctx.prov && ctx.multiProv) {
        W.subjudul('Rekapitulasi per provinsi');
        var g = rekapProv(ctx.rows).sort(function (a, b) { return (b.st.rata || 0) - (a.st.rata || 0); });
        W.tabel([['Provinsi', 'Kab/kota', 'Tinggi', 'Sedang', 'Rendah', 'Tidak dinilai', 'Rata-rata skor', 'Skor tertinggi']],
          g.map(function (x) {
            return [namaProv(x.kode).replace(/^Provinsi /, ''), String(x.st.n), selJumlah(x.st.kelas.TINGGI, 'TINGGI'), selJumlah(x.st.kelas.SEDANG, 'SEDANG'),
              selJumlah(x.st.kelas.RENDAH, 'RENDAH'), String(x.st.tanpa), x.st.rata === null ? '–' : f2(x.st.rata), x.st.maks ? namaKab(x.st.maks.kode) + ' (' + f2(x.st.maks.skor) + ')' : '–'];
          }), { judul: 'Rekapitulasi ' + namaIRB(ctx.idx) + ' per provinsi (diurutkan menurut rata-rata skor)', uk: 7.4,
            kolom: { 1: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'right' } } });
        if (g.length > 1 && g[0].st.rata !== null) {
          var akhir = g.filter(function (x) { return x.st.rata !== null; });
          W.paragraf('Rata-rata skor tertinggi terdapat di ' + namaProv(g[0].kode) + ' (' + f2(g[0].st.rata) + '), sedangkan rata-rata terendah terdapat di ' +
            namaProv(akhir[akhir.length - 1].kode) + ' (' + f2(akhir[akhir.length - 1].st.rata) + ').');
        }
      }
    });
  }

  function tinggiPeta(spec, wmm) {
    var G = window.IRBI_GEO_DETAIL, bb = [94.9, -11.1, 141.1, 6.2];
    var lingkup = spec.tingkat === 'kabkota' ? spec.prov : '';
    if (lingkup && G) {
      var f = G.kabkota.features.filter(function (x) { return x.properties.kode.split('.')[0] === lingkup; }).map(function (x) { return x.properties.bbox; });
      if (f.length) bb = [Math.min.apply(null, f.map(function (b) { return b[0]; })), Math.min.apply(null, f.map(function (b) { return b[1]; })),
        Math.max.apply(null, f.map(function (b) { return b[2]; })), Math.max.apply(null, f.map(function (b) { return b[3]; }))];
    }
    var kx = Math.cos((bb[1] + bb[3]) / 2 * Math.PI / 180);
    var asp = ((bb[2] - bb[0]) * kx) / Math.max(0.05, bb[3] - bb[1]);
    var hpx = (wmm * 8 - 78) / asp + 64;
    return Math.max(62, Math.min(150, hpx / 8));
  }

  function profilAncaman(kodeProv) {
    return I.D.jenis.map(function (j) { return { j: j, st: stat(I.baris(j.slug, { prov: kodeProv })) }; });
  }

  function babProfil(W, spec, opsi, ctx, lambang) {
    W.mulaiBab('Profil Wilayah');
    W.paragraf('Bab ini menyajikan profil setiap provinsi pada laporan: gambaran wilayah dari buku IRBI ' + tahun() +
      ', hasil indeks risiko yang dihitung dari data, profil multi-ancaman, dan daftar ' + ctx.satuan + ' sesuai filter.' +
      (opsi.profilKab && !ctx.prov ? ' Profil setiap kabupaten/kota disajikan di bawah provinsinya.' : ''));
    var nasProv = stat(I.baris('provinsi'));
    var p = Promise.resolve();
    ctx.provs.forEach(function (kode) {
      p = p.then(jeda).then(function () { profilProvinsi(W, spec, opsi, ctx, kode, lambang[kode], nasProv); });
    });
    return p;
  }

  function profilProvinsi(W, spec, opsi, ctx, kode, lambang, nasProv) {
    var d = W.doc, C = W.C, idx = ctx.idx;
    var tp = (T.provinsi || {})[kode] || { profil: [], ancaman: '' };
    W.muat(70);
    var yJudul = W.y + 2;
    W.subjudul(namaProv(kode), { kanan: lambang ? 20 : 0, ruang: 70 });
    if (lambang) {
      var lw = 15, lh = lw * lambang.h / lambang.w;
      try { d.addImage(lambang.data, 'PNG', PW - MR - lw, yJudul - 1, lw, lh); } catch (e) { /* lambang opsional */ }
    }
    if (tp.profil.length) {
      W.subsub('Gambaran wilayah');
      tp.profil.forEach(function (t) { W.paragraf(t); });
      W.sumber('Sumber: Buku IRBI ' + tahun() + ', bab provinsi.');
    }
    W.subsub('Hasil indeks risiko');
    var pv = I.nilai('provinsi', kode);
    if (pv) W.paragraf('Berdasarkan IRBI ' + tahun() + ', ' + namaProv(kode) + ' memiliki nilai indeks risiko bencana multi-bahaya sebesar ' + f2(pv.skor) +
      (pv.diubah ? '*' : '') + ' dengan kelas risiko ' + kecil(pv.kelas) + ' dan menempati peringkat ke-' + pv.peringkat + ' dari ' + pv.total +
      ' provinsi (peringkat 1 menunjukkan risiko tertinggi; rata-rata provinsi nasional ' + f2(nasProv.rata) + ').');
    var idxKab = ctx.prov ? 'irbi' : idx;
    var semua = I.baris(idxKab, { prov: kode }), sa = stat(semua), nasK = ctx.prov ? stat(I.baris('irbi')) : ctx.nas;
    var bagian = KELAS.filter(function (k) { return sa.kelas[k]; }).map(function (k, i) { return sa.kelas[k] + (i ? ' ' : ' berkelas ') + kecil(k); });
    if (sa.dinilai) {
      W.paragraf('Untuk ' + namaIRB(idxKab) + ', terdapat ' + sa.dinilai + ' kabupaten/kota yang dinilai di provinsi ini: ' + seri(bagian) +
        '. Rata-rata skornya ' + f2(sa.rata) + ' (rata-rata nasional ' + f2(nasK.rata) + ').' +
        (sa.dinilai > 1 ? ' Skor tertinggi dimiliki oleh ' + namaKab(sa.maks.kode) + ' (' + f2(sa.maks.skor) + ') dan terendah oleh ' + namaKab(sa.min.kode) + ' (' + f2(sa.min.skor) + ').' : '') +
        (sa.tanpa ? ' Sebanyak ' + sa.tanpa + ' kabupaten/kota tidak dinilai untuk ancaman ini.' : ''));
    }
    var dimuat = ctx.prov ? semua : ctx.rows.filter(function (r) { return r.prov === kode; });
    if (!ctx.prov && dimuat.length < semua.length) W.paragraf('Sesuai filter, laporan ini memuat ' + dimuat.length + ' dari ' + semua.length + ' kabupaten/kota di provinsi ini.');
    // profil multi-ancaman
    var prof = profilAncaman(kode);
    var dom = prof.filter(function (x) { return x.j.slug !== 'irbi' && x.st.kelas.TINGGI; })
      .sort(function (a, b) { return b.st.kelas.TINGGI - a.st.kelas.TINGGI || b.st.rata - a.st.rata; }).slice(0, 3);
    W.paragraf(dom.length ? 'Berdasarkan profil multi-ancaman, ancaman dengan jumlah kabupaten/kota berkelas risiko tinggi terbanyak di provinsi ini adalah ' +
      seri(dom.map(function (x, i) { return x.j.nama.toLowerCase() + ' (' + x.st.kelas.TINGGI + (i ? '' : ' kabupaten/kota') + ')'; })) + '.'
      : 'Tidak ada kabupaten/kota di provinsi ini yang berkelas risiko tinggi untuk satu pun jenis ancaman.');
    if (tp.ancaman) W.paragraf('Jenis ancaman bencana di provinsi ini menurut buku: ' + tp.ancaman + '.');
    W.tabel([['Jenis indeks', 'Dinilai', 'Tinggi', 'Sedang', 'Rendah', 'Rata-rata', 'Skor tertinggi']],
      prof.map(function (x) {
        return [{ content: x.j.slug === 'irbi' ? 'Multi-bahaya (IRBI)' : x.j.nama, styles: x.j.slug === idx || (ctx.prov && x.j.slug === 'irbi') ? { fontStyle: 'bold', textColor: C.primer } : {} },
          String(x.st.dinilai), selJumlah(x.st.kelas.TINGGI, 'TINGGI'), selJumlah(x.st.kelas.SEDANG, 'SEDANG'), selJumlah(x.st.kelas.RENDAH, 'RENDAH'),
          x.st.rata === null ? '–' : f2(x.st.rata), x.st.maks ? namaKab(x.st.maks.kode) + ' (' + f2(x.st.maks.skor) + ')' : '–'];
      }), { judul: 'Profil multi-ancaman ' + namaProv(kode) + ' (jumlah kabupaten/kota per kelas)', uk: 7.4,
        kolom: { 0: { cellWidth: 40 }, 1: { halign: 'center', cellWidth: 14 }, 5: { halign: 'right', cellWidth: 16 } } });
    // daftar kab/kota sesuai filter
    var urutProv = semua.filter(function (r) { return r.dinilai; }).sort(function (a, b) { return b.skor - a.skor; });
    var rp = {}; urutProv.forEach(function (r, i) { rp[r.kode] = i + 1; });
    var tampil = dimuat.slice().sort(function (a, b) { return (b.dinilai ? b.skor : -1) - (a.dinilai ? a.skor : -1); });
    W.tabel([['No', 'Kabupaten/Kota', 'Skor', 'Kelas', 'Peringkat provinsi', 'Peringkat nasional']],
      tampil.map(function (r, i) {
        return [String(i + 1), namaKab(r.kode), r.dinilai ? selSkor(r) : selSkor(null), selKelas(r.dinilai ? r.kelas : null),
          r.dinilai ? rp[r.kode] + ' / ' + urutProv.length : '–', r.dinilai ? r.peringkat + ' / ' + r.total : '–'];
      }), { judul: namaIRB(idxKab) + ' kabupaten/kota di ' + namaProv(kode) + (ctx.prov || dimuat.length === semua.length ? '' : ' (sesuai filter)'), uk: 7.8,
        kolom: { 0: { halign: 'center', cellWidth: 10 }, 2: { cellWidth: 20 }, 3: { cellWidth: 22 }, 4: { halign: 'center', cellWidth: 26 }, 5: { halign: 'center', cellWidth: 28 } } });
    // profil kab/kota
    if (opsi.profilKab && !ctx.prov) {
      tampil.forEach(function (r) { profilKab(W, r, idx, rp, urutProv.length); });
    }
  }

  function profilKab(W, r, idx, rp, nProv) {
    var d = W.doc, C = W.C;
    W.muat(34);
    W.huruf('bold', 10, C.primer);
    d.text(aman(namaKab(r.kode)), ML, W.y + 3.8);
    W.y += 6.5;
    var s;
    if (!r.dinilai) s = namaKab(r.kode) + ' tidak dinilai untuk ancaman ' + namaAncaman(idx) + '.';
    else s = namaKab(r.kode) + ' memiliki skor ' + namaIRB(idx) + ' sebesar ' + f2(r.skor) + (r.diubah ? '*' : '') + ' dengan kelas risiko ' + kecil(r.kelas) +
      ', menempati peringkat ke-' + r.peringkat + ' dari ' + r.total + ' kabupaten/kota yang dinilai secara nasional dan peringkat ke-' + rp[r.kode] + ' dari ' + nProv + ' di provinsinya.';
    if (!multi(idx)) {
      var m = I.nilai('irbi', r.kode);
      if (m) s += ' Secara multi-bahaya, skor IRBI wilayah ini ' + f2(m.skor) + ' (kelas ' + kecil(m.kelas) + '; peringkat ' + m.peringkat + ' nasional).';
    }
    var c = { TINGGI: [], SEDANG: [], RENDAH: [] }, tanpa = 0, nAnc = 0;
    I.D.jenis.forEach(function (j) {
      if (j.slug === 'irbi') return;
      nAnc++;
      var v = I.nilai(j.slug, r.kode);
      if (v && c[v.kelas]) c[v.kelas].push(j.nama.toLowerCase()); else tanpa++;
    });
    var bag = [];
    if (c.TINGGI.length) bag.push(c.TINGGI.length + ' berada pada kelas tinggi (' + seri(c.TINGGI) + ')');
    if (c.SEDANG.length) bag.push(c.SEDANG.length + ' pada kelas sedang');
    if (c.RENDAH.length) bag.push(c.RENDAH.length + ' pada kelas rendah');
    if (bag.length) s += ' Dari ' + (nAnc - tanpa) + ' jenis ancaman yang dinilai, ' + seri(bag) + '.';
    if (tanpa) s += ' Sebanyak ' + tanpa + ' jenis ancaman lainnya tidak dinilai.';
    W.paragraf(s, { uk: 9.2 });
    // pita skor 12 indeks
    var n = I.D.jenis.length, g = 0.8, w = (LB - g * (n - 1)) / n;
    W.muat(13);
    var y = W.y;
    var aktif = multi(idx) ? 'irbi' : idx;
    I.D.jenis.forEach(function (j, i) {
      var x = ML + i * (w + g), v = I.nilai(j.slug, r.kode);
      d.setFont('helvetica', j.slug === aktif ? 'bold' : 'normal'); d.setFontSize(5.3); d.setTextColor.apply(d, j.slug === aktif ? C.primer : C.abu);
      var lbl = labelSempit(j).split('\n');
      lbl.forEach(function (t, k) { d.text(aman(t), x + w / 2, y + 2 + (k + 2 - lbl.length) * 2.1, { align: 'center' }); });
      var warna = v ? I.warnaKelas(v.kelas) : '#E2E5E7';
      d.setFillColor.apply(d, rgb(warna)); d.rect(x, y + 5.2, w, 5.6, 'F');
      if (j.slug === aktif) { d.setDrawColor.apply(d, C.primer); d.setLineWidth(0.5); d.rect(x, y + 5.2, w, 5.6, 'S'); }
      d.setFont('helvetica', 'bold'); d.setFontSize(6.4); d.setTextColor.apply(d, v ? teksAtas(warna) : [140, 140, 140]);
      d.text(v ? f2(v.skor) : '–', x + w / 2, y + 9, { align: 'center' });
    });
    W.y = y + 15;
  }

  function babPenutup(W, ctx) {
    W.mulaiBab('Penutup');
    var st = ctx.st, idx = ctx.idx;
    W.subjudul('Kesimpulan');
    var teratas = st.urut.slice(0, 3).map(function (r) { return namaRow(r, ctx); });
    var s = 'Laporan ini memuat ' + st.n + ' ' + ctx.satuan + ' ' + ctx.lingkup + '. ';
    if (st.kelas.TINGGI) s += 'Sebanyak ' + st.kelas.TINGGI + ' di antaranya (' + persen(st.kelas.TINGGI, st.dinilai) + ') berada pada kelas risiko tinggi untuk ' + namaIRB(idx) +
      ', dengan skor tertinggi pada ' + seri(teratas) + '.';
    else s += 'Tidak ada wilayah yang berada pada kelas risiko tinggi untuk ' + namaIRB(idx) + '; skor tertinggi terdapat pada ' + seri(teratas) + '.';
    W.paragraf(s);
    W.paragraf('Sejalan dengan arahan dalam buku IRBI ' + tahun() + ', strategi penurunan risiko perlu dilakukan secara diferensiatif sesuai karakteristik wilayah, ' +
      'dengan penajaman prioritas pada wilayah berkelas risiko tinggi, terutama yang memiliki kapasitas rendah dan tingkat keterpaparan tinggi. ' +
      'Komponen bahaya, kerentanan, dan kapasitas yang menyusun nilai risiko dijelaskan pada bab Metodologi.');
    var arah = (T.ringkasan || []).filter(function (b) { return b.p; }).slice(-2);
    if (arah.length) {
      W.subjudul('Arah pengurangan risiko menurut buku IRBI ' + tahun());
      W.sumber('Dikutip dari Buku IRBI ' + tahun() + ', Ringkasan Eksekutif.');
      arah.forEach(function (b) { W.paragraf(b.p); });
    }
  }

  function lampiranTabel(W, spec, ctx) {
    W.mulaiBab('Tabel Data Lengkap', 'LAMPIRAN A');
    var d = W.doc;
    if (ctx.prov) {
      W.tabel([['No', 'Kode', 'Provinsi', 'IRB ' + tahun(), 'Kelas', 'Peringkat', 'Kab/kota', 'Tinggi', 'Sedang', 'Rendah']],
        ctx.rows.map(function (r, i) {
          var anak = stat(I.baris('irbi', { prov: r.kode }));
          return [String(i + 1), r.kode, namaProv(r.kode).replace(/^Provinsi /, ''), selSkor(r), selKelas(r.kelas), r.peringkat + ' / ' + r.total,
            String(anak.n), selJumlah(anak.kelas.TINGGI, 'TINGGI'), selJumlah(anak.kelas.SEDANG, 'SEDANG'), selJumlah(anak.kelas.RENDAH, 'RENDAH')];
        }), { judul: 'Data IRB multi-bahaya ' + ctx.satuan + ' sesuai filter', uk: 7.6, kolom: { 0: { halign: 'center', cellWidth: 9 }, 1: { cellWidth: 11 }, 5: { halign: 'center' }, 6: { halign: 'center' } } });
      return;
    }
    var jenis = I.D.jenis, kol = { 0: { halign: 'center', cellWidth: 6.5 }, 1: { cellWidth: 25 }, 2: { cellWidth: 21 } };
    jenis.forEach(function (j, i) { kol[3 + i] = { cellWidth: (LB - 52.5) / jenis.length, halign: 'right' }; });
    W.tabel([['No', 'Kabupaten/Kota', 'Provinsi'].concat(jenis.map(labelSempit))],
      ctx.rows.map(function (r, i) {
        return [String(i + 1), namaKab(r.kode).replace(/^Kabupaten /, 'Kab. '), namaProv(r.prov).replace(/^Provinsi /, '')]
          .concat(jenis.map(function (j) { return selSkor(I.nilai(j.slug, r.kode), 5.6); }));
      }), { judul: 'Skor multi-bahaya dan 11 ancaman ' + ctx.satuan + ' sesuai filter (warna sel = kelas risiko; – = tidak dinilai; * = diubah melalui Studio)',
        uk: 5.6, ukKepala: 5.4, pad: 0.7, kolom: kol });
    d.setFont('helvetica', 'normal');
  }

  function lampiranCatatan(W, spec, ctx) {
    W.mulaiBab('Catatan dan Sumber Data', 'LAMPIRAN B');
    W.subjudul('Sumber data', { tanpaNomor: true });
    W.daftar([
      'Nilai indeks, kelas, dan teks penjelasan: Buku Indeks Risiko Bencana Indonesia (IRBI) ' + tahun() + ', Badan Nasional Penanggulangan Bencana (BNPB).',
      'Batas wilayah: Kepmendagri No. 300.2.2-2430 Tahun 2025, dari data cahyadsn/wilayah_boundaries (lisensi MIT).'
    ].concat((I.D.parameter || []).map(function (p) { return 'Parameter penyusun IRB: ' + p + '.'; })), false);
    W.subjudul('Catatan pengolahan', { tanpaNomor: true });
    var cat = [
      'Narasi hasil, statistik, dan peringkat pada laporan ini dihitung otomatis dari data sesuai filter. Rata-rata dihitung dari skor dua desimal sehingga dapat berbeda sekitar 0,01 dari angka resmi buku karena pembulatan.',
      'Pada beberapa bab provinsi di buku, kalimat nilai IRBI provinsi tidak sesuai dengan tabel data. Karena itu, laporan ini memakai teks gambaran wilayah dari buku tanpa kalimat nilai tersebut, lalu menyajikan nilai yang dihitung dari tabel.',
      'Kelas risiko per ancaman mengikuti tabel per ancaman pada buku. Untuk nilai yang diubah melalui Studio, kelas dihitung ulang dari ambang yang berlaku.'
    ];
    if (ctx.nUbah) cat.push('Sebanyak ' + ctx.nUbah + ' nilai telah diubah melalui Studio edisi digital (ditandai *); nilai lain sesuai buku.');
    W.daftar(cat, false);
    W.subjudul('Filter dan pembuatan laporan', { tanpaNomor: true });
    W.daftar(spec.filterTeks.concat(['Dibuat: ' + U.tanggal() + ' melalui edisi digital IRBI ' + tahun() + ' (PDF dibuat di peramban; tidak ada data yang dikirim ke server).'])
      .concat(spec.tautan ? ['Tautan tampilan: ' + spec.tautan] : []), false);
  }

  // ================================================================== sampul, daftar isi, kepala & kaki
  function sampul(doc, C, spec, opsi, ctx, foto) {
    var th = String(tahun());
    doc.setFillColor.apply(doc, C.primer); doc.rect(102, 0, 108, 96, 'F');
    var logo = window.IRBI_ASET && window.IRBI_ASET.logo;
    if (logo) { try { doc.addImage(logo, 'PNG', 20, 20, 24, 25.2); } catch (e) { /* opsional */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); doc.setTextColor.apply(doc, C.primer);
    doc.text(['BADAN NASIONAL', 'PENANGGULANGAN BENCANA'], 20, 52);
    doc.setFontSize(62); doc.setTextColor(255, 255, 255); doc.text('IRBI', 112, 48);
    doc.setFontSize(9.5); doc.text('INDEKS RISIKO BENCANA INDONESIA', 113, 58, { charSpace: 0.3 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.4); doc.setTextColor(214, 228, 233);
    doc.text(['Laporan sesuai filter', 'Edisi digital interaktif IRBI ' + th], 113, 66);
    var fy = 96, fh = 108;
    if (foto) {
      var wImg = PW, hImg = PW * foto.h / foto.w;
      if (hImg < fh) { hImg = fh; wImg = fh * foto.w / foto.h; }
      try {
        doc.saveGraphicsState();
        doc.rect(0, fy, PW, fh, null); doc.clip(); doc.discardPath();
        doc.addImage(foto.data, 'JPEG', (PW - wImg) / 2, fy + (fh - hImg) / 2, wImg, hImg);
        doc.restoreGraphicsState();
      } catch (e) { doc.setFillColor(214, 228, 233); doc.rect(0, fy, PW, fh, 'F'); }
    } else { doc.setFillColor(214, 228, 233); doc.rect(0, fy, PW, fh, 'F'); }
    doc.setFillColor.apply(doc, C.primer); doc.rect(0, fy, 17, fh, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(255, 255, 255);
    doc.text(th, 12, fy + fh - 8, { angle: 90 });
    doc.setFillColor.apply(doc, C.aksen); doc.rect(0, fy + fh, PW, 1.4, 'F');
    var y = fy + fh + 15;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor.apply(doc, C.aksen);
    doc.text('LAPORAN', 20, y, { charSpace: 1 });
    doc.setFontSize(19); doc.setTextColor.apply(doc, C.primer);
    var l = doc.splitTextToSize(aman(opsi.judul), 170);
    doc.text(l, 20, y + 9);
    y += 9 + l.length * 7.6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, C.abu);
    doc.text(doc.splitTextToSize(aman(namaIRBPanjang(ctx.idx) + ' tahun ' + th + ' · ' + ctx.st.n + ' ' + ctx.satuan + ' ' + ctx.lingkup), 170), 20, y + 1);
    y += 9;
    var px = 20;
    spec.filterTeks.forEach(function (t) {
      doc.setFontSize(7.8);
      var w = doc.getTextWidth(aman(t)) + 6;
      if (px + w > PW - 20) { px = 20; y += 7; }
      doc.setFillColor(238, 243, 245); doc.roundedRect(px, y - 4, w, 6, 3, 3, 'F');
      doc.setTextColor.apply(doc, C.primer); doc.text(aman(t), px + 3, y);
      px += w + 2.5;
    });
    doc.setFillColor.apply(doc, C.primer); doc.rect(0, PH - 16, PW, 16, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(214, 228, 233);
    doc.text(aman('Disusun otomatis dari Buku IRBI ' + th + ' (BNPB) · dibuat ' + U.tanggal()), 20, PH - 7);
    if (ctx.nUbah) doc.text(aman('Memuat ' + ctx.nUbah + ' nilai yang diubah melalui Studio (*)'), PW - 20, PH - 7, { align: 'right' });
  }

  function daftarIsi(W) {
    var d = W.doc, C = W.C;
    d.setPage(2);
    var y = MT + 4;
    d.setFont('helvetica', 'bold'); d.setFontSize(22); d.setTextColor.apply(d, C.primer); d.text('Daftar Isi', ML, y + 6);
    d.setDrawColor.apply(d, C.aksen); d.setLineWidth(1.1); d.line(ML, y + 11, ML + 26, y + 11);
    y += 22;
    var muat = Math.floor((PH - MB - y) / 6.4);
    var e = W.isi;
    if (e.length > muat) e = e.filter(function (x) { return x.tingkat === 1 || x.bab !== 'Profil Wilayah'; });
    if (e.length > muat) e = e.filter(function (x) { return x.tingkat === 1; });
    e.forEach(function (x) {
      var satu = x.tingkat === 1, kiri = satu ? ML : ML + 9;
      if (satu) y += 2.2;
      d.setFont('helvetica', satu ? 'bold' : 'normal'); d.setFontSize(satu ? 10.5 : 9.4);
      d.setTextColor.apply(d, satu ? C.primer : C.teks);
      var teks = aman((x.label ? x.label + '   ' : '') + x.judul);
      teks = d.splitTextToSize(teks, LB - 30)[0];
      d.text(teks, kiri, y);
      var akhir = kiri + d.getTextWidth(teks) + 2;
      d.text(String(x.hal), PW - MR, y, { align: 'right' });
      d.setDrawColor(170, 180, 186); d.setLineWidth(0.25); d.setLineDashPattern([0.4, 1.4], 0);
      d.line(akhir, y, PW - MR - d.getTextWidth(String(x.hal)) - 2, y);
      d.setLineDashPattern([], 0);
      d.link(kiri, y - 4, PW - MR - kiri, 5.6, { pageNumber: x.hal });
      y += 6.4;
    });
    if (e.length < W.isi.length) {
      d.setFont('helvetica', 'italic'); d.setFontSize(8); d.setTextColor.apply(d, C.abu);
      d.text('Subbab lengkap tersedia pada panel bookmark/outline PDF.', ML, y + 2);
    }
  }

  function hias(W, judul) {
    var d = W.doc, C = W.C, n = d.getNumberOfPages(), bab = '';
    for (var i = 2; i <= n; i++) {
      d.setPage(i);
      if (W.babHal[i] !== undefined) bab = W.babHal[i];
      if (i > 2 && !W.halBabAwal[i]) {
        d.setFont('helvetica', 'normal'); d.setFontSize(7.2); d.setTextColor.apply(d, C.abu);
        d.text(aman(d.splitTextToSize(judul, 110)[0]), ML, 13);
        d.setFont('helvetica', 'bold'); d.setTextColor.apply(d, C.primer);
        d.text(aman(bab), PW - MR, 13, { align: 'right' });
        d.setDrawColor.apply(d, C.aksen); d.setLineWidth(0.35); d.line(ML, 15.5, PW - MR, 15.5);
      }
      d.setDrawColor.apply(d, C.garis); d.setLineWidth(0.2); d.line(ML, PH - 12.5, PW - MR, PH - 12.5);
      d.setFont('helvetica', 'normal'); d.setFontSize(6.8); d.setTextColor.apply(d, C.abu);
      d.text(aman('Laporan IRBI ' + tahun() + ' · edisi digital · sumber: Buku IRBI ' + tahun() + ' (BNPB)'), ML, PH - 8);
      d.setFont('helvetica', 'bold'); d.setFontSize(8); d.setTextColor.apply(d, C.primer);
      d.text(String(i), PW - MR, PH - 8, { align: 'right' });
    }
  }

  // ================================================================== utama
  function buat(spec, opsi, lapor) {
    lapor = lapor || function () {};
    opsi = Object.assign({ pengantar: true, profilProv: true, profilKab: false, lampiran: true }, opsi || {});
    lapor('Memuat pustaka PDF dan teks buku…', 0.04);
    var ctx;
    return Promise.all([I.muatPdf(), I.muatGeoDetail(), I.skrip('assets/data/irbi-teks.js')]).then(function () {
      T = window.IRBI_TEKS || {};
      ctx = konteks(spec);
      if (ctx.prov || ctx.st.n > BATAS_PROFIL_KAB) opsi.profilKab = false;
      lapor('Memuat foto sampul dan lambang provinsi…', 0.1);
      var lambang = opsi.profilProv ? ctx.provs : [];
      return Promise.all([muatGambar(I.akar + 'assets/img/sampul.jpg', 1400, 'JPEG')].concat(lambang.map(function (k) {
        return muatGambar(I.akar + 'assets/img/lambang/' + k + '.png', 240, 'PNG');
      })));
    }).then(function (g) {
      var lambang = {};
      if (opsi.profilProv) ctx.provs.forEach(function (k, i) { lambang[k] = g[i + 1]; });
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      if (typeof doc.autoTable !== 'function' && window.jspdf_autotable) window.jspdf_autotable.applyPlugin(jsPDF);
      var C = U.warna();
      var judul = aman(opsi.judul);
      doc.setProperties({ title: judul, subject: aman(spec.filterTeks.join(' · ')), author: 'Badan Nasional Penanggulangan Bencana (edisi digital IRBI ' + tahun() + ')',
        keywords: 'IRBI ' + tahun() + ', laporan, indeks risiko bencana, ' + aman(namaIRB(ctx.idx)), creator: 'Edisi digital IRBI ' + tahun() + ' (jsPDF, dibuat di peramban)' });
      var W = new Penulis(doc, C);
      sampul(doc, C, spec, opsi, ctx, g[0]);
      doc.addPage('a4', 'portrait');                // halaman 2: daftar isi, diisi di akhir
      W.babHal[2] = 'Daftar Isi';
      var langkah = [
        ['Menulis ringkasan…', function () { babRingkasan(W, spec, opsi, ctx); }],
        ['Menulis pendahuluan…', function () { if (opsi.pengantar) babPendahuluan(W); }],
        ['Menulis metodologi…', function () { if (opsi.pengantar) babMetodologi(W, ctx); }],
        ['Menggambar peta dan grafik hasil…', function () { return babHasil(W, spec, opsi, ctx); }],
        ['Menulis profil wilayah…', function () { if (opsi.profilProv) return babProfil(W, spec, opsi, ctx, lambang); }],
        ['Menulis penutup…', function () { babPenutup(W, ctx); }],
        ['Menyusun lampiran…', function () { if (opsi.lampiran) lampiranTabel(W, spec, ctx); lampiranCatatan(W, spec, ctx); }]
      ];
      var p = Promise.resolve();
      langkah.forEach(function (l, i) {
        p = p.then(function () { lapor(l[0], 0.14 + 0.78 * i / langkah.length); return jeda(); }).then(l[1]);
      });
      return p.then(function () {
        lapor('Menyusun daftar isi dan nomor halaman…', 0.95);
        daftarIsi(W);
        hias(W, opsi.judul);
        var nama = opsi.namaBerkas || ('laporan-' + spec.namaBerkas);
        if (opsi.kembalikan) return { nama: nama, halaman: doc.getNumberOfPages(), data: doc.output('datauristring') };
        doc.save(nama);
        lapor('Selesai', 1);
        return nama;
      });
    });
  }

  I.laporan = { buat: buat, BATAS_PROFIL_KAB: BATAS_PROFIL_KAB };
})();
