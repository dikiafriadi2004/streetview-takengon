# Implementation Plan — Street View Takengon

Workdir: `/Users/dikiafriadi/Desktop/Monetra/Project/streatview/streetview-takengon/`

## Keputusan Desain

- **Monorepo npm workspaces** — root `package.json` mengikat `apps/api` dan `apps/web`. Alasan: satu `npm install` untuk semua, script `npm -w apps/api run test` dari root.
- **Photo Sphere Viewer v5** (`@photo-sphere-viewer/core`) — library utama panorama. Alasan: PRD menetapkan ini sebagai pilihan, mendukung equirectangular 2:1 dan `sphereCorrection.pan` untuk north offset.
- **Tidak ada framework UI** — vanilla TypeScript + CSS untuk frontend. Alasan: PRD mengunci ini. Komponen dibuat sebagai class ES dengan DOM manipulation.
- **Import CLI fase 1 = direktori JPEG** — ekstraksi video dengan ffmpeg di-stub (TODO). Alasan: tidak ada kamera fisik saat development; seed data sintetis cukup untuk uji integrasi.
- **Spatial query**: semua `ST_GeomFromText` pakai opsi `'axis-order=long-lat'` agar `POINT(lon lat)` — ini wajib di MySQL 8 SRID 4326, tanpa opsi ini lat dan lon tertukar.
- **Rate limit laporan**: `@fastify/rate-limit` dikonfigurasi per-route di `POST /api/reports` (5/menit/IP), bukan global.

---

## FEAT-001 — Scaffolding, Konfigurasi, Migrasi DB

**Ketergantungan:** tidak ada (fondasi semua FEAT lain)

- [ ] 1. Buat `package.json` root (npm workspaces: `apps/api`, `apps/web`)
      Files: `/Users/dikiafriadi/Desktop/Monetra/Project/streatview/streetview-takengon/package.json`
      Verify: `npm install` dari root, exit 0.

- [ ] 2. Buat `apps/api/package.json` dengan semua dependencies backend (fastify@^4, @fastify/cookie@^9, @fastify/jwt@^8, @fastify/multipart@^8, @fastify/rate-limit@^9, @fastify/static@^7, mysql2@^3, zod@^3, argon2@^0.31, sharp@^0.33, exiftool-vendored@^28, fast-xml-parser@^4, uuid@^9) dan devDependencies (typescript@^5, tsx@^4, vitest@^1, @types/node@^20).
      Files: `apps/api/package.json`
      Verify: `cd apps/api && npm install`, `npm run build` passes tsc.

- [ ] 3. Buat `apps/api/tsconfig.json` (target ES2022, module NodeNext, strict true, outDir dist)
      Files: `apps/api/tsconfig.json`
      Verify: `cd apps/api && npx tsc --noEmit` (setelah src ditulis).

- [ ] 4. Buat `apps/web/package.json` dengan dependencies (leaflet@^1.9, @photo-sphere-viewer/core@^5) dan devDependencies (vite@^5, typescript@^5, @types/leaflet@^1). Scripts: dev, build, preview.
      Files: `apps/web/package.json`
      Verify: `cd apps/web && npm run build` exit 0.

- [ ] 5. Buat `apps/web/tsconfig.json` (target ES2020, module ESNext, moduleResolution Bundler, strict, lib ES2020+DOM)
      Files: `apps/web/tsconfig.json`

- [ ] 6. Buat `apps/web/vite.config.ts` dengan proxy `/api` → `http://localhost:3000` dan `/media` → `http://localhost:3000`
      Files: `apps/web/vite.config.ts`

