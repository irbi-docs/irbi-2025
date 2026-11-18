/* IRBI 2025 — komponen peta Leaflet (dipakai Jelajah Data, halaman bab, dan Studio Data). */
(function () {
  'use strict';
  var I = window.IRBI;
  if (I.Peta) return;
  var BATAS_INDONESIA = [[-11.2, 94.8], [6.3, 141.2]];
  var nomor = 0;

  function petaDasar(nama, gelap) {
    var esri = function (layanan, maks) {
      return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/' + layanan + '/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: maks || 16, attribution: 'Peta dasar &copy; Esri' });
    };
    switch (nama) {
      case 'osm': return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
      case 'citra': return esri('World_Imagery', 18);
      case 'kosong': return L.layerGroup();
      case 'abu': return esri('Canvas/World_Light_Gray_Base');
      case 'gelap': return esri('Canvas/World_Dark_Gray_Base');
      default: return esri(gelap ? 'Canvas/World_Dark_Gray_Base' : 'Canvas/World_Light_Gray_Base');
    }
  }

  /**
   * o: { tingkat: 'kabkota'|'provinsi', prov, nilai(kode) -> {skor,kelas,...}|null, cocok(kode) -> bool,
   *      judulLegenda(), onPilih(kode), onSorot(kode|null), popup(kode) -> html|null, tinggi }
   */
  function Peta(wadah, o) {
    this.o = o || {};
    this.id = 'irbi-peta-' + (++nomor);
    this.tingkat = this.o.tingkat || 'kabkota';
    this.prov = this.o.prov || null;
    this.terpilih = null;
    this.lapisan = {};
    this.wadah = wadah;
    this.bangun();
  }
  Peta.prototype.bangun = function () {
    var self = this, G = window.IRBI_GEO;
    var kanvas = I.el('div', { class: 'irbi-peta-kanvas', role: 'region', 'aria-label': 'Peta interaktif' });
    if (this.o.tinggi) kanvas.style.height = this.o.tinggi;
    this.wadah.appendChild(kanvas);
    this.kanvas = kanvas;
    var map = this.map = L.map(kanvas, { zoomSnap: 0.25, zoomDelta: 0.5, scrollWheelZoom: false, minZoom: 3, maxZoom: 15 });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    map.attributionControl.addAttribution('Data IRBI 2025 &copy; BNPB · Batas: Kepmendagri 2025');
    this.aturDasar();
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    map.on('click', function () { map.scrollWheelZoom.enable(); });
    map.on('mouseout', function () { map.scrollWheelZoom.disable(); });

    if (this.prov) {
      this.konteks = L.geoJSON(G.provinsi, {
        filter: function (f) { return f.properties.kode !== self.prov; },
        style: function () { return self.gayaKonteks(); }, interactive: false
      }).addTo(map);
    }
    var fitur = this.tingkat === 'provinsi' ? G.provinsi : {
      type: 'FeatureCollection',
      features: G.kabkota.features.filter(function (f) { return !self.prov || f.properties.kode.split('.')[0] === self.prov; })
    };
    this.layer = L.geoJSON(fitur, {
      style: function (f) { return self.gaya(f.properties.kode); },
      onEachFeature: function (f, l) {
        var kode = f.properties.kode;
        self.lapisan[kode] = l;
        l.bindTooltip(function () { return self.tooltip(kode); }, { sticky: true, className: 'irbi-tooltip', direction: 'top', offset: [0, -10], opacity: 1 });
        if (self.o.popup) l.bindPopup(function () { return self.o.popup(kode) || ''; }, { maxWidth: 380, autoPanPadding: [24, 24], className: 'irbi-popup-wadah' });
        l.on('mouseover', function () { self.sorot(kode, true); if (self.o.onSorot) self.o.onSorot(kode); });
        l.on('mouseout', function () { self.sorot(kode, false); if (self.o.onSorot) self.o.onSorot(null); });
        l.on('click', function () { if (self.o.onPilih) self.o.onPilih(kode, 'peta'); });
      }
    }).addTo(map);
    if (this.tingkat === 'kabkota' && !this.prov) {
      this.batas = L.geoJSON(G.provinsi, { style: function () { return self.gayaBatas(); }, interactive: false }).addTo(map);
    }
    this.label = L.layerGroup();
    this.batasAwal = this.prov ? this.layer.getBounds() : L.latLngBounds(BATAS_INDONESIA);
    map.fitBounds(this.batasAwal, { padding: [12, 12] });

    var leg = L.control({ position: 'bottomright' });
    leg.onAdd = function () {
      self.elLegenda = L.DomUtil.create('div', 'irbi-legenda');
      L.DomEvent.disableClickPropagation(self.elLegenda);
      L.DomEvent.disableScrollPropagation(self.elLegenda);
      return self.elLegenda;
    };
    leg.addTo(map);

    this._tema = function () { self.aturDasar(); self.perbarui(); };
    this._kustom = function (e) { if (!e.detail || e.detail.bagian !== 'teks') { self.aturDasar(); self.perbarui(); } };
    document.addEventListener('irbi:tema', this._tema);
    document.addEventListener('irbi:kustom', this._kustom);
    if ('ResizeObserver' in window) {
      this._ro = new ResizeObserver(function () { if (!self._hancur) map.invalidateSize(); });
      this._ro.observe(kanvas);
    }
    this.perbarui();
  };
  Peta.prototype.aturDasar = function () {
    var nama = I.tampilan.nilai('peta.dasar', 'otomatis');
    var kunci = nama + (I.gelap() ? ':g' : ':t');
    if (this._kunciDasar === kunci) return;
    if (this.dasar) this.map.removeLayer(this.dasar);
    this.dasar = petaDasar(nama, I.gelap()).addTo(this.map);
    if (this.dasar.bringToBack) this.dasar.bringToBack();
    this._kunciDasar = kunci;
  };
  Peta.prototype.gayaKonteks = function () {
    return { fillColor: I.gelap() ? '#2A3B42' : '#9AA5AA', fillOpacity: I.gelap() ? 0.35 : 0.14, color: I.gelap() ? '#3B5560' : '#8A969B', weight: 0.8 };
  };
  Peta.prototype.gayaBatas = function () {
    var tampil = I.tampilan.nilai('peta.batas', true) !== false;
    return { fill: false, color: I.gelap() ? '#C9D7DC' : '#33454E', weight: tampil ? 1.1 : 0, opacity: tampil ? 0.85 : 0 };
  };
  Peta.prototype.gaya = function (kode) {
    var v = this.o.nilai(kode);
    var cocok = this.o.cocok ? this.o.cocok(kode) : true;
    var nasional = this.tingkat === 'kabkota' && !this.prov;
    var garis = I.gelap() ? '#0C171C' : '#FFFFFF';
    var op = +I.tampilan.nilai('peta.opasitas', 0.82);
    var g = { color: garis, weight: nasional ? 0.5 : 1.1, opacity: 1, dashArray: null };
    if (!v || !v.kelas) return Object.assign(g, { fillColor: I.warna('tanpa', '#D5D5D5'), fillOpacity: cocok ? 0.6 : 0.18, dashArray: '2 3' });
    if (!cocok) return Object.assign(g, { fillColor: I.gelap() ? '#3A4A50' : '#AEB8BC', fillOpacity: 0.28 });
    return Object.assign(g, { fillColor: I.warnaKelas(v.kelas), fillOpacity: op });
  };
  Peta.prototype.tooltip = function (kode) {
    var v = this.o.nilai(kode);
    var nama, sub = '';
    if (this.tingkat === 'provinsi') nama = I.D.idx.prov[kode] ? I.D.idx.prov[kode].nama : kode;
    else {
      var k = I.D.idx.kab[kode];
      nama = k ? I.judul(k.nama) : kode;
      if (k && !this.prov) sub = I.D.idx.prov[k.prov].nama;
    }
    var h = '<div class="irbi-tt-nama">' + I.esc(nama) + '</div>' + (sub ? '<div class="irbi-tt-sub">' + I.esc(sub) + '</div>' : '');
    h += v ? '<div class="irbi-tt-nilai"><b>' + I.fmt(v.skor) + '</b> ' + lencana(v.kelas) + (v.diubah ? ' <span class="irbi-tt-ubah" title="Diubah melalui Studio">diubah</span>' : '') + '</div>'
      : '<div class="irbi-tt-nilai">' + lencana(null) + '</div>';
    if (this.o.cocok && !this.o.cocok(kode)) h += '<div class="irbi-tt-sub">di luar filter</div>';
    return h;
  };
  function lencana(kelas) {
    if (!kelas) return '<span class="kelas kelas-tanpa">Tidak dinilai</span>';
    return '<span class="kelas kelas-' + kelas.toLowerCase() + '">' + I.LABEL[kelas] + '</span>';
  }
  I.lencana = lencana;
  Peta.prototype.sorot = function (kode, nyala) {
    var l = this.lapisan[kode];
    if (!l) return;
    if (nyala) { l.setStyle({ weight: 3, color: I.gelap() ? '#FFFFFF' : '#0B3C49' }); if (l.bringToFront) l.bringToFront(); }
    else {
      this.layer.resetStyle(l);
      if (this.terpilih === kode) this.tandaiPilihan();
    }
  };
  Peta.prototype.tandaiPilihan = function () {
    var l = this.terpilih && this.lapisan[this.terpilih];
    if (l) { l.setStyle({ weight: 3.4, color: I.warna('aksen', '#A68B5B') }); if (l.bringToFront) l.bringToFront(); }
  };
  Peta.prototype.pilih = function (kode, opsi) {
    var lama = this.terpilih;
    this.terpilih = kode;
    if (lama && this.lapisan[lama]) this.layer.resetStyle(this.lapisan[lama]);
    var l = kode && this.lapisan[kode];
    if (!l) return;
    this.tandaiPilihan();
    if (!opsi || opsi.zoom !== false) {
      this.map.fitBounds(l.getBounds(), { maxZoom: this.tingkat === 'provinsi' ? 7 : 9, padding: [40, 40] });
    }
    if (opsi && opsi.popup && this.o.popup) l.openPopup(l.getBounds().getCenter());
  };
  Peta.prototype.fokusKe = function (kodes) {
    var self = this, b = null;
    (kodes || []).forEach(function (k) { var l = self.lapisan[k]; if (l) b = b ? b.extend(l.getBounds()) : L.latLngBounds(l.getBounds().getSouthWest(), l.getBounds().getNorthEast()); });
    if (b && b.isValid()) this.map.fitBounds(b, { padding: [24, 24], maxZoom: 9 });
    else this.map.fitBounds(this.batasAwal, { padding: [12, 12] });
  };
  Peta.prototype.reset = function () { this.map.closePopup(); this.map.fitBounds(this.batasAwal, { padding: [12, 12] }); };
  Peta.prototype.perbarui = function () {
    var self = this;
    this.layer.setStyle(function (f) { return self.gaya(f.properties.kode); });
    if (this.konteks) this.konteks.setStyle(function () { return self.gayaKonteks(); });
    if (this.batas) this.batas.setStyle(function () { return self.gayaBatas(); });
    this.tandaiPilihan();
    this.aturLabel();
    this.perbaruiLegenda();
  };
  Peta.prototype.aturLabel = function () {
    var self = this;
    var mau = I.tampilan.nilai('peta.label', true) !== false && (this.prov || this.tingkat === 'provinsi');
    this.label.clearLayers();
    if (!mau) { this.map.removeLayer(this.label); return; }
    var props = {};
    (this.tingkat === 'provinsi' ? window.IRBI_GEO.provinsi : window.IRBI_GEO.kabkota).features.forEach(function (f) { props[f.properties.kode] = f.properties; });
    Object.keys(this.lapisan).forEach(function (kode) {
      if (self.o.cocok && !self.o.cocok(kode)) return;
      var p = props[kode];
      if (!p) return;
      var nama = self.tingkat === 'provinsi' ? I.D.idx.prov[kode].nama : I.judul(I.D.idx.kab[kode].nama).replace(/^Kota /, 'Kota ');
      L.marker([p.lat, p.lng], { interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'irbi-label-peta', html: '<span>' + I.esc(nama) + '</span>', iconSize: null }) }).addTo(self.label);
    });
    if (!this.map.hasLayer(this.label)) this.label.addTo(this.map);
    var cek = function () {
      var z = self.map.getZoom();
      var batas = self.tingkat === 'provinsi' ? 4.6 : (self.prov ? 6.6 : 99);
      self.kanvas.classList.toggle('label-tersembunyi', z < batas);
    };
    if (!this._labelZoom) { this._labelZoom = cek; this.map.on('zoomend', cek); }
    cek();
  };
  Peta.prototype.perbaruiLegenda = function () {
    if (!this.elLegenda) return;
    var self = this;
    var j = this.o.jenis ? this.o.jenis() : I.jenis(this.o.indeks || 'irbi');
    var c = { TINGGI: 0, SEDANG: 0, RENDAH: 0 }, tanpa = 0, luar = 0;
    Object.keys(this.lapisan).forEach(function (k) {
      var v = self.o.nilai(k);
      var cocok = self.o.cocok ? self.o.cocok(k) : true;
      if (!cocok) { luar++; return; }
      if (v && v.kelas) c[v.kelas]++; else tanpa++;
    });
    var rentang = j.rentang ? { RENDAH: '&lt; ' + I.fmt(j.batas_sedang), SEDANG: I.fmt(j.batas_sedang) + '–' + I.fmt(j.batas_tinggi), TINGGI: '&gt; ' + I.fmt(j.batas_tinggi) } : null;
    var h = '<div class="judul">KETERANGAN</div><div class="sub">' + I.esc(this.o.judulLegenda ? this.o.judulLegenda() : j.nama) + '</div>';
    ['TINGGI', 'SEDANG', 'RENDAH'].forEach(function (k) {
      h += '<div class="baris"><span class="kotak" style="background:' + I.warnaKelas(k) + '"></span>' + I.LABEL[k] +
        (rentang ? ' <span class="rentang">' + rentang[k] + '</span>' : '') + '<span class="jml">' + c[k] + '</span></div>';
    });
    if (tanpa) h += '<div class="baris"><span class="kotak kotak-tanpa"></span>Tidak dinilai<span class="jml">' + tanpa + '</span></div>';
    if (luar) h += '<div class="baris"><span class="kotak kotak-luar"></span>Di luar filter<span class="jml">' + luar + '</span></div>';
    this.elLegenda.innerHTML = h;
  };
  Peta.prototype.hancurkan = function () {
    this._hancur = true;
    if (this._ro) this._ro.disconnect();
    document.removeEventListener('irbi:tema', this._tema);
    document.removeEventListener('irbi:kustom', this._kustom);
    if (this.map) this.map.remove();
    if (this.kanvas) this.kanvas.remove();
  };
  I.Peta = Peta;
})();
