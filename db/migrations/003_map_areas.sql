-- Migration 003: map_areas for configurable map settings

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS map_areas (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default map area: Kabupaten Aceh Tengah
INSERT INTO map_areas (name, center_lat, center_lon, zoom, min_lat, min_lon, max_lat, max_lon, is_active)
VALUES ('Kabupaten Aceh Tengah (bawaan)', 4.62, 96.84, 12, 4.2, 96.5, 4.9, 97.3, 1);
