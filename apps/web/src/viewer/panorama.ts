import { Viewer } from '@photo-sphere-viewer/core';
import type { PhotoDetail } from '../api/client.js';

type HeadingChangeCallback = (heading: number) => void;

export class PanoramaViewer {
  private viewer: Viewer | null = null;
  private container: HTMLElement;
  private overlay: HTMLElement;
  private headingCallbacks: HeadingChangeCallback[] = [];
  private currentHeading: number = 0;
  private autoRotateTimer: ReturnType<typeof setInterval> | null = null;
  private isTransitioning = false;

  constructor(container: HTMLElement) {
    this.container = container;

    // Black overlay for smooth open / transition
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position:absolute; inset:0; z-index:10; background:black;
      opacity:1; pointer-events:none;
      transition: opacity 0.5s cubic-bezier(0.4,0,0.2,1);
    `;
    this.container.appendChild(this.overlay);
  }

  // ── fade helpers ──────────────────────────────────────────────────────────
  private async fadeOut(ms = 300): Promise<void> {
    return new Promise(resolve => {
      this.overlay.style.pointerEvents = 'all';
      this.overlay.style.transition = `opacity ${ms}ms ease`;
      this.overlay.style.opacity = '1';
      setTimeout(resolve, ms + 30);
    });
  }

  private fadeIn(ms = 500): void {
    this.overlay.style.transition = `opacity ${ms}ms cubic-bezier(0.4,0,0.2,1)`;
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '0';
      setTimeout(() => { this.overlay.style.pointerEvents = 'none'; }, ms);
    });
  }

  // ── auto-rotate ──────────────────────────────────────────────────────────
  private startAutoRotate(): void {
    this.stopAutoRotate();
    this.autoRotateTimer = setInterval(() => {
      if (!this.viewer || this.isTransitioning) return;
      const pos = this.viewer.getPosition();
      this.viewer.rotate({ yaw: pos.yaw + 0.003, pitch: pos.pitch });
    }, 16);
  }

  stopAutoRotate(): void {
    if (this.autoRotateTimer) {
      clearInterval(this.autoRotateTimer);
      this.autoRotateTimer = null;
    }
  }

  // ── First load ────────────────────────────────────────────────────────────
  async load(photo: PhotoDetail): Promise<void> {
    this.currentHeading = photo.headingDeg;

    if (!this.viewer) {
      this.overlay.style.opacity = '1';

      this.viewer = new Viewer({
        container:        this.container,
        panorama:         photo.thumbUrl,
        panoData:         photo.panoData ?? undefined,
        defaultYaw:       this.headingToYaw(photo),
        defaultPitch:     0,
        defaultZoomLvl:   50,
        minFov:           30,
        maxFov:           120,
        moveSpeed:        1.2,
        zoomSpeed:        2,
        touchmoveTwoFingers: false,
        navbar:           false,
        loadingImg:       undefined,
      });

      this.viewer.addEventListener('before-rotate', () => this.stopAutoRotate());

      this.viewer.addEventListener('position-updated', (e) => {
        const deg = ((e.position.yaw * 180) / Math.PI % 360 + 360) % 360;
        this.currentHeading = deg;
        this.headingCallbacks.forEach(cb => cb(deg));
      });
    }

    // Fade in, then upgrade to full-res
    this.fadeIn(600);
    this.upgradeFullRes(photo, 300);

    // Short auto-rotate on open
    setTimeout(() => this.startAutoRotate(), 900);
    setTimeout(() => this.stopAutoRotate(), 5000);
  }

  // ── Navigate to next photo (smooth crossfade) ─────────────────────────────
  async transitionTo(photo: PhotoDetail, compassHeading: number): Promise<void> {
    if (this.isTransitioning || !this.viewer) return;
    this.isTransitioning = true;
    this.stopAutoRotate();
    this.currentHeading = compassHeading;

    const yawTarget = this.headingToYaw(photo);

    // Step 1 — Smoothly rotate + zoom toward destination (300 ms)
    await new Promise<void>(resolve => {
      if (!this.viewer) return resolve();
      const anim = this.viewer.animate({
        yaw:   yawTarget,
        pitch: -0.06,     // slight downward tilt = "stepping forward"
        zoom:  62,
        speed: '8rpm',
      });
      anim.then(() => resolve());
      setTimeout(resolve, 320);  // fallback
    });

    // Step 2 — PSV crossfade to new panorama (smooth, no black flash)
    await this.viewer.setPanorama(photo.thumbUrl, {
      panoData:   photo.panoData ?? undefined,
      position:   { yaw: yawTarget, pitch: 0 },
      transition: { speed: 800, effect: 'fade', rotation: false },
      showLoader: false,
    });

    // Step 3 — Reset zoom smoothly
    this.viewer.animate({ zoom: 50, speed: '4rpm' });

    this.currentHeading = photo.headingDeg;
    this.isTransitioning = false;

    // Upgrade to full res in background
    this.upgradeFullRes(photo, 400);

    // Brief auto-rotate then stop
    setTimeout(() => this.startAutoRotate(), 600);
    setTimeout(() => this.stopAutoRotate(), 4600);
  }

  // ── Lazy upgrade to full resolution ──────────────────────────────────────
  private upgradeFullRes(photo: PhotoDetail, delayMs: number): void {
    setTimeout(async () => {
      if (!this.viewer) return;
      try {
        await this.viewer.setPanorama(photo.url, {
          panoData:   photo.panoData ?? undefined,
          position:   { yaw: this.viewer.getPosition().yaw, pitch: this.viewer.getPosition().pitch },
          transition: false,
          showLoader: false,
        });
      } catch { /* viewer destroyed */ }
    }, delayMs);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private headingToYaw(photo: PhotoDetail): number {
    return (((photo.headingDeg % 360) + photo.northOffsetDeg) * Math.PI) / 180;
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
    this.stopAutoRotate();
    if (!this.viewer) return;
    const pos = this.viewer.getPosition();
    this.viewer.animate({
      yaw:   pos.yaw + (deltaYawDeg * Math.PI) / 180,
      pitch: pos.pitch,
      speed: '6rpm',
    });
  }

  zoomIn(): void {
    if (!this.viewer) return;
    this.viewer.zoom(Math.min(this.viewer.getZoomLevel() + 10, 100));
  }

  zoomOut(): void {
    if (!this.viewer) return;
    this.viewer.zoom(Math.max(this.viewer.getZoomLevel() - 10, 0));
  }

  destroy(): void {
    this.stopAutoRotate();
    if (this.viewer) { this.viewer.destroy(); this.viewer = null; }
    this.overlay.remove();
    this.headingCallbacks = [];
  }
}
