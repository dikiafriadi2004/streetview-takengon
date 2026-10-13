# PRD – Street View Takengon (Aceh Tengah)

Versi 0.1 (draft) · 13 Oktober 2026 · Database: MySQL 8

## 1. Ringkasan

Google Maps belum punya Street View di Kabupaten Aceh Tengah (Takengon). Produk ini adalah aplikasi web yang memungkinkan pengguna menelusuri jalan di Takengon lewat foto 360° yang direkam sendiri, dengan pengalaman mirip Street View: peta, garis cakupan, panah maju-mundur, dan penampil panorama.

Prototipe interaktif sudah ada (tampilan dan navigasi dengan data contoh). Dokumen ini mendefinisikan versi berikutnya yang memakai foto asli dan MySQL sebagai penyimpan metadata.

## 2. Tujuan dan non-tujuan

**Tujuan**
- Menyediakan Street View untuk jalan utama Takengon, Danau Laut Tawar, dan sekitarnya.
- Menyimpan lokasi, arah, dan hubungan antar-foto di MySQL agar bisa dicari cepat.
- Memudahkan penambahan foto baru oleh admin dan, di fase berikutnya, kontributor.

**Non-tujuan (MVP)**
- Menyaingi cakupan Google Maps.
- Navigasi rute atau petunjuk arah.
- Aplikasi mobile native.

## 3. Pengguna dan kasus penggunaan

- **Pengunjung/warga:** membuka peta, klik jalan berwarna biru, menelusuri jalan, memutar pandangan.
- **Admin/pengelola:** mengunggah rekaman, memeriksa hasil, menerbitkan atau menyembunyikan foto.
- **Kontributor (fase 2):** mengunggah rekaman sendiri untuk ditinjau admin.

## 4. Persyaratan fungsional

**FR-1 Peta dan cakupan**
- Menampilkan peta dasar OpenStreetMap dengan lapisan garis biru untuk ruas yang sudah punya foto.
- Klik di dekat garis biru membuka foto terdekat (maksimal jarak 30 m).

**FR-2 Penampil panorama**
- Memutar pandangan dengan seret/sentuh, zoom dengan scroll/cubit.
- Mendukung foto equirectangular 2:1. Foto panorama datar bisa ditampilkan sebagai mode terpisah.

**FR-3 Navigasi antar-foto**
- Panah di jalan menuju foto di depan dan belakang (dan persimpangan bila ada lebih dari dua tetangga).
- Arah pandang dipertahankan saat berpindah.
- Penanda posisi dan kerucut arah pandang di peta ikut bergerak.

**FR-4 Impor data**
- Admin mengunggah video 360° atau kumpulan foto beserta jejak GPS.
- Sistem mengekstrak frame, membaca koordinat, menghitung arah, membuat thumbnail, dan mengisi database.

**FR-5 Moderasi**
- Foto berstatus draf, terbit, atau disembunyikan.
- Wajah dan plat nomor dikaburkan sebelum diterbitkan (lihat bagian Risiko).

**FR-6 Pencarian tempat (opsional MVP)**
- Cari nama tempat (misalnya Pasar Inpres, Pantai Menye) dan lompat ke foto terdekat.

## 5. Persyaratan non-fungsional

- **Kinerja:** foto pertama tampil di bawah 3 detik pada koneksi 4G; pencarian foto terdekat di bawah 100 ms.
- **Hemat data:** thumbnail resolusi rendah dimuat dulu, lalu resolusi penuh; foto tetangga dimuat lebih awal (prefetch).
- **Keamanan:** unggahan dan moderasi hanya untuk admin yang login; semua query memakai prepared statement.
- **Privasi:** metadata tidak menyimpan data pribadi pengunggah selain yang diperlukan.
- **Ketersediaan:** cadangan database harian.

## 6. Arsitektur dan teknologi

- **Database:** MySQL 8.0 (tipe spasial dan indeks spasial).
- **Backend:** Node.js (Express atau Fastify) dengan driver mysql2. Alternatif: PHP/Laravel bila tim lebih terbiasa.
- **Frontend:** Leaflet atau MapLibre untuk peta, Photo Sphere Viewer atau Pannellum untuk panorama.
- **Penyimpanan foto:** object storage (Cloudflare R2, S3, atau MinIO) atau disk server untuk tahap awal. Database hanya menyimpan jalur file, bukan gambar.
- **Pemrosesan:** ffmpeg (ekstrak frame), exiftool (EXIF/GPS), sharp (thumbnail dan tile), alat pengaburan wajah dan plat.
- **Peta dasar:** OpenStreetMap. Untuk produksi, periksa kebijakan penggunaan tile OSM atau pakai penyedia tile berlangganan.

