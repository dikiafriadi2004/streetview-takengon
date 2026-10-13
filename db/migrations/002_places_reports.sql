-- Migration 002: places, reports, additional indexes

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS places (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50),
  location POINT NOT NULL SRID 4326,
  photo_id BIGINT UNSIGNED NULL,
  SPATIAL INDEX idx_place_loc (location),
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  photo_id BIGINT UNSIGNED NOT NULL,
  type ENUM('privacy','wrong_location','other') NOT NULL,
  note VARCHAR(500),
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (photo_id) REFERENCES photos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additional index for efficient status + sequence filtering
CREATE INDEX idx_photos_status_seq ON photos (status, sequence_id);