- [ ] 7. Buat `.env.example` dengan semua variabel: `DATABASE_URL`, `JWT_SECRET`, `STORAGE_DRIVER=local`, `STORAGE_DIR=./storage`, `PUBLIC_BASE_URL`, `TILE_URL` (default CartoCDN voyager), `TILE_ATTRIBUTION`, `PORT=3000`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`
      Files: `.env.example`

- [ ] 8. Buat `docker-compose.yml` dengan services: db (mysql:8.0, volume db_data, mount migrations ke `/docker-entrypoint-initdb.d`, healthcheck mysqladmin ping), api (build apps/api, depends_on db healthy), nginx (alpine, serve web dist, proxy /api/ ke api:3000)
      Files: `docker-compose.yml`

- [ ] 9. Buat `nginx.conf` — proxy `/api/` dan `/media/` ke api:3000; serve `/` dari /usr/share/nginx/html
      Files: `nginx.conf`

- [ ] 10. Buat `apps/api/Dockerfile` — multi-stage: build stage (node:20-alpine, npm ci, tsc), runtime stage (node:20-alpine, copy dist, CMD node dist/index.js)
       Files: `apps/api/Dockerfile`

- [ ] 11. Buat `db/migrations/001_init.sql` — full schema: users, sequences, photos (SPATIAL INDEX, UNIQUE uq_seq, INDEX idx_photos_status_seq), photo_links. CRITICAL: `location POINT NOT NULL SRID 4326`, `SPATIAL INDEX idx_location(location)`. Engine InnoDB, charset utf8mb4.
       Files: `db/migrations/001_init.sql`

- [ ] 12. Buat `db/migrations/002_places_reports.sql` — tables places (SPATIAL INDEX) dan reports
       Files: `db/migrations/002_places_reports.sql`

- [ ] 13. Buat `db/seed/seed.ts` — insert admin user (argon2 hash), insert 4 seed places dengan `ST_GeomFromText('POINT(lon lat)', 4326, 'axis-order=long-lat')`. INSERT IGNORE untuk idempotency.
       Files: `db/seed/seed.ts`
       Verify: `cd db && npx tsx seed/seed.ts` dengan DATABASE_URL set → exit 0.

- [ ] 14. Buat `apps/api/src/db/pool.ts` — createPool mysql2, export `execute<T>(sql, params)` helper
       Files: `apps/api/src/db/pool.ts`

- [ ] 15. Buat `apps/api/src/index.ts` — Fastify instance, register semua plugins dan route, listen on PORT
       Files: `apps/api/src/index.ts`
       Verify: `cd apps/api && npx tsc --noEmit` exit 0.

- [ ] 16. Buat `README.md` — prerequisite, local dev setup, import CLI, test commands, Docker deploy
       Files: `README.md`

---

## FEAT-002 — Backend API: Routes, Services, Tests

**Ketergantungan:** FEAT-001 harus selesai (package.json, tsconfig, pool.ts, migrations)

### Storage

- [ ] 17. Buat `apps/api/src/storage/driver.ts` — interface `StorageDriver { save, url, delete }`
       Files: `apps/api/src/storage/driver.ts`

- [ ] 18. Buat `apps/api/src/storage/local.ts` — implementasi disk lokal, `createLocalDriver()`
       Files: `apps/api/src/storage/local.ts`

### DB Query Modules

- [ ] 19. Buat `apps/api/src/db/sequences.ts` — `findSequenceById`, `createSequence`, `updateSequenceStatus`, `listSequencesForAdmin`
       Files: `apps/api/src/db/sequences.ts`

- [ ] 20. Buat `apps/api/src/db/photos.ts` — `findPhotoById` (dengan neighbors join), `findNearest` (MBRContains + ST_Distance_Sphere, WAJIB axis-order=long-lat), `getCoverageLines` (grouped by sequence_id, ordered seq_index), `updatePhoto`, `insertPhoto`
       Files: `apps/api/src/db/photos.ts`
       **KRITIS:** Semua `ST_GeomFromText` harus: `ST_GeomFromText('POINT(lon lat)', 4326, 'axis-order=long-lat')`

- [ ] 21. Buat `apps/api/src/db/places.ts` — `findNearestPlace`, `searchPlaces`, `insertPlace`
       Files: `apps/api/src/db/places.ts`

- [ ] 22. Buat `apps/api/src/db/reports.ts` — `createReport`, `listReportsForAdmin`, `updateReportStatus`
       Files: `apps/api/src/db/reports.ts`

### Service Logic

- [ ] 23. Buat `apps/api/src/services/heading.ts` — `calculateHeadings(points)`, `bearingBetween(lat1,lon1,lat2,lon2)`. Algoritma: bearing = atan2(sin(Δλ)·cos(φ2), cos(φ1)·sin(φ2) − sin(φ1)·cos(φ2)·cos(Δλ)) → degrees. Smoothing: 3-point moving average (wrap-safe: average via unit vectors sin/cos).
       Files: `apps/api/src/services/heading.ts`

- [ ] 24. Buat `apps/api/src/services/neighbor.ts` — `buildPhotoLinks(photos)`, `haversineDistance(lat1,lon1,lat2,lon2)`. Haversine: `a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2); d = 2R·atan2(√a,√(1−a))`. Max 6 neighbors per photo. Cross-sequence link bila jarak < 15m.
       Files: `apps/api/src/services/neighbor.ts`

- [ ] 25. Buat `apps/api/src/services/import.ts` — `importSequence(opts)`. Flow: parse GPX → filter spike → cumulative distance → extract frame positions every spacing meters → calculateHeadings → create sequence row → save images via StorageDriver → sharp thumbnail 640px → insertPhoto → buildPhotoLinks → bulk insert photo_links.
       Files: `apps/api/src/services/import.ts`

- [ ] 26. Buat `apps/api/src/cli/import.ts` — CLI wrapper, parse argv, call importSequence, print summary
       Files: `apps/api/src/cli/import.ts`

### Public Routes

- [ ] 27. Buat `apps/api/src/routes/coverage.ts` — `GET /api/coverage?bbox=minLon,minLat,maxLon,maxLat` → GeoJSON FeatureCollection (LineString per sequence, Content-Type: application/geo+json)
       Files: `apps/api/src/routes/coverage.ts`

- [ ] 28. Buat `apps/api/src/routes/photos.ts` — `GET /api/photos/nearest`, `GET /api/photos/:id`. Response shape dari PRD §20: `{id, url, thumbUrl, lat, lon, headingDeg, northOffsetDeg, projection, near, neighbors:[{id,bearingDeg,distanceM}]}`
       Files: `apps/api/src/routes/photos.ts`

- [ ] 29. Buat `apps/api/src/routes/places.ts` — `GET /api/places?q=` → array `{id,name,category,lat,lon}`
       Files: `apps/api/src/routes/places.ts`

- [ ] 30. Buat `apps/api/src/routes/reports.ts` — `POST /api/reports` body zod-validated `{photoId, type, note?}`, rate-limit 5/min/IP, return 201 `{id}`
       Files: `apps/api/src/routes/reports.ts`

### Admin Routes

- [ ] 31. Buat `apps/api/src/routes/admin/auth.ts` — `POST /api/admin/login` (argon2.verify, set httpOnly cookie 'token'), `POST /api/admin/logout`, export `authenticateAdmin` preHandler hook
       Files: `apps/api/src/routes/admin/auth.ts`

- [ ] 32. Buat `apps/api/src/routes/admin/sequences.ts` — `POST /api/admin/sequences`, `PATCH /api/admin/sequences/:id`, `POST /api/admin/sequences/:id/upload` (multipart → importSequence)
       Files: `apps/api/src/routes/admin/sequences.ts`

- [ ] 33. Buat `apps/api/src/routes/admin/photos.ts` — `PATCH /api/admin/photos/:id` → update status/location/northOffsetDeg
       Files: `apps/api/src/routes/admin/photos.ts`

- [ ] 34. Buat `apps/api/src/routes/admin/reports.ts` — `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`
       Files: `apps/api/src/routes/admin/reports.ts`

### Unit Tests

- [ ] 35. Buat `apps/api/src/services/__tests__/heading.test.ts` — Vitest tests: bearingBetween (known east-west pair → ~90°), calculateHeadings (straight line), smoothing (zigzag → averaged)
       Files: `apps/api/src/services/__tests__/heading.test.ts`
       Verify: `cd apps/api && npx vitest run src/services` — pass.

- [ ] 36. Buat `apps/api/src/services/__tests__/neighbor.test.ts` — Vitest tests: haversineDistance (known pair ±1m), buildPhotoLinks (3 photos → 4 links), cross-sequence (10m → linked), max 6 cap
       Files: `apps/api/src/services/__tests__/neighbor.test.ts`
       Verify: `cd apps/api && npx vitest run src/services` — pass.

- [ ] 37. Buat `apps/api/src/db/__tests__/axis-order.test.ts` — integration test (test.skip if no DATABASE_URL). Insert POINT(96.835, 4.629) axis-order=long-lat, select ST_X(location)=lon, ST_Y(location)=lat. Assert lon≈96.835, lat≈4.629.
       Files: `apps/api/src/db/__tests__/axis-order.test.ts`
       Verify: `cd apps/api && npx vitest run` (unit only pass without DB).

---

## FEAT-003 — Frontend Web Application

**Ketergantungan:** FEAT-001 harus selesai (package.json, tsconfig, vite.config)

- [ ] 38. Buat `apps/web/src/i18n/id.ts` — semua string UI dalam Bahasa Indonesia
       Files: `apps/web/src/i18n/id.ts`

- [ ] 39. Buat `apps/web/src/api/client.ts` — typed fetch wrapper: `getCoverage`, `getNearestPhoto`, `getPhoto`, `searchPlaces`, `submitReport`. Types: `PhotoDetail`, `Neighbor`, `Place`.
       Files: `apps/web/src/api/client.ts`

- [ ] 40. Buat `apps/web/src/map/map.ts` — `initMap(containerId)`: Leaflet map centered [4.62, 96.84] zoom 13, TILE_URL dari `import.meta.env.VITE_TILE_URL`, disable default zoom control, re-add bottom-right.
       Files: `apps/web/src/map/map.ts`

- [ ] 41. Buat `apps/web/src/map/coverage.ts` — `loadCoverage(map, onPhotoSelect)`: fetch GeoJSON dari `/api/coverage`, render L.GeoJSON biru (#2A7BE4 weight:5), click → getNearestPhoto → onPhotoSelect. Re-fetch on moveend (zoom≥11).
       Files: `apps/web/src/map/coverage.ts`

- [ ] 42. Buat `apps/web/src/map/marker.ts` — `PositionMarker` class: oranye (#F08A1C), L.DivIcon dengan triangle SVG dirotasi ke headingDeg.
       Files: `apps/web/src/map/marker.ts`

- [ ] 43. Buat `apps/web/src/ui/card.ts` — `StreetViewCard` class: DOM card fixed bottom-left, max-w 270px, mobile full-width-24px, thumbnail + near label + "Street View" text, clickable.
       Files: `apps/web/src/ui/card.ts`

- [ ] 44. Buat `apps/web/src/viewer/panorama.ts` — `PanoramaViewer` class: PSV Viewer, `open(photo)` (load thumb first then full), `sphereCorrection.pan` = northOffsetDeg, `getCurrentYaw()`, `setYaw()`, `prefetchNeighbors()`.
       Files: `apps/web/src/viewer/panorama.ts`

- [ ] 45. Buat `apps/web/src/viewer/arrows.ts` — `NavigationArrows` class: `update(neighbors, currentHeadingDeg, viewerYaw)` — hitung relativeAngle = normalize(bearingDeg - viewerYaw), tampilkan bila |angle| < 70°. Arrow div: putih, chevron SVG dirotasi, posisi translateX(sin(angle)*40vw).
       Files: `apps/web/src/viewer/arrows.ts`
       **Algoritma normalizeAngle:** `((a % 360) + 540) % 360 - 180` → range −180..180.

- [ ] 46. Buat `apps/web/src/viewer/minimap.ts` — `MiniMap` class: Leaflet 160×160px clone, DivIcon dengan FOV cone SVG (wedge ±fovDeg/2) dirotasi ke headingDeg, `update(lat,lon,headingDeg)`.
       Files: `apps/web/src/viewer/minimap.ts`

- [ ] 47. Buat `apps/web/src/ui/controls.ts` — `ViewerControls` class: back button kiri-atas, location label kanan-atas, Maju/Mundur/Laporkan kanan-bawah. Keyboard: ArrowUp/w→onForward, ArrowDown/s→onBackward, Esc→onBack. Semua tombol ≥44px.
       Files: `apps/web/src/ui/controls.ts`

- [ ] 48. Buat `apps/web/index.html` — HTML5 minimal: #map (fullscreen), #street-view-container (hidden, fullscreen absolute, z-index 1000), #card-container, #minimap-container. Import Leaflet CSS, PSV CSS, `<script type="module" src="/src/main.ts">`.
       Files: `apps/web/index.html`

- [ ] 49. Buat `apps/web/src/main.ts` — orchestrator: state machine mapMode ↔ viewerMode. Inisialisasi semua modul. `onPhotoSelect` → fetch photo → update card + positionMarker. `openStreetView` → fetch photo → show viewer + arrows + minimap. `navigateTo` → fetch photo → update viewer mempertahankan yaw. `onForward`/`onBackward` → cari neighbor dengan relativeAngle terkecil/terbesar.
       Files: `apps/web/src/main.ts`

- [ ] 50. Buat `apps/web/src/style.css` — CSS global: body/html margin:0 overflow:hidden, #map 100vw/100vh, #street-view-container position:fixed inset:0, dark mode card (#1e1e1e bg), mobile responsive card.
       Files: `apps/web/src/style.css` (import di main.ts)
       Verify: `cd apps/web && npm run build` — exit 0, no TS errors.

---

## FEAT-004 — Seed Data, E2E Tests, Docker Integration

**Ketergantungan:** semua FEAT sebelumnya selesai

- [ ] 51. Extend `db/seed/seed.ts` — tambah 1 sequence + 10 foto sintetis di sepanjang garis lat=4.629, lon=96.835..96.843 (jarak 8m, heading ~90°, status=published). Insert photo_links consecutive. Insert IGNORE.
       Files: `db/seed/seed.ts`

- [ ] 52. Buat `e2e/playwright.config.ts` di root — baseURL http://localhost:5173, browser chromium, 1 worker, screenshot on failure.
       Files: `e2e/playwright.config.ts` (root level)
       Root `package.json`: add `"test:e2e": "playwright test"`, add `@playwright/test@^1.40` devDependencies.

- [ ] 53. Buat `e2e/main.spec.ts` — 5 test: (1) map loads di Takengon, (2) click coverage line → card updates, (3) card click → viewer opens, (4) arrow click → navigates, (5) Esc → returns to map.
       Files: `e2e/main.spec.ts`
       Verify: `npx playwright test` (dengan dev servers running) — semua pass.

- [ ] 54. Verify docker-compose.yml & nginx.conf sudah benar: migration mount order (001 sebelum 002), api depends_on db:healthy, nginx proxy `/api/` dan `/media/`.
       Files: `docker-compose.yml`, `nginx.conf` (review saja)
       Verify: `docker compose up --build` → `curl http://localhost/api/coverage?bbox=96.8,4.6,96.9,4.7` returns `{"type":"FeatureCollection","features":[...]}`.