## 7. Model data MySQL

Entitas utama: pengguna, sesi rekaman (sequence), foto, dan tautan antar-foto.

```sql
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','contributor') NOT NULL DEFAULT 'contributor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sequences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  camera VARCHAR(100),
  recorded_at DATETIME,
  status ENUM('draft','published','hidden') NOT NULL DEFAULT 'draft',
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE photos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sequence_id INT UNSIGNED NOT NULL,
  seq_index INT UNSIGNED NOT NULL,
  location POINT NOT NULL SRID 4326,
  heading_deg DECIMAL(5,2) NOT NULL,
  altitude_m DECIMAL(7,2),
  captured_at DATETIME,
  projection ENUM('equirectangular','flat') NOT NULL DEFAULT 'equirectangular',
  north_offset_deg DECIMAL(5,2) NOT NULL DEFAULT 0,
  file_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  width INT UNSIGNED, height INT UNSIGNED,
  status ENUM('draft','published','hidden') NOT NULL DEFAULT 'draft',
  SPATIAL INDEX idx_location (location),
  UNIQUE KEY uq_seq (sequence_id, seq_index),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id)
);

CREATE TABLE photo_links (
  from_photo_id BIGINT UNSIGNED NOT NULL,
  to_photo_id BIGINT UNSIGNED NOT NULL,
  bearing_deg DECIMAL(5,2) NOT NULL,
  distance_m DECIMAL(7,2) NOT NULL,
  PRIMARY KEY (from_photo_id, to_photo_id),
  FOREIGN KEY (from_photo_id) REFERENCES photos(id),
  FOREIGN KEY (to_photo_id) REFERENCES photos(id)
);
```

**Catatan teknis**
- Pada MySQL 8 dengan SRID 4326, urutan sumbu bawaan adalah lintang lalu bujur. Pakai opsi `axis-order=long-lat` pada `ST_GeomFromText` agar tidak tertukar, dan uji dengan satu titik yang diketahui sebelum impor besar.
- Indeks spasial hanya dipakai bila kolom `NOT NULL` dan ber-SRID, seperti pada skema di atas.
- Alternatif sederhana untuk MVP: kolom `lat` dan `lon` bertipe DECIMAL dengan indeks biasa dan pencarian kotak (bounding box). Cukup untuk ribuan foto, dan berguna bila hosting belum mendukung fitur spasial.

Contoh pencarian foto terdekat (kotak pembatas dulu, lalu urutkan menurut jarak):

```sql
SELECT id, file_path, heading_deg,
       ST_Distance_Sphere(location, ST_GeomFromText('POINT(96.835 4.629)', 4326, 'axis-order=long-lat')) AS jarak_m
FROM photos
WHERE status = 'published'
  AND MBRContains(
        ST_GeomFromText('POLYGON((96.8345 4.6285, 96.8355 4.6285, 96.8355 4.6295, 96.8345 4.6295, 96.8345 4.6285))', 4326, 'axis-order=long-lat'),
        location)
ORDER BY jarak_m
LIMIT 1;
```

## 8. API (rancangan)

- `GET /api/coverage?bbox=...` : garis cakupan (GeoJSON) untuk peta.
- `GET /api/photos/nearest?lat=&lon=` : foto terdekat dari titik klik.
- `GET /api/photos/:id` : detail foto, URL gambar, dan daftar tetangga beserta arahnya.
- `POST /api/sequences` dan `POST /api/sequences/:id/upload` : impor rekaman (admin).
- `PATCH /api/photos/:id` : ubah status atau offset utara (admin).

## 9. Alur pemrosesan data

1. Admin mengunggah video 360° dan jejak GPS (atau foto ber-EXIF).
2. Server mengekstrak frame tiap 5–10 m dengan ffmpeg, lalu mencocokkan waktu frame dengan titik GPS.
3. Arah (heading) dihitung dari titik sebelum dan sesudahnya.
4. Gambar dikaburkan (wajah, plat nomor), diperkecil, dan diunggah ke penyimpanan; thumbnail dibuat.
5. Baris dimasukkan ke `photos`, lalu `photo_links` dibuat antar-foto yang berurutan dan antar-foto dari sesi berbeda yang berjarak kurang dari ±15 m.
6. Admin memeriksa di peta, lalu mengubah status menjadi terbit.

## 10. Perkiraan kebutuhan data

- Satu kilometer jalan sekitar 100–200 foto.
- Foto 360° beresolusi menengah sekitar 3–6 MB, sehingga satu kilometer sekitar 0,5–1 GB (belum termasuk thumbnail). Ini perkiraan kasar; ukur dengan kamera yang dipakai.
- Target awal 3–5 km (sekitar 500–1.000 foto) cukup di server kecil.

