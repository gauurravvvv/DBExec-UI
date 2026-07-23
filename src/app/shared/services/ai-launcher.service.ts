import { Injectable, signal } from '@angular/core';

/** How the docked AI assistant is presented. Two modes only:
 *  - 'panel'   → right sidebar slide-over (default)
 *  - 'overlay' → centered modal overlay over the whole UI */
export type AiLauncherMode = 'panel' | 'overlay';

const MODE_KEY = 'ai-launcher-mode';

/**
 * AiLauncherService — the open/close + presentation-mode channel for the
 * docked AI assistant, mirroring NotificationModalService /
 * GlobalSearchService. The floating launcher button and the panel both live
 * in the shared ai-launcher component, so this holds just the open state +
 * mode as signals (OnPush-friendly).
 *
 * The chosen mode is persisted so it survives reloads.
 */
@Injectable({ providedIn: 'root' })
export class AiLauncherService {
  private _isOpen = signal(false);
  private _mode = signal<AiLauncherMode>(this.readMode());

  readonly isOpen = this._isOpen.asReadonly();
  readonly mode = this._mode.asReadonly();

  open(): void {
    this._isOpen.set(true);
  }

  close(): void {
    this._isOpen.set(false);
  }

  toggle(): void {
    this._isOpen.update(v => !v);
  }

  setMode(mode: AiLauncherMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* storage disabled */
    }
  }

  toggleMode(): void {
    this.setMode(this._mode() === 'panel' ? 'overlay' : 'panel');
  }

  private readMode(): AiLauncherMode {
    try {
      return localStorage.getItem(MODE_KEY) === 'overlay' ? 'overlay' : 'panel';
    } catch {
      return 'panel';
    }
  }
}
