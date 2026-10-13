import { pool } from './pool.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface Report extends RowDataPacket {
  id: number;
  photo_id: number;
  type: 'privacy' | 'wrong_location' | 'other';
  note: string | null;
  status: 'open' | 'resolved';
  created_at: string;
}

export async function createReport(data: {
  photoId: number;
  type: 'privacy' | 'wrong_location' | 'other';
  note?: string;
}): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO reports (photo_id, type, note) VALUES (?, ?, ?)`,
    [data.photoId, data.type, data.note ?? null]
  );
  return result.insertId;
}

export async function listReports(status?: string): Promise<Report[]> {
  if (status) {
    const [rows] = await pool.query<Report[]>(
      `SELECT id, photo_id, type, note, status, created_at
       FROM reports WHERE status = ? ORDER BY created_at DESC`,
      [status]
    );
    return rows;
  }
  const [rows] = await pool.query<Report[]>(
    `SELECT id, photo_id, type, note, status, created_at
     FROM reports ORDER BY created_at DESC`
  );
  return rows;
}

export async function resolveReport(id: number): Promise<void> {
  await pool.query<ResultSetHeader>(
    `UPDATE reports SET status = 'resolved' WHERE id = ?`,
    [id]
  );
}