## 11. Metrik keberhasilan

- Panjang jalan yang tercakup (km) dan jumlah foto terbit.
- Waktu rata-rata sampai foto pertama tampil.
- Jumlah sesi penelusuran per pekan dan rata-rata langkah per sesi.
- Jumlah laporan masalah (foto salah lokasi, wajah belum kabur).

## 12. Tahapan

- **Fase 0, persiapan:** pilih kamera, uji rekam satu ruas pendek, uji skema MySQL dengan 50–100 foto.
- **Fase 1, MVP:** peta, garis cakupan, penampil, navigasi, impor admin untuk jalan utama Takengon–Kebayakan–Bebesen.
- **Fase 2, perluasan:** kontributor, moderasi, pencarian tempat, tambah ruas Danau Laut Tawar.
- **Fase 3, distribusi:** unggah rekaman yang sama ke Mapillary atau Street View Studio agar terlihat di platform lain.

Durasi bergantung pada jumlah orang dan ketersediaan kamera, jadi belum ditetapkan di draf ini.

## 13. Risiko dan mitigasi

- **Privasi:** gambar jalan memuat wajah dan plat nomor. Kaburkan otomatis dan sediakan tombol laporkan serta hapus.
- **Akurasi GPS:** sinyal lemah di sekitar pegunungan dan pepohonan dapat menggeser titik. Gunakan GPS eksternal bila perlu dan sediakan alat koreksi lokasi untuk admin.
- **Biaya penyimpanan dan bandwidth:** gunakan thumbnail, kompresi, dan CDN; batasi resolusi.
- **Lisensi:** pakai peta dasar dan penampil sesuai lisensinya. Foto hanya dari rekaman sendiri atau yang diizinkan pemiliknya.
- **Ketergantungan layanan luar:** jangan bergantung penuh pada satu platform; simpan master foto sendiri.

## 14. Pertanyaan terbuka

- Kamera 360° apa yang akan dipakai dan siapa yang merekam?
- Hosting apa yang tersedia (versi MySQL, penyimpanan, bandwidth)?
- Apakah aplikasi ini publik sejak awal, atau tertutup dulu untuk uji coba?
- Siapa yang menangani moderasi dan permintaan hapus foto?
- Apakah rekaman akan juga diunggah ke Mapillary atau Street View Studio?

---

# Bagian B – Spesifikasi lengkap untuk Kiro

Bagian B melengkapi bagian 1–14. Isinya disusun agar bisa langsung dipakai di Kiro: keputusan teknis yang dikunci, persyaratan dengan kriteria penerimaan, desain, API, daftar tugas, file steering, dan prompt awal. Struktur `.kiro/specs` dan `.kiro/steering` mengikuti konvensi Kiro; cek dokumentasi Kiro terbaru bila ada perbedaan.

Cara memakai:
- Tempel prompt di bagian 28 ke Kiro agar ia membuat requirements, design, dan tasks, atau salin bagian 18, 20–23, dan 26 ke file spesifikasi masing-masing.
- Simpan bagian 27 di `.kiro/steering` agar konteks proyek selalu terbawa.
- Kerjakan tugas satu per satu dan jalankan pengujian bagian 25 di setiap akhir fase.

## 15. Keputusan teknis (dikunci)

- **Runtime:** Node.js 20 LTS dengan TypeScript.
- **Backend:** Fastify, driver mysql2 dengan query SQL langsung (tanpa ORM berat), validasi dengan zod.
- **Database:** MySQL 8.0, charset utf8mb4, tipe spasial SRID 4326.
- **Frontend:** Vite dan TypeScript tanpa framework UI. Leaflet untuk peta. Penampil panorama: Photo Sphere Viewer atau penampil sendiri berbasis canvas.
- **Pengolahan:** ffmpeg (ekstrak frame), sharp (thumbnail dan kompresi), exiftool-vendored (metadata), parser GPX sederhana.
- **Penyimpanan foto:** antarmuka `StorageDriver` dengan dua implementasi: disk lokal (MVP) dan S3-compatible (nanti). Database hanya menyimpan jalur file.
- **Autentikasi:** hanya admin, JWT di cookie httpOnly, kata sandi di-hash dengan argon2.
- **Peta dasar:** URL tile diatur lewat variabel lingkungan, sehingga mudah diganti penyedia.
- **Pengujian:** Vitest (unit), Playwright (alur utama), uji kontrak API.
- **Bahasa antarmuka:** Indonesia, dengan teks dipisah ke satu berkas agar bisa diterjemahkan.
- **Deploy:** Docker Compose berisi app, MySQL, dan nginx.

## 16. Struktur repositori

