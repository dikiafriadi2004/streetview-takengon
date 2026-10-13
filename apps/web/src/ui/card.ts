import type { PhotoDetail } from '../api/client.js';
import { i18n } from '../i18n/id.js';

type OpenCallback = () => void;

export class StreetViewCard {
  private element: HTMLElement;
  private onOpenCallback: OpenCallback | null = null;
  private currentPhoto: PhotoDetail | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'street-view-card';
    this.element.setAttribute('aria-label', i18n.ariaStreetViewCard);
    container.appendChild(this.element);

    this.renderEmpty();
  }

  private renderEmpty(): void {
    this.element.innerHTML = `
      <div class="sv-card-empty">
        <div class="sv-card-icon">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"
               aria-hidden="true">
            <circle cx="20" cy="16" r="10" fill="#F08A1C" opacity="0.2"/>
            <circle cx="20" cy="16" r="5" fill="#F08A1C"/>
            <path d="M20 26L14 36H26L20 26Z" fill="#F08A1C" opacity="0.6"/>
          </svg>
        </div>
        <p class="sv-card-hint">${i18n.clickHint}</p>
      </div>
    `;
  }

  setPhoto(photo: PhotoDetail): void {
    this.currentPhoto = photo;

    const near = photo.near ?? '';
    const coordText = `${photo.lat.toFixed(5)}, ${photo.lon.toFixed(5)}`;

    this.element.innerHTML = `
      <div class="sv-card-thumb-wrapper">
        <img
          src="${photo.thumbUrl}"
          alt="Pratinjau Street View${near ? ` di ${near}` : ''}"
          class="sv-card-thumb"
          loading="lazy"
        />
        <div class="sv-card-overlay-label">${i18n.streetViewLabel}</div>
      </div>
      <div class="sv-card-info">
        ${near ? `<div class="sv-card-place">${near}</div>` : ''}
        <div class="sv-card-coords">${coordText}</div>
        <button class="sv-card-btn" aria-label="${i18n.ariaOpenViewer}">
          ${i18n.openStreetView}
        </button>
      </div>
    `;

    const btn = this.element.querySelector('.sv-card-btn');
    btn?.addEventListener('click', () => {
      this.onOpenCallback?.();
    });

    // Also allow clicking the thumbnail
    const thumb = this.element.querySelector('.sv-card-thumb-wrapper');
    thumb?.addEventListener('click', () => {
      this.onOpenCallback?.();
    });
  }

  onOpen(cb: OpenCallback): void {
    this.onOpenCallback = cb;
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
