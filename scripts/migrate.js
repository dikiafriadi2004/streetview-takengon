#!/usr/bin/env node
/**
 * Simple migration runner — runs all SQL files in db/migrations in order.
 * Usage: node scripts/migrate.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../db/migrations');

if (!process.env.DATABASE_URL) {
  console.error('❌  DATABASE_URL tidak diset. Salin .env.example ke .env dan isi nilainya.');
  process.exit(1);
}

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, multipleStatements: true });

try {
  // Create migrations tracking table if it doesn't exist
  await conn.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [applied] = await conn.query('SELECT name FROM _migrations');
  const appliedNames = new Set(applied.map((r) => r.name));

  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`⏭  ${file} (sudah diterapkan)`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
    console.log(`▶  Menjalankan ${file}...`);
    await conn.query(sql);
    await conn.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
    console.log(`✅  ${file} selesai`);
    ran++;
  }

  if (ran === 0) {
    console.log('✨  Semua migrasi sudah diterapkan — tidak ada yang baru.');
  } else {
    console.log(`\n🎉  ${ran} migrasi berhasil diterapkan.`);
  }
} finally {
  await conn.end();
}