```
streetview-takengon/
├─ .kiro/            (specs dan steering)
├─ apps/
│  ├─ api/           (src/routes, src/db, src/services, src/storage, src/cli)
│  └─ web/           (src/map, src/viewer, src/ui, src/i18n)
├─ db/               (migrations, seed)
├─ storage/          (foto lokal, masuk .gitignore)
├─ docker-compose.yml
└─ README.md
```

## 17. Istilah

- **Sequence:** satu sesi rekaman menyusuri satu ruas jalan.
- **Foto (titik):** satu gambar 360° beserta lokasi dan arah.
- **Heading:** arah kompas (0–360°, 0 = utara) yang dihadapi kamera pada foto.
- **North offset:** selisih sudut antara bagian tengah gambar dan utara, untuk foto yang arahnya tidak diketahui.
- **Tetangga:** foto lain yang bisa dituju dari foto saat ini.

## 18. Persyaratan terperinci dan kriteria penerimaan

Format: KETIKA kondisi, MAKA sistem HARUS perilaku.

**R1. Peta dan cakupan**
- KETIKA halaman dibuka, MAKA sistem HARUS menampilkan peta Leaflet berpusat sesuai pengaturan peta awal (R12; bawaan lat 4.62, lon 96.84, zoom 12), dengan garis biru untuk setiap ruas yang punya foto berstatus terbit.
- KETIKA pengguna mengeklik dalam jarak 30 piksel dari garis biru, MAKA sistem HARUS memilih foto terdekat, memindahkan penanda posisi, dan memperbarui kartu pratinjau.
- JIKA tidak ada foto dalam jarak klik, MAKA sistem HARUS membiarkan pilihan sebelumnya.

**R2. Kartu pratinjau Street View**
- Kartu di kiri bawah HARUS menampilkan thumbnail, nama tempat terdekat, dan label Street View.
- KETIKA kartu diklik, MAKA sistem HARUS membuka Street View layar penuh pada foto itu.
- SEBELUM ada foto terpilih, kartu HARUS menampilkan petunjuk 'Klik garis biru untuk memilih lokasi'.

**R3. Penampil panorama**
- KETIKA pengguna menyeret atau menyentuh, MAKA pandangan HARUS berputar; scroll atau cubit HARUS mengubah zoom dengan sudut pandang 50–120°; pitch dibatasi ±80°.
- Sistem HARUS mendukung foto equirectangular 2:1 dan mode foto datar untuk panorama biasa.
- Sistem HARUS menampilkan thumbnail lebih dulu, lalu menggantinya dengan resolusi penuh setelah dimuat.

**R4. Navigasi antar-foto**
- Sistem HARUS menampilkan panah di jalan untuk tiap tetangga yang arahnya relatif terhadap pandangan berada dalam ±70°.
- KETIKA panah diklik, MAKA sistem HARUS pindah ke foto itu dan mempertahankan arah pandang kompas.
- Tombol Maju dan Mundur, tombol panah atas dan bawah di keyboard, serta Esc (kembali ke peta) HARUS berfungsi.
- Sistem HARUS memuat lebih awal (prefetch) thumbnail tetangga langsung.

**R5. Peta mini**
- Dalam Street View, peta mini HARUS menampilkan posisi dan kerucut arah pandang yang ikut berputar.

**R6. Impor oleh admin**
- KETIKA admin mengunggah video 360° dengan berkas GPX (atau foto ber-EXIF), MAKA sistem HARUS membuat sequence berstatus draf, mengekstrak frame setiap N meter (bawaan 8), menghitung heading, membuat thumbnail, dan membuat tautan tetangga.
- JIKA data GPS hilang lebih dari 30 detik, MAKA sistem HARUS menandai frame 'perlu diperiksa' dan tidak menerbitkannya otomatis.

**R7. Moderasi**
- Admin HARUS dapat menerbitkan atau menyembunyikan per foto maupun per sequence.
- Foto yang tidak terbit HARUS tidak muncul di API publik.
- Admin HARUS dapat menggeser lokasi foto di peta dan mengubah north offset.

**R8. Privasi dan laporan**
- SEBELUM diterbitkan, gambar HARUS lolos tahap pengaburan wajah dan plat nomor, atau ditandai selesai secara manual oleh admin.
- Pengguna HARUS dapat mengirim laporan (privasi, salah lokasi, lainnya) dari tombol Laporkan; laporan masuk antrean admin.

**R9. Kinerja**
- Thumbnail pertama HARUS tampil dalam 3 detik di jaringan 4G.
- Pencarian foto terdekat HARUS selesai dalam 100 ms untuk 100.000 foto.

**R10. Layar kecil dan aksesibilitas**
- Antarmuka HARUS dapat dipakai di layar 360 px, tombol minimal 44 px, kontras memadai, dan seluruh navigasi utama dapat dioperasikan dengan keyboard.

