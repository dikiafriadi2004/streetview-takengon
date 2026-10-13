import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

// This test verifies that axis-order=long-lat correctly maps:
// POINT(96.835 4.629) → ST_X = 96.835 (longitude), ST_Y = 4.629 (latitude)

describe('MySQL axis-order=long-lat', () => {
  let conn: mysql.Connection | null = null;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.warn('DATABASE_URL not set — skipping axis-order integration test');
      return;
    }
    try {
      conn = await mysql.createConnection(url);
    } catch {
      console.warn('Could not connect to database — skipping axis-order integration test');
    }
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  it('POINT(96.835 4.629) with axis-order=long-lat → ST_X=96.835, ST_Y=4.629', async () => {
    if (!conn) {
      console.warn('Skipping: no DB connection');
      return;
    }
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT
         ST_X(ST_GeomFromText('POINT(96.835 4.629)', 4326, 'axis-order=long-lat')) AS x,
         ST_Y(ST_GeomFromText('POINT(96.835 4.629)', 4326, 'axis-order=long-lat')) AS y`
    );
    const { x, y } = rows[0];
    // With axis-order=long-lat: first arg = longitude → ST_X, second = latitude → ST_Y
    expect(Number(x)).toBeCloseTo(96.835, 3);
    expect(Number(y)).toBeCloseTo(4.629, 3);
  });
});
