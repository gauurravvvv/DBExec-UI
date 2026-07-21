/**
 * SettingsTabForm — the contract every settings tab implements so a single
 * hub-level "Save" button can drive whichever tab is active.
 *
 * The hub renders one Save button (top-right, UltraSignal style) and, on
 * click, delegates to the currently-rendered tab's onSave() — which persists
 * to that tab's own API. `dirty` gates the button; `busy` shows the spinner.
 */
export interface SettingsTabForm {
  /** Persist this tab to its respective endpoint. */
  onSave(): void | Promise<void>;
  /** True when the tab has unsaved edits (drives the Save button enablement). */
  readonly dirty: boolean;
  /** True while a save is in flight (drives the Save button spinner). */
  readonly busy: boolean;
}