**R11. Input manual oleh admin**
- Admin HARUS dapat menambah, mengubah, dan menghapus tempat lewat formulir dengan kolom: nama (wajib, maks 150 karakter), kategori, latitude, longitude, dan foto terkait (opsional).
- Koordinat dapat diisi dengan mengetik atau mengeklik peta. KETIKA peta diklik, MAKA kolom latitude dan longitude HARUS terisi otomatis dan penanda bergeser.
- JIKA latitude di luar −90..90 atau longitude di luar −180..180, MAKA sistem HARUS menolak penyimpanan. JIKA titik berada di luar batas wilayah pada pengaturan peta awal (R12; bawaan perkiraan Aceh Tengah, lat 4.2–4.9, lon 96.5–97.3), MAKA sistem HARUS menampilkan peringatan dan meminta konfirmasi.
- Admin HARUS dapat mengunggah satu foto 360° (equirectangular 2:1) atau panorama datar lewat formulir dengan kolom: judul, latitude, longitude, arah foto (0–360°, boleh kosong), jenis foto (360° atau datar), dan status.
- SEBELUM disimpan, sistem HARUS menampilkan pratinjau foto di penampil panorama dan memvalidasi: format JPEG, PNG, atau WebP; ukuran maksimal 25 MB (dapat diatur); rasio 2:1 untuk jenis 360°.
- JIKA foto memiliki EXIF GPS, MAKA kolom koordinat HARUS terisi otomatis dan tetap bisa diubah admin.
- Foto manual HARUS masuk ke sequence bernama 'Input manual' berstatus draf, dibuatkan thumbnail, dan ditautkan ke foto lain yang berjarak kurang dari 15 m.
- Seluruh fitur ini HANYA untuk admin yang login.

**R12. Pengaturan peta awal**
- Admin HARUS dapat mengatur tampilan awal peta untuk wilayah apa pun, misalnya satu kabupaten atau satu kecamatan, dengan kolom: nama wilayah, latitude dan longitude pusat, zoom awal (1–19), dan batas wilayah opsional (lintang dan bujur minimum serta maksimum).
- Admin HARUS dapat mengisinya dengan tiga cara: mengetik angka, mengeklik peta untuk menaruh titik pusat, atau menggeser dan men-zoom peta lalu menekan 'Pakai tampilan saat ini' agar pusat dan zoom terisi dari peta.
- Admin HARUS dapat menggambar kotak di peta untuk mengisi batas wilayah. JIKA batas diisi, MAKA pengunjung HARUS tidak dapat menggeser peta jauh keluar batas, dan zoom minimum disesuaikan agar wilayah itu tetap terlihat.
- Admin DAPAT menyimpan beberapa wilayah (misalnya 'Kabupaten Aceh Tengah' dan 'Kecamatan Lut Tawar') dan memilih satu yang aktif.
- KETIKA pengunjung membuka aplikasi, MAKA sistem HARUS memuat wilayah aktif dan memusatkan peta sesuai pengaturannya. JIKA belum ada pengaturan atau gagal dimuat, MAKA sistem HARUS memakai nilai bawaan (lat 4.62, lon 96.84, zoom 12).
- Sistem HARUS memvalidasi: latitude −90..90, longitude −180..180, zoom 1–19, lintang minimum lebih kecil dari maksimum, bujur minimum lebih kecil dari maksimum, dan titik pusat berada di dalam batas bila batas diisi.
- Perubahan HARUS langsung berlaku tanpa memasang ulang aplikasi. Batas wilayah aktif juga dipakai sebagai area peringatan pada R11.
- Tersedia tombol 'Kembalikan ke bawaan'.

## 19. Desain antarmuka (gaya Google Maps)

- **Layar utama:** peta penuh layar; kotak judul kecil kiri atas; kartu Street View kiri bawah (lebar maks 270 px; di HP selebar layar dikurangi 24 px).
- **Street View:** kanvas penuh layar; tombol 'Kembali ke peta' kiri atas; info lokasi kanan atas; peta mini kiri bawah; tombol Maju, Mundur, dan Laporkan kanan bawah. Menu ganti foto hanya muncul untuk admin.
- **Warna:** garis cakupan biru #2A7BE4, penanda posisi oranye #F08A1C, panah putih dengan garis tepi gelap.
- **Mode gelap** mengikuti pengaturan perangkat.
- **Acuan perilaku:** prototipe `streetview-takengon-leaflet.html` yang sudah dibuat. Perilaku peta, kartu, panah, dan peta mini harus sama.

## 20. Spesifikasi API

