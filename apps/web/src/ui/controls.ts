import { i18n } from '../i18n/id.js';

type ControlAction = 'forward' | 'backward' | 'turnLeft' | 'turnRight' | 'back';
type ActionHandler = (action: ControlAction) => void;

/**
 * ViewerControls:
 * - Tombol "← Kembali ke peta" di kiri atas
 * - Tombol zoom (+/−) di kanan bawah
 * - Keyboard: panah atas/bawah = maju/mundur, kiri/kanan = putar, Esc = kembali
 *
 * Tombol navigasi ↑←→↓ dihapus — digantikan panah di lantai (NavigationArrows).
 */
export class ViewerControls {
  private container: HTMLElement;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private backBtn: HTMLElement | null = null;
  private zoomEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(onAction: ActionHandler): void {
    // ── Tombol kembali ke peta (kiri atas) ──
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      ${i18n.backToMap}
    `;
    backBtn.setAttribute('aria-label', i18n.ariaCloseViewer);
    backBtn.addEventListener('click', () => onAction('back'));
    this.container.appendChild(backBtn);
    this.backBtn = backBtn;

    // ── Tombol zoom +/− (kanan bawah, seperti Google Maps) ──
    const zoom = document.createElement('div');
    zoom.className = 'zoom-controls';
    zoom.setAttribute('aria-label', 'Zoom');
    zoom.innerHTML = `
      <button class="zoom-btn" data-zoom="in"  aria-label="Perbesar" title="Perbesar">+</button>
      <button class="zoom-btn" data-zoom="out" aria-label="Perkecil" title="Perkecil">−</button>
    `;
    this.container.appendChild(zoom);
    this.zoomEl = zoom;

    // ── Keyboard handler ──
    this.keyHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); onAction('forward');   break;
        case 'ArrowDown':  e.preventDefault(); onAction('backward');  break;
        case 'ArrowLeft':  e.preventDefault(); onAction('turnLeft');  break;
        case 'ArrowRight': e.preventDefault(); onAction('turnRight'); break;
        case 'Escape':     e.preventDefault(); onAction('back');      break;
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  destroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.backBtn?.remove();  this.backBtn = null;
    this.zoomEl?.remove();   this.zoomEl = null;
  }
}
