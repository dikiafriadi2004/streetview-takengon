import { i18n } from '../i18n/id.js';

type ControlAction = 'forward' | 'backward' | 'turnLeft' | 'turnRight' | 'back';

type ActionHandler = (action: ControlAction) => void;

export class ViewerControls {
  private container: HTMLElement;
  private handler: ActionHandler | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private controlsEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(onAction: ActionHandler): void {
    this.handler = onAction;

    // Back button (top left)
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.textContent = `← ${i18n.backToMap}`;
    backBtn.setAttribute('aria-label', i18n.ariaCloseViewer);
    backBtn.addEventListener('click', () => onAction('back'));
    this.container.appendChild(backBtn);

    // Control buttons (bottom right)
    const controls = document.createElement('div');
    controls.className = 'viewer-controls';
    controls.innerHTML = `
      <button class="ctrl-btn" data-action="forward" aria-label="${i18n.forward}" title="${i18n.forward}">↑</button>
      <button class="ctrl-btn" data-action="turnLeft" aria-label="${i18n.turnLeft}" title="${i18n.turnLeft}">←</button>
      <button class="ctrl-btn" data-action="turnRight" aria-label="${i18n.turnRight}" title="${i18n.turnRight}">→</button>
      <button class="ctrl-btn" data-action="backward" aria-label="${i18n.backward}" title="${i18n.backward}">↓</button>
    `;

    controls.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (btn?.dataset.action) {
        onAction(btn.dataset.action as ControlAction);
      }
    });

    this.container.appendChild(controls);
    this.controlsEl = controls;

    // Keyboard handler
    this.keyHandler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp': e.preventDefault(); onAction('forward'); break;
        case 'ArrowDown': e.preventDefault(); onAction('backward'); break;
        case 'ArrowLeft': e.preventDefault(); onAction('turnLeft'); break;
        case 'ArrowRight': e.preventDefault(); onAction('turnRight'); break;
        case 'Escape': e.preventDefault(); onAction('back'); break;
      }
    };
    document.addEventListener('keydown', this.keyHandler);
  }

  destroy(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
