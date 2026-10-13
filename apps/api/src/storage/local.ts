import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver } from './driver.js';

export class LocalStorageDriver implements StorageDriver {
  private readonly storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  async save(key: string, buffer: Buffer): Promise<string> {
    // Prevent path traversal
    const safeName = key.replace(/\.\./g, '_').replace(/^\//, '');
    const filePath = path.join(this.storageDir, safeName);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return this.getUrl(safeName);
  }

  getUrl(key: string): string {
    const safeName = key.replace(/\.\./g, '_').replace(/^\//, '');
    return `/media/${safeName}`;
  }

  async delete(key: string): Promise<void> {
    const safeName = key.replace(/\.\./g, '_').replace(/^\//, '');
    const filePath = path.join(this.storageDir, safeName);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore file-not-found errors
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
