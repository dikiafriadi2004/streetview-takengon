import type { PhotoNeighbor } from '../api/client.js';

const ARROW_VISIBLE_ANGLE = 70; // degrees

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
    // Remove old arrows
    for (const arrow of this.arrows) {
      arrow.remove();
    }
    this.arrows = [];

    for (const neighbor of neighbors) {
      const rel = relativeAngle(neighbor.bearingDeg, currentHeading);

      // Only show if within ±70°
      if (Math.abs(rel) >= ARROW_VISIBLE_ANGLE) continue;

      const arrow = this.createArrow(neighbor, rel);
      this.container.appendChild(arrow);
      this.arrows.push(arrow);
    }
  }

  private createArrow(neighbor: PhotoNeighbor, relAngle: number): HTMLElement {
    const arrow = document.createElement('button');
    arrow.className = 'nav-arrow';
    arrow.setAttribute('aria-label', `Navigasi ke foto ${neighbor.id}`);
    arrow.setAttribute('title', `${neighbor.distanceM.toFixed(0)}m`);

    // Position arrow in the viewer based on relative angle
    // Map -70° to +70° → left 15% to right 85%
    const xPercent = 50 + (relAngle / ARROW_VISIBLE_ANGLE) * 35;
    // Slightly above center vertically
    const yPercent = 55;

    arrow.style.left = `${xPercent}%`;
    arrow.style.top = `${yPercent}%`;

    // Arrow icon (pointing up = forward, rotated by relative angle)
    arrow.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
           style="transform: rotate(${relAngle}deg)">
        <path d="M12 4L6 14H12V20H12V14H18L12 4Z" fill="#1a1a1a"/>
      </svg>
      <span class="arrow-dist">${neighbor.distanceM.toFixed(0)}m</span>
    `;

    arrow.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onNavigate(neighbor.id);
    });

    return arrow;
  }

  clear(): void {
    for (const arrow of this.arrows) {
      arrow.remove();
    }
    this.arrows = [];
  }
}
