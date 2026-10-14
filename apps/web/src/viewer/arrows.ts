import type { PhotoNeighbor } from '../api/client.js';

/**
 * Arrows terlihat jika dalam cone ±120° dari arah pandang.
 * Ini memastikan panah maju (depan) DAN mundur (belakang) tampil
 * selama masih dalam setengah layar kiri/kanan.
 */
const ARROW_VISIBLE_ANGLE = 120;

export function relativeAngle(bearing: number, heading: number): number {
  let a = bearing - heading;
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

type NavigateHandler = (photoId: number) => void;

export class NavigationArrows {
  private container: HTMLElement;
  private arrows: HTMLElement[] = [];
  private onNavigate: NavigateHandler;

  constructor(container: HTMLElement, onNavigate: NavigateHandler) {
    this.container = container;
    this.onNavigate = onNavigate;
  }

  updateArrows(neighbors: PhotoNeighbor[], currentHeading: number): void {
    for (const arrow of this.arrows) arrow.remove();
    this.arrows = [];

    for (const neighbor of neighbors) {
      const rel = relativeAngle(neighbor.bearingDeg, currentHeading);
      if (Math.abs(rel) >= ARROW_VISIBLE_ANGLE) continue;

      const arrow = this.createArrow(neighbor, rel);
      this.container.appendChild(arrow);
      this.arrows.push(arrow);

      // Animate in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          arrow.style.opacity = '1';
          arrow.style.transform = this.buildTransform(rel, 1);
        });
      });
    }
  }

  /**
   * Perspektif: flatten lingkaran agar terasa "di lantai/jalan".
   * rotateX(38deg) = efek pandang dari atas ke bawah.
   */
  private buildTransform(relAngle: number, scale: number): string {
    return `translate(-50%, -50%) perspective(500px) rotateX(38deg) scale(${scale})`;
  }

  private createArrow(neighbor: PhotoNeighbor, relAngle: number): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'nav-arrow-ground';
    btn.setAttribute(
      'aria-label',
      `Navigasi ke foto ${neighbor.id}, jarak ${Math.round(neighbor.distanceM)}m`,
    );

    /**
     * Posisi horizontal: di-spread dari center berdasarkan relAngle.
     * relAngle = 0    → tepat di tengah (50%)
     * relAngle = ±120 → tepi kiri/kanan (20%/80%)
     *
     * Posisi vertikal:
     * - Panah depan (|rel| < 40°)  → lebih rendah (72%) = terasa di jalan
     * - Panah samping/belakang      → agak lebih tinggi (64%)
     */
    const xPercent = 50 + (relAngle / ARROW_VISIBLE_ANGLE) * 30;
    const isFront = Math.abs(relAngle) < 40;
    const yPercent = isFront ? 72 : 64;

    btn.style.cssText = `
      position: absolute;
      left: ${xPercent}%;
      top: ${yPercent}%;
      opacity: 0;
      transform: ${this.buildTransform(relAngle, 0.6)};
      transition: opacity 0.3s ease, transform 0.3s ease;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      z-index: 1020;
    `;

    const distLabel = neighbor.distanceM < 1000
      ? `${Math.round(neighbor.distanceM)}m`
      : `${(neighbor.distanceM / 1000).toFixed(1)}km`;

    // Lingkaran SVG + chevron, diputar sesuai relAngle
    // Panah belakang (|rel| > 100°) diberi opacity lebih rendah
    const opacity = Math.abs(relAngle) > 100 ? 0.65 : 0.92;

    btn.innerHTML = `
      <div class="gsv-arrow-circle" style="opacity:${opacity}">
        <svg viewBox="0 0 100 100" width="88" height="88" style="display:block;transform:rotate(${relAngle}deg)">
          <defs>
            <filter id="arrowShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
          </defs>
          <!-- Lingkaran translucent -->
          <circle cx="50" cy="50" r="46"
            fill="rgba(0,0,0,0.25)"
            stroke="rgba(255,255,255,0.7)"
            stroke-width="3"
            filter="url(#arrowShadow)"/>
          <!-- Chevron / panah (pointing up = 0° = forward) -->
          <polygon
            points="50,16 68,58 50,47 32,58"
            fill="white"/>
        </svg>
        <div style="
          position:absolute; bottom:-20px; left:50%; transform:translateX(-50%);
          color:white; font-size:11px; font-weight:600; white-space:nowrap;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        ">${distLabel}</div>
      </div>
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = this.buildTransform(relAngle, 1.15);
      const circle = btn.querySelector('.gsv-arrow-circle') as HTMLElement;
      if (circle) circle.style.filter = 'drop-shadow(0 0 10px rgba(255,255,255,0.7))';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = this.buildTransform(relAngle, 1);
      const circle = btn.querySelector('.gsv-arrow-circle') as HTMLElement;
      if (circle) circle.style.filter = '';
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = this.buildTransform(relAngle, 0.88);
      setTimeout(() => this.onNavigate(neighbor.id), 100);
    });

    return btn;
  }

  clear(): void {
    for (const arrow of this.arrows) arrow.remove();
    this.arrows = [];
  }
}