Semua respons berformat JSON. Kesalahan memakai bentuk `{ "error": { "code": "...", "message": "..." } }`. Endpoint publik tanpa login; `/api/admin/*` wajib login.

**Publik**
- `GET /api/coverage?bbox=minLon,minLat,maxLon,maxLat` mengembalikan GeoJSON FeatureCollection, satu LineString per sequence terbit, diurutkan menurut `seq_index`.
- `GET /api/photos/nearest?lat=&lon=&maxM=30` mengembalikan satu foto, atau 404 bila tidak ada.
- `GET /api/photos/:id` mengembalikan detail foto beserta tetangga.
- `GET /api/places?q=` mencari tempat berdasarkan nama.
- `POST /api/reports` dengan isi `{ photoId, type, note }`, balasan 201, dibatasi 5 permintaan per menit per IP.

**Admin**
- `POST /api/admin/login`
- `POST /api/admin/sequences` dan `POST /api/admin/sequences/:id/upload` (multipart)
- `PATCH /api/admin/photos/:id` dengan isi `{ status, lat, lon, northOffsetDeg }`
- `PATCH /api/admin/sequences/:id` dengan isi `{ status }`
- `GET /api/admin/reports`

Tambahan untuk input manual (R11):

- `GET /api/admin/places`
- `POST /api/admin/places` dengan isi `{ name, category, lat, lon, photoId? }`, balasan 201
- `PATCH /api/admin/places/:id` dan `DELETE /api/admin/places/:id`
- `POST /api/admin/photos` (multipart: `file`, `title`, `lat`, `lon`, `headingDeg?`, `projection`, `status`), balasan 201 berisi detail foto
- `DELETE /api/admin/photos/:id`

Pengaturan peta awal (R12):

- `GET /api/settings/map` (publik) mengembalikan wilayah aktif, misalnya `{ name, center: { lat, lon }, zoom, bounds: { minLat, minLon, maxLat, maxLon } | null }`.
- `GET /api/admin/map-areas` dan `POST /api/admin/map-areas` (buat wilayah)
- `PATCH /api/admin/map-areas/:id` dan `DELETE /api/admin/map-areas/:id`
- `POST /api/admin/map-areas/:id/activate` menjadikan wilayah itu yang aktif

Contoh balasan `GET /api/photos/:id`:

```json
{
  "id": 123,
  "url": "/media/p/123.jpg",
  "thumbUrl": "/media/t/123.jpg",
  "lat": 4.62912,
  "lon": 96.83518,
  "headingDeg": 87.5,
  "northOffsetDeg": 0,
  "projection": "equirectangular",
  "near": "Pusat Kota Takengon",
  "neighbors": [
    { "id": 124, "bearingDeg": 88.0, "distanceM": 9.8 },
    { "id": 122, "bearingDeg": 268.0, "distanceM": 10.1 }
  ]
}
```

## 21. Basis data tambahan dan data awal

Skema inti ada di bagian 7. Tambahan:

```sql
CREATE TABLE places (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50),
  location POINT NOT NULL SRID 4326,
  photo_id BIGINT UNSIGNED NULL,
  SPATIAL INDEX idx_place_loc (location),
  FOREIGN KEY (photo_id) REFERENCES photos(id)
);

CREATE TABLE reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  photo_id BIGINT UNSIGNED NOT NULL,
  type ENUM('privacy','wrong_location','other') NOT NULL,
  note VARCHAR(500),
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (photo_id) REFERENCES photos(id)
);

CREATE INDEX idx_photos_status_seq ON photos (status, sequence_id);
```

Tabel pengaturan peta awal (R12):

```sql
CREATE TABLE map_areas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  center_lat DECIMAL(9,6) NOT NULL,
  center_lon DECIMAL(9,6) NOT NULL,
  zoom TINYINT UNSIGNED NOT NULL DEFAULT 12,
  min_lat DECIMAL(9,6) NULL,
  min_lon DECIMAL(9,6) NULL,
  max_lat DECIMAL(9,6) NULL,
  max_lon DECIMAL(9,6) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO map_areas (name, center_lat, center_lon, zoom, min_lat, min_lon, max_lat, max_lon, is_active)
VALUES ('Kabupaten Aceh Tengah (bawaan)', 4.62, 96.84, 12, 4.2, 96.5, 4.9, 97.3, 1);
```

Hanya satu baris yang boleh aktif. Saat mengaktifkan satu wilayah, nonaktifkan yang lain dalam satu transaksi.