---

## Catatan Penting untuk Implementasi

### SRID 4326 Axis Order (WAJIB)
Setiap kali menulis koordinat ke MySQL atau membaca kembali, gunakan:
```sql
-- Tulis (lon, lat):
ST_GeomFromText('POINT(96.835 4.629)', 4326, 'axis-order=long-lat')

-- Baca kembali sebagai lon, lat:
ST_X(location) AS lon,  -- ST_X = longitude dalam SRID 4326
ST_Y(location) AS lat   -- ST_Y = latitude
```

### API Contract Utama
```
GET /api/photos/:id response:
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
    { "id": 124, "bearingDeg": 88.0, "distanceM": 9.8 }
  ]
}
```

### Arrow Display Algorithm
```typescript
function normalizeAngle(a: number): number {
  return ((a % 360) + 540) % 360 - 180; // → range -180..180
}
// Tampilkan arrow jika Math.abs(relativeAngle) < 70
const relativeAngle = normalizeAngle(neighbor.bearingDeg - viewerYaw);
```

### Bearing Calculation (Haversine)
```typescript
function bearingBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
```

### Error Response Shape
```json
{ "error": { "code": "NOT_FOUND", "message": "Foto tidak ditemukan" } }
```

### Warna & Style
- Garis cakupan: `#2A7BE4`, weight 5
- Marker posisi: `#F08A1C`
- Panah navigasi: putih (#FFFFFF) dengan outline gelap
- Card: border-radius 12px, box-shadow, bg putih (#FFFFFF) / dark (#1e1e1e)
