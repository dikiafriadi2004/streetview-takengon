-- Migration 001: Core tables (users, sequences, photos, photo_links)
-- MySQL 8.0, charset utf8mb4, SRID 4326

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','contributor') NOT NULL DEFAULT 'contributor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sequences (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  camera VARCHAR(100),
  recorded_at DATETIME,
  status ENUM('draft','published','hidden') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sequence_id INT UNSIGNED NOT NULL,
  seq_index INT UNSIGNED NOT NULL,
  location POINT NOT NULL SRID 4326,
  heading_deg DECIMAL(5,2) NOT NULL,
  altitude_m DECIMAL(7,2),
  captured_at DATETIME,
  projection ENUM('equirectangular','flat') NOT NULL DEFAULT 'equirectangular',
  north_offset_deg DECIMAL(5,2) NOT NULL DEFAULT 0,
  file_path VARCHAR(255) NOT NULL,
  thumb_path VARCHAR(255) NOT NULL,
  width INT UNSIGNED,
  height INT UNSIGNED,
  status ENUM('draft','published','hidden') NOT NULL DEFAULT 'draft',
  SPATIAL INDEX idx_location (location),
  UNIQUE KEY uq_seq (sequence_id, seq_index),
  FOREIGN KEY (sequence_id) REFERENCES sequences(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photo_links (
  from_photo_id BIGINT UNSIGNED NOT NULL,
  to_photo_id BIGINT UNSIGNED NOT NULL,
  bearing_deg DECIMAL(5,2) NOT NULL,
  distance_m DECIMAL(7,2) NOT NULL,
  PRIMARY KEY (from_photo_id, to_photo_id),
  FOREIGN KEY (from_photo_id) REFERENCES photos(id),
  FOREIGN KEY (to_photo_id) REFERENCES photos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