- Migrasi bernomor disimpan di `db/migrations`, data awal di `db/seed`.
- Data awal tempat (posisi perkiraan, ganti dengan koordinat GPS asli): Kebayakan (4.622, 96.862), Pusat Kota Takengon (4.629, 96.835), Bebesen (4.605, 96.815), Pegasing (4.548, 96.825).
- Ingat: pada SRID 4326 di MySQL 8, urutan sumbu bawaan adalah lintang lalu bujur. Pakai `axis-order=long-lat` dan tulis satu uji otomatis dengan titik yang diketahui.

## 22. Algoritma inti

1. **Heading foto:** hitung arah kompas dari foto sebelumnya ke foto sesudahnya dalam sequence, lalu haluskan dengan rata-rata bergerak 3 titik. Foto pertama dan terakhir memakai arah ke tetangga satu-satunya.
2. **Tautan tetangga:** hubungkan setiap foto dengan foto sebelum dan sesudahnya dalam sequence. Tambahkan tautan lintas sequence bila jaraknya di bawah 15 m, maksimal 6 tetangga per foto. Simpan `bearing_deg` dan `distance_m`.
3. **Foto terdekat:** saring dengan kotak pembatas memakai indeks spasial, lalu urutkan dengan `ST_Distance_Sphere`; ambil yang pertama bila jaraknya di bawah `maxM`.
4. **Arah panah:** untuk setiap tetangga, sudut relatif = bearing tetangga dikurangi arah pandang saat ini, dinormalkan ke −180°..180°. Tampilkan panah bila nilai mutlaknya di bawah 70°.
5. **Pindah foto:** pertahankan arah pandang kompas. Untuk foto dengan `north_offset_deg`, putar gambar sebesar offset itu.
6. **Prefetch:** setelah foto tampil, muat thumbnail semua tetangga, lalu gambar penuh tetangga di depan.

## 23. Pipeline impor (CLI)

Perintah: `npm run import -- --input rekaman.mp4 --gpx jejak.gpx --title 'Jalan Lebe Kader' --spacing 8`

1. Baca GPX dan buang titik dengan lonjakan jarak tidak wajar.
2. Ekstrak frame setiap `spacing` meter berdasarkan jarak tempuh dari GPX.
3. Pasang koordinat dan hitung heading untuk tiap frame.
4. Kaburkan wajah dan plat nomor (modul terpisah, bisa dinonaktifkan untuk uji).
5. Buat versi penuh (maks 6000 px) dan thumbnail (640 px), simpan lewat `StorageDriver`.
6. Masukkan baris ke `photos` (status draf) dan buat `photo_links`.
7. Cetak ringkasan: jumlah frame, panjang ruas, frame yang perlu diperiksa.

## 24. Keamanan, privasi, dan kepatuhan

- Semua query memakai prepared statement; masukan divalidasi dengan zod.
- Batas ukuran dan tipe berkas unggahan; pemindaian nama berkas untuk mencegah path traversal.
- Cookie sesi httpOnly dan sameSite; pembatasan percobaan login.
- Rate limit pada endpoint publik, terutama laporan.
- Wajah dan plat nomor dikaburkan sebelum terbit; alur laporan dan penghapusan foto harus tersedia sebelum peluncuran publik.
- Cantumkan atribusi peta (OpenStreetMap dan penyedia tile) di antarmuka.
- Jangan menyimpan data pribadi pengunjung; bila memakai analitik, pilih yang tanpa cookie pelacak.

## 25. Pengujian dan definisi selesai

- **Unit:** perhitungan heading, bearing relatif, pembuatan tautan tetangga, urutan sumbu koordinat MySQL.
- **Kontrak API:** setiap endpoint di bagian 20 punya uji dengan contoh balasan di atas.
- **Alur utama (Playwright):** buka peta, klik garis biru, kartu berubah, buka Street View, klik panah, foto berganti, Esc kembali ke peta.
- **Kinerja:** uji pencarian terdekat dengan 100.000 baris data sintetis.
- **Selesai bila:** semua kriteria R1–R12 terpenuhi, uji lulus, README menjelaskan cara menjalankan, dan satu ruas nyata (minimal 1 km) sudah terbit dengan wajah dan plat terkaburkan.

## 26. Daftar tugas (tasks)

**Fase 0 – Fondasi**

1. Siapkan monorepo, TypeScript, lint, dan Docker Compose (app dan MySQL).
2. Buat migrasi untuk `users`, `sequences`, `photos`, `photo_links`, `places`, `reports`, `map_areas`.
3. Tulis uji urutan sumbu koordinat dan data awal tempat.

**Fase 1 – API baca**

4. Implementasi `GET /api/coverage`.
5. Implementasi `GET /api/photos/nearest` dan `GET /api/photos/:id` beserta tetangga.
6. Implementasi `GET /api/places` dan `POST /api/reports`.
7. Seed 50–100 foto sintetis untuk pengembangan.

**Fase 2 – Frontend**

