import { Viewer } from '@photo-sphere-viewer/core';
import type { PhotoDetail } from '../api/client.js';

type HeadingChangeCallback = (heading: number) => void;

export class PanoramaViewer {
  private viewer: Viewer | null = null;
  private container: HTMLElement;
  private flatImg: HTMLImageElement | null = null;
  private headingCallbacks: HeadingChangeCallback[] = [];
  private currentHeading: number = 0;
  private currentProjection: 'equirectangular' | 'flat' = 'equirectangular';
  private flatPanX: number = 0;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartPanX: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async load(photo: PhotoDetail): Promise<void> {
    this.currentProjection = photo.projection;

    if (photo.projection === 'flat') {
      await this.loadFlat(photo);
    } else {
      await this.loadPanorama(photo);
    }
  }

  private async loadPanorama(photo: PhotoDetail): Promise<void> {
    // Clean up flat view if any
    if (this.flatImg) {
      this.flatImg.remove();
      this.flatImg = null;
    }

    const initialYaw = ((photo.headingDeg + photo.northOffsetDeg) * Math.PI) / 180;

    if (!this.viewer) {
      this.viewer = new Viewer({
        container: this.container,
        panorama: photo.thumbUrl, // Load thumbnail first
        defaultYaw: initialYaw,
        defaultPitch: 0,
        defaultZoomLvl: 50,
        minFov: 50,
        maxFov: 120,
        moveSpeed: 1.0,
        touchmoveTwoFingers: false,
        navbar: false,
        loadingImg: undefined,
      });

      this.viewer.addEventListener('position-updated', (e) => {
        // Convert PSV yaw (radians) to compass bearing (0–360°)
        const yawDeg = (e.position.yaw * 180) / Math.PI;
        const compassBearing = ((yawDeg + 360) % 360);
        this.currentHeading = compassBearing;
        this.headingCallbacks.forEach((cb) => cb(compassBearing));
      });
    } else {
      // Update yaw to maintain compass heading
      await this.viewer.setPanorama(photo.thumbUrl, {
        position: { yaw: initialYaw, pitch: 0 },
        transition: false,
      });
    }

    this.currentHeading = photo.headingDeg;

    // Load full resolution in background
    setTimeout(async () => {
      if (this.viewer && this.currentProjection === 'equirectangular') {
        try {
          await this.viewer.setPanorama(photo.url, {
            position: { yaw: this.viewer.getPosition().yaw, pitch: this.viewer.getPosition().pitch },
            transition: false,
          });
        } catch {
          // Ignore if viewer was destroyed
        }
      }
    }, 100);
  }

  private async loadFlat(photo: PhotoDetail): Promise<void> {
    // Destroy PSV viewer if exists
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }

    if (!this.flatImg) {
      this.flatImg = document.createElement('img');
      this.flatImg.style.cssText = `
        width: 100%; height: 100%; object-fit: contain;
        position: absolute; top: 0; left: 0; cursor: grab; user-select: none;
      `;
      this.container.appendChild(this.flatImg);
      this.setupFlatDrag();
    }

    // Load thumbnail first
    this.flatImg.src = photo.thumbUrl;
    // Then full res
    const img = new Image();
    img.onload = () => {
      if (this.flatImg) this.flatImg.src = photo.url;
    };
    img.src = photo.url;
  }

  private setupFlatDrag(): void {
    if (!this.flatImg) return;

    this.flatImg.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartPanX = this.flatPanX;
      this.flatImg!.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.flatImg) return;
      const dx = e.clientX - this.dragStartX;
      this.flatPanX = this.dragStartPanX + dx;
      const heading = ((-this.flatPanX / this.container.clientWidth) * 180 + 360) % 360;
      this.currentHeading = heading;
      this.headingCallbacks.forEach((cb) => cb(heading));
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
      if (this.flatImg) this.flatImg.style.cursor = 'grab';
    });
  }

  async transitionTo(photo: PhotoDetail, compassHeading: number): Promise<void> {
    this.currentProjection = photo.projection;

    if (photo.projection === 'flat') {
      await this.loadFlat(photo);
      return;
    }

    if (!this.viewer) {
      await this.loadPanorama(photo);
      return;
    }

    // Maintain compass heading through transition
    const yaw = ((compassHeading + photo.northOffsetDeg) * Math.PI) / 180;
    await this.viewer.setPanorama(photo.thumbUrl, {
      position: { yaw, pitch: this.viewer.getPosition().pitch },
      transition: true,
    });

    // Full res
    setTimeout(async () => {
      if (this.viewer) {
        try {
          await this.viewer.setPanorama(photo.url, {
            position: { yaw: this.viewer.getPosition().yaw, pitch: this.viewer.getPosition().pitch },
            transition: false,
          });
        } catch { /* ignore */ }
      }
    }, 100);

    // Prefetch neighbor thumbnails
    if (photo.neighbors) {
      for (const n of photo.neighbors) {
        const img = new Image();
        img.src = `/api/photos/${n.id}`; // This will trigger caching on the api side
      }
    }
  }

  getHeading(): number {
    if (this.viewer) {
      const yaw = this.viewer.getPosition().yaw;
      return ((yaw * 180) / Math.PI + 360) % 360;
    }
    return this.currentHeading;
  }

  onHeadingChange(cb: HeadingChangeCallback): void {
    this.headingCallbacks.push(cb);
  }

  rotateBy(deltaYawDeg: number): void {
    if (this.viewer) {
      const pos = this.viewer.getPosition();
      const newYaw = pos.yaw + (deltaYawDeg * Math.PI) / 180;
      this.viewer.rotate({ yaw: newYaw, pitch: pos.pitch });
    }
  }

  destroy(): void {
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    if (this.flatImg) {
      this.flatImg.remove();
      this.flatImg = null;
    }
    this.headingCallbacks = [];
  }
}
