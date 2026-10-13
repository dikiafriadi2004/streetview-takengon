export interface StorageDriver {
  /**
   * Save a file buffer with the given key.
   * Returns the public URL for the stored file.
   */
  save(key: string, buffer: Buffer): Promise<string>;

  /**
   * Get the public URL for a stored file key.
   */
  getUrl(key: string): string;

  /**
   * Delete a stored file by key.
   */
  delete(key: string): Promise<void>;
}
