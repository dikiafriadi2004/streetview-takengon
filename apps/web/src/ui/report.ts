import { i18n } from '../i18n/id.js';
import { postReport } from '../api/client.js';

export class ReportModal {
  private overlay: HTMLElement | null = null;
  private currentPhotoId: number | null = null;

  show(photoId: number): void {
    this.currentPhotoId = photoId;
    this.render();
  }

  private render(): void {
    // Remove existing modal
    this.overlay?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', i18n.reportTitle);

    overlay.innerHTML = `
      <div class="modal-content">
        <h2 class="modal-title">${i18n.reportTitle}</h2>

        <div class="form-group">
          <label for="report-type">${i18n.reportType}</label>
          <select id="report-type" class="form-select">
            <option value="privacy">${i18n.reportTypePrivacy}</option>
            <option value="wrong_location">${i18n.reportTypeWrongLocation}</option>
            <option value="other">${i18n.reportTypeOther}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="report-note">${i18n.reportNote}</label>
          <textarea id="report-note" class="form-textarea" rows="3" maxlength="500"
                    placeholder="Deskripsikan masalah..."></textarea>
        </div>

        <div id="report-status" class="report-status" aria-live="polite"></div>

        <div class="modal-actions">
          <button id="report-cancel" class="btn-secondary">${i18n.reportCancel}</button>
          <button id="report-submit" class="btn-primary">${i18n.reportSubmit}</button>
        </div>
      </div>
    `;

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    overlay.querySelector('#report-cancel')?.addEventListener('click', () => this.close());

    overlay.querySelector('#report-submit')?.addEventListener('click', async () => {
      await this.submit(overlay);
    });

    // Trap focus
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });

    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Focus the select
    setTimeout(() => {
      (overlay.querySelector('#report-type') as HTMLElement)?.focus();
    }, 50);
  }

  private async submit(overlay: HTMLElement): Promise<void> {
    if (this.currentPhotoId === null) return;

    const typeEl = overlay.querySelector('#report-type') as HTMLSelectElement;
    const noteEl = overlay.querySelector('#report-note') as HTMLTextAreaElement;
    const statusEl = overlay.querySelector('#report-status') as HTMLElement;
    const submitBtn = overlay.querySelector('#report-submit') as HTMLButtonElement;

    const type = typeEl.value as 'privacy' | 'wrong_location' | 'other';
    const note = noteEl.value.trim();

    submitBtn.disabled = true;
    statusEl.textContent = 'Mengirim...';
    statusEl.className = 'report-status';

    try {
      await postReport(this.currentPhotoId, type, note || undefined);
      statusEl.textContent = i18n.reportSuccess;
      statusEl.className = 'report-status report-success';
      setTimeout(() => this.close(), 1500);
    } catch {
      statusEl.textContent = i18n.reportError;
      statusEl.className = 'report-status report-error';
      submitBtn.disabled = false;
    }
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
}
