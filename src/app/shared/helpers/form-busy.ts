import { computed, signal } from '@angular/core';

/**
 * FormBusy — the app-wide "a write is in flight" convention for forms.
 *
 * Modern apps don't freeze the whole screen on a save. Instead the button
 * that fired the write spins + disables (so a second submit is impossible),
 * every OTHER write button on the screen disables (so it can't start a
 * conflicting write), the inputs stay editable, and read-only buttons
 * (Cancel / Back / Preview) stay clickable so the user can always bail.
 *
 * This class holds that state as signals and guards against double-fire.
 * It is a plain instantiable helper, NOT an Angular base class — a component
 * just holds one as a field so there's no inheritance / OnPush friction:
 *
 *   readonly form = new FormBusy();
 *
 *   onSave()    { this.form.run('save',    () => this.svc.save(this.payload())); }
 *   onSaveNew() { this.form.run('saveNew', () => this.svc.save(this.payload())); }
 *
 *   <app-button variant="primary"
 *               [loading]="form.isRunning('save')" [disabled]="form.busy()"
 *               (clicked)="onSave()">Save</app-button>
 *   <app-button variant="secondary"
 *               [loading]="form.isRunning('saveNew')" [disabled]="form.busy()"
 *               (clicked)="onSaveNew()">Save & New</app-button>
 *   <!-- Cancel is read-only: it is NOT bound to busy(), so it stays live -->
 *   <app-button variant="ghost" (clicked)="onCancel()">Cancel</app-button>
 *
 * Single-button forms can bind directly to the service's own `saving` signal
 * and skip this entirely; FormBusy earns its keep the moment a screen has more
 * than one write action, or needs the double-fire guard made explicit.
 */
export class FormBusy {
  /** The action currently running (the key passed to run/begin), else null. */
  private readonly _active = signal<string | null>(null);

  /** True while ANY write is in flight — bind every write button's [disabled]. */
  readonly busy = computed(() => this._active() !== null);

  /** The running action key (for custom template logic), else null. */
  readonly active = this._active.asReadonly();

  /** Bind a specific button's [loading] to this so only the clicked one spins. */
  isRunning(action: string): boolean {
    return this._active() === action;
  }

  /**
   * Run an async write under the given action key. Drops the call if a write
   * is already in flight (the double-fire guard — survives an Enter+click in
   * the same frame, before the disabled state has even painted). Always clears
   * the busy state, so on error the buttons re-enable and the user can retry.
   * Re-throws so the caller's own catch (toast, stay-on-page) still runs.
   */
  async run<T>(action: string, work: () => Promise<T>): Promise<T | undefined> {
    if (this._active() !== null) return undefined;
    this._active.set(action);
    try {
      return await work();
    } finally {
      this._active.set(null);
    }
  }

  /**
   * Manual form of run() for callers that aren't a single awaitable (e.g. an
   * RxJS subscription). Call begin() before the write and end() in every
   * terminal path. begin() returns false if a write is already running.
   */
  begin(action: string): boolean {
    if (this._active() !== null) return false;
    this._active.set(action);
    return true;
  }

  end(): void {
    this._active.set(null);
  }
}