8. Peta Leaflet, garis cakupan, penanda posisi, klik untuk memilih foto.
9. Kartu pratinjau Street View.
10. Penampil panorama layar penuh (seret, zoom, foto datar).
11. Panah navigasi, tombol Maju/Mundur, keyboard, prefetch.
12. Peta mini dengan kerucut arah pandang.
13. Tampilan HP dan mode gelap.

**Fase 3 – Admin dan impor**

14. Login admin dan middleware.
15. CLI impor video dan GPX, sampai tautan tetangga.
16. Modul pengaburan wajah dan plat nomor.
17. Halaman admin: daftar sequence, terbit/sembunyikan, geser lokasi, antrean laporan.

**Fase 4 – Rilis**

18. Uji kinerja dan perbaikan.
19. Uji alur utama Playwright.
20. Dokumentasi, cadangan database, dan deploy dengan Docker Compose.

**Tambahan – Input manual admin (R11, kerjakan setelah Fase 3)**

21. Endpoint CRUD tempat beserta uji validasi koordinat.
22. Endpoint unggah foto manual: validasi tipe, ukuran, dan rasio; baca EXIF GPS; buat thumbnail dan tautan tetangga.
23. Halaman admin: formulir tempat dengan peta untuk memilih koordinat.
24. Halaman admin: formulir unggah foto dengan pratinjau panorama sebelum disimpan.

**Tambahan – Pengaturan peta awal (R12)**

25. Tabel `map_areas`, data awal bawaan, serta endpoint publik dan admin (buat, ubah, hapus, aktifkan) dengan validasi.
26. Frontend memuat wilayah aktif (pusat, zoom, batas) dan memakai nilai bawaan bila gagal.
27. Halaman admin: formulir wilayah dengan tombol 'Pakai tampilan saat ini', klik peta untuk titik pusat, gambar kotak batas, daftar wilayah, dan tombol aktifkan.

## 27. File steering untuk Kiro

`.kiro/steering/product.md`:

```
Produk: aplikasi web Street View untuk Takengon (Aceh Tengah).
Pengalaman utama: peta penuh layar gaya Google Maps, kartu Street View di kiri bawah,
klik kartu membuka panorama 360 derajat dengan panah navigasi.
Bahasa antarmuka: Indonesia. Pengguna utama: warga dan pengunjung, admin untuk impor dan moderasi.
```

`.kiro/steering/tech.md`:

```
Node.js 20 + TypeScript, Fastify, mysql2 (SQL langsung), zod, MySQL 8 dengan SRID 4326.
Frontend: Vite + TypeScript, Leaflet. Gambar: sharp, ffmpeg. Uji: Vitest dan Playwright.
Sumbu koordinat MySQL SRID 4326: lintang lalu bujur; gunakan axis-order=long-lat.
Jangan menyimpan gambar di database; simpan jalur file saja.
```

`.kiro/steering/structure.md`:

```
Monorepo: apps/api, apps/web, db/migrations, db/seed, storage.
Satu berkas rute per sumber daya di apps/api/src/routes. Query SQL di apps/api/src/db.
Teks antarmuka di apps/web/src/i18n/id.ts.
```

## 28. Prompt awal untuk Kiro

Tempel teks berikut ke Kiro sebagai permintaan awal (mode spec):

```
Buat spesifikasi dan implementasi aplikasi web Street View untuk Takengon, Aceh Tengah,
mengikuti dokumen PRD terlampir (bagian 1–28). Gunakan keputusan teknis di bagian 15
juga struktur repositori di bagian 16. Hasilkan requirements.md dari bagian 18,
design.md dari bagian 19–23, dan tasks.md dari bagian 26. Mulai dari Fase 0.
Tampilan harus meniru Google Maps: peta penuh layar, kartu Street View di kiri bawah,
klik kartu membuka panorama layar penuh dengan panah navigasi dan peta mini.
Jangan menambah fitur di luar PRD tanpa bertanya.
```

## 29. Variabel lingkungan dan deployment

```
DATABASE_URL=mysql://user:pass@db:3306/streetview
JWT_SECRET=ganti-dengan-nilai-acak-panjang
STORAGE_DRIVER=local
STORAGE_DIR=/data/storage
PUBLIC_BASE_URL=https://contoh.example
TILE_URL=https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png
TILE_ATTRIBUTION=OpenStreetMap contributors, CARTO
```

- Docker Compose menjalankan tiga layanan: `api`, `db` (MySQL 8 dengan volume), dan `nginx` untuk melayani frontend dan folder media.
- Cadangan database harian dengan `mysqldump`, simpan di luar server.
- Sebelum dipakai publik, periksa kebijakan penggunaan penyedia tile yang dipilih.
