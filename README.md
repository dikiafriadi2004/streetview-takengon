# Street View Takengon

Aplikasi web Street View untuk Kabupaten Aceh Tengah (Takengon). Pengguna dapat menelusuri jalan di Takengon lewat foto 360° yang direkam sendiri, dengan pengalaman mirip Google Street View.

## Fitur

- Peta penuh layar (Leaflet + OpenStreetMap)
- Garis cakupan biru untuk ruas yang sudah punya foto
- Kartu Street View di pojok kiri bawah
- Penampil panorama 360° (Photo Sphere Viewer)
- Navigasi antar-foto dengan panah dan keyboard
- Peta mini dengan penanda posisi dan kerucut arah pandang
- Panel admin: impor video + GPX, upload foto manual, moderasi

## Prasyarat

- Node.js 20 LTS
- Docker & Docker Compose
- MySQL 8.0 (via Docker)

## Menjalankan secara lokal

```bash
# Clone dan masuk ke direktori
cd streetview-takengon

# Salin variabel lingkungan
cp .env.example .env
# Edit .env sesuai kebutuhan

# Install dependencies
npm install

# Jalankan database + API + frontend (development)
npm run dev:api     # terminal 1
npm run dev:web     # terminal 2
```

## Menjalankan dengan Docker

```bash
# Build dan jalankan semua service
docker compose up -d --build

# Jalankan migrasi dan seed (pertama kali)
docker compose exec api node dist/cli/seed.js
```

## Migrasi database

File SQL ada di `db/migrations/`. Urutan eksekusi:

1. `001_init.sql` — tabel utama (users, sequences, photos, photo_links)
2. `002_places_reports.sql` — tempat, laporan, indeks tambahan
3. `003_map_areas.sql` — pengaturan wilayah peta

## Import foto dari video

```bash
cd apps/api
npx tsx src/cli/import.ts \
  --input rekaman.mp4 \
  --gpx jejak.gpx \
  --title "Jalan Lebe Kader" \
  --spacing 8
```

## Struktur direktori

```
streetview-takengon/
├─ apps/
│  ├─ api/          # Backend Fastify + TypeScript
│  └─ web/          # Frontend Vite + TypeScript + Leaflet
├─ db/
│  ├─ migrations/   # File SQL migrasi
│  └─ seed/         # Data awal
├─ storage/         # Foto lokal (tidak masuk git)
├─ docker-compose.yml
├─ nginx.conf
└─ README.md
```

## Akun admin bawaan (seed)

- Email: `admin@streetview.takengon`
- Password: `admin123`

**Ganti password segera di production!**

## Lisensi peta

Peta dasar menggunakan data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, lisensi ODbL.
