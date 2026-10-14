#!/usr/bin/env tsx
/**
 * Seed script: creates admin user, sequences, photos, photo_links, and places.
 * Run with: npx tsx db/seed/seed.ts
 */
import 'dotenv/config';
import * as argon2 from 'argon2';
import { pool } from '../../apps/api/src/db/pool.js';
import { bearing } from '../../apps/api/src/services/heading.js';
import { haversineDistance } from '../../apps/api/src/services/heading.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

async function seed(): Promise<void> {
  console.log('🌱 Memulai seed database...');

  // 1. Create admin user
  const passwordHash = await argon2.hash('admin123');
  await pool.query<ResultSetHeader>(
    `INSERT IGNORE INTO users (id, name, email, password_hash, role)
     VALUES (1, 'Admin', 'admin@streetview.takengon', ?, 'admin')`,
    [passwordHash]
  );
  console.log('✅ Admin user: admin@streetview.takengon / admin123');

  // 2. Sequence 1: Jalan Lebe Kader (40 foto, heading ~89°, spacing 0.00022° lon)
  const [seq1Result] = await pool.query<ResultSetHeader>(
    `INSERT IGNORE INTO sequences (id, user_id, title, camera, status)
     VALUES (1, 1, 'Jalan Lebe Kader', 'Insta360 X3', 'published')`
  );
  console.log('✅ Sequence 1: Jalan Lebe Kader');

  // 3. Sequence 2: Jalan Menteri Maadin (30 foto, heading ~240°)
  await pool.query<ResultSetHeader>(
    `INSERT IGNORE INTO sequences (id, user_id, title, camera, status)
     VALUES (2, 1, 'Jalan Menteri Maadin', 'Insta360 X3', 'published')`
  );
  console.log('✅ Sequence 2: Jalan Menteri Maadin');

  // Helper: insert photo
  async function insertPhoto(
    id: number,
    seqId: number,
    idx: number,
    lat: number,
    lon: number,
    headingDeg: number
  ): Promise<void> {
    await pool.query<ResultSetHeader>(
      `INSERT IGNORE INTO photos
         (id, sequence_id, seq_index, location, heading_deg, north_offset_deg, projection,
          file_path, thumb_path, status)
       VALUES
         (?, ?, ?,
          ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326),
          ?, 0, 'equirectangular',
          ?, ?, 'published')`,
      [
        id, seqId, idx, lon, lat, headingDeg,
        `/placeholder/photo_${id}.jpg`,
        `/placeholder/thumb_${id}.jpg`,
      ]
    );
  }

  // Helper: insert photo_link
  async function insertLink(
    fromId: number, toId: number,
    fromLat: number, fromLon: number,
    toLat: number, toLon: number
  ): Promise<void> {
    const bear = bearing(fromLat, fromLon, toLat, toLon);
    const dist = haversineDistance(fromLat, fromLon, toLat, toLon);
    await pool.query<ResultSetHeader>(
      `INSERT IGNORE INTO photo_links (from_photo_id, to_photo_id, bearing_deg, distance_m)
       VALUES (?, ?, ?, ?)`,
      [fromId, toId, bear, dist]
    );
  }

  // Sequence 1 photos: start at (4.629, 96.835), heading ~89° (east), spacing 0.00022° lon
  const seq1Photos: Array<{ id: number; lat: number; lon: number }> = [];
  for (let i = 0; i < 40; i++) {
    const id = 100 + i;
    const lat = 4.629;
    const lon = 96.835 + i * 0.00022;
    seq1Photos.push({ id, lat, lon });
    await insertPhoto(id, 1, i, lat, lon, 89);
  }

  // Sequential links for sequence 1
  for (let i = 0; i < seq1Photos.length - 1; i++) {
    const a = seq1Photos[i];
    const b = seq1Photos[i + 1];
    await insertLink(a.id, b.id, a.lat, a.lon, b.lat, b.lon);
    await insertLink(b.id, a.id, b.lat, b.lon, a.lat, a.lon);
  }
  console.log(`✅ Sequence 1: ${seq1Photos.length} foto + tautan`);

  // Sequence 2 photos: start at (4.622, 96.862), heading ~240° (southwest)
  const seq2Photos: Array<{ id: number; lat: number; lon: number }> = [];
  for (let i = 0; i < 30; i++) {
    const id = 200 + i;
    // heading 240° = southwest: lon decreases, lat decreases
    const lat = 4.622 - i * 0.00013;
    const lon = 96.862 - i * 0.00016;
    seq2Photos.push({ id, lat, lon });
    await insertPhoto(id, 2, i, lat, lon, 240);
  }

  // Sequential links for sequence 2
  for (let i = 0; i < seq2Photos.length - 1; i++) {
    const a = seq2Photos[i];
    const b = seq2Photos[i + 1];
    await insertLink(a.id, b.id, a.lat, a.lon, b.lat, b.lon);
    await insertLink(b.id, a.id, b.lat, b.lon, a.lat, a.lon);
  }
  console.log(`✅ Sequence 2: ${seq2Photos.length} foto + tautan`);

  // 4. Places seed
  const places = [
    { name: 'Kebayakan', category: 'kota', lat: 4.622, lon: 96.862 },
    { name: 'Pusat Kota Takengon', category: 'kota', lat: 4.629, lon: 96.835 },
    { name: 'Bebesen', category: 'kota', lat: 4.605, lon: 96.815 },
    { name: 'Pegasing', category: 'kecamatan', lat: 4.548, lon: 96.825 },
  ];

  for (const p of places) {
    await pool.query<ResultSetHeader>(
      `INSERT IGNORE INTO places (name, category, location)
       VALUES (?, ?,
               ST_GeomFromText(CONCAT('POINT(',?,' ',?,')'), 4326))`,
      [p.name, p.category, p.lon, p.lat]
    );
  }
  console.log(`✅ ${places.length} tempat disisipkan`);

  console.log('\n🎉 Seed selesai!');
  console.log('   Login: admin@streetview.takengon / admin123');
}

seed()
  .catch((err) => {
    console.error('❌ Seed gagal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
