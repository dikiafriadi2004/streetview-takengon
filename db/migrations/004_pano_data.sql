-- Migration 004: Add pano_data column to photos for partial panorama support
-- pano_data stores JSON: { fullWidth, fullHeight, croppedWidth, croppedHeight, croppedX, croppedY }
-- NULL means full equirectangular (no crop info needed)

SET NAMES utf8mb4;

ALTER TABLE photos
  ADD COLUMN pano_data JSON NULL DEFAULT NULL COMMENT 'PSV panoData for partial panoramas';
