/**
 * CodeEditorService — the one way to create a code editor in this app.
 *
 * Query Executor, Dataset Creator, Field Creator, their edit screens and the
 * prompt SQL dialog all mount Monaco. Before this service each repeated the
 * same fragile sequence by hand:
 *
 *     loader.load() → register language → read theme → defineTheme → create
 *     → setTheme again (Monaco's theme is GLOBAL and leaks between editors)
 *     → focus → wire onDidChangeModelContent → remember to dispose
 *
 * Five copies meant five chances to get it wrong, and they did diverge: three
 * carried an identical dead `dark-theme` branch, and two leaked a completion
 * provider because disposal was partial. Everything below exists to make the
 * correct sequence the only one available.
 *
 * Two traps it closes for every caller:
 *
 *  1. **Zone escape.** Monaco's events fire outside Angular's zone, so an
 *     OnPush component never re-renders on them — the symptom was a Run button
 *     staying greyed out while the user typed. `onChange` re-enters the zone.
 *  2. **Leaks.** Completion providers, theme observers and the editor itself all
 *     need disposing. `EditorHandle.dispose()` drops every disposable the handle
 *     collected, so a component only has to call one method.
 */
import { Injectable, NgZone } from '@angular/core';

import { MonacoLoaderService } from '../../core/services/monaco-loader.service';
import { registerFormulaLanguage } from './formula-language';
import { attachPlaceholder } from './editor-placeholder';
import { formulaEditorOptions, sqlEditorOptions } from './monaco-options';
import { currentDbexecTheme, defineDbexecThemes } from './monaco-theme';
import { flashRange } from './run-flash';

declare const monaco: any;

/**
 * Which editor this is.
 *
 * The flavour picks the language and the handful of options that legitimately
 * differ (minimap, ligatures, word-based suggestions) — see monaco-options.ts
 * for why each differs. Everything else is shared.
 */
export type EditorFlavour = 'sql' | 'formula';

export interface CreateEditorConfig {
  /** The element Monaco mounts into. */
  host: HTMLElement;
  flavour: EditorFlavour;
  value?: string;
  readOnly?: boolean;
  /** Shown while the model is empty; Monaco has no placeholder of its own. */
  placeholder?: string;
  /** Focus once created. Off by default so dialogs don't steal focus. */
  autoFocus?: boolean;
  /**
   * Escape hatch for genuinely per-screen options. Prefer changing the shared
   * options over passing overrides — an override is how three configs drifted
   * apart in the first place.
   */
  overrides?: Record<string, any>;
}

/**
 * An application shortcut, described in Monaco's own vocabulary.
 *
 * `key` is a `monaco.KeyCode`; `ctrlCmd` means Cmd on macOS and Ctrl elsewhere.
 */
export interface EditorShortcut {
  key: number;
  ctrlCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface EditorHandle {
  /** The raw Monaco instance, for APIs this handle deliberately does not wrap. */
  readonly editor: any;
  getValue(): string;
  setValue(value: string): void;
  /** Content changes, already back inside Angular's zone. */
  onChange(cb: (value: string) => void): void;
  updateOptions(options: Record<string, any>): void;
  /** Briefly highlight a range — used to show which statement just ran. */
  flash(startLine: number, endLine: number): void;
  focus(): void;
  /** Register anything that must be cleaned up with the editor. */
  track(disposable: { dispose: () => void } | (() => void)): void;
  dispose(): void;
}

@Injectable({ providedIn: 'root' })
export class CodeEditorService {
  constructor(
    private readonly loader: MonacoLoaderService,
    private readonly zone: NgZone,
  ) {}

  /** True once Monaco's global object is available. */
  get isLoaded(): boolean {
    return typeof monaco !== 'undefined' && !!monaco?.editor;
  }

  /**
   * Load Monaco, register what the flavour needs, and create the editor.
   *
   * Rejects if Monaco cannot be loaded, so a caller can show its own
   * "editor unavailable" state rather than a blank box.
   */
  async create(cfg: CreateEditorConfig): Promise<EditorHandle> {
    await this.loader.load();
    if (!this.isLoaded) throw new Error('Monaco failed to load');

    if (cfg.flavour === 'formula') registerFormulaLanguage();

    // Register the theme from the live tokens BEFORE create: Monaco throws on a
    // theme name it does not know, and re-running this is how an editor picks up
    // an organisation's brand colour.
    defineDbexecThemes();
    const theme = currentDbexecTheme();

    const base =
      cfg.flavour === 'sql' ? sqlEditorOptions() : formulaEditorOptions();

    const editor = monaco.editor.create(cfg.host, {
      ...base,
      ...(cfg.overrides ?? {}),
      value: cfg.value ?? '',
      theme,
      readOnly: cfg.readOnly ?? false,
    });

    // Monaco's theme is global, so an editor created on a previously-visited
    // screen can leave a different theme in force. Assert ours after create.
    monaco.editor.setTheme(theme);

    if (cfg.autoFocus) editor.focus();

    const disposables: Array<{ dispose: () => void } | (() => void)> = [];

    if (cfg.placeholder) {
      disposables.push(attachPlaceholder(editor, cfg.host, cfg.placeholder));
    }

    this.unstickSuggestDetails(editor, disposables);

    const handle: EditorHandle = {
      editor,
      getValue: () => editor.getValue(),
      setValue: (value: string) => editor.setValue(value ?? ''),
      onChange: (cb: (value: string) => void) => {
        disposables.push(
          editor.onDidChangeModelContent(() => {
            // Back into the zone: Monaco fires outside it, and an OnPush
            // component will not re-render otherwise.
            this.zone.run(() => cb(editor.getValue()));
          }),
        );
      },
      updateOptions: (options: Record<string, any>) =>
        editor.updateOptions(options),
      flash: (startLine: number, endLine: number) =>
        flashRange(editor, startLine, endLine),
      focus: () => editor.focus(),
      track: d => disposables.push(d),
      dispose: () => {
        for (const d of disposables) {
          try {
            typeof d === 'function' ? d() : d.dispose();
          } catch {
            // A disposable that throws must not strand the ones after it.
          }
        }
        disposables.length = 0;
        editor.dispose();
      },
    };

    return handle;
  }

  /**
   * Stop the suggestion DETAILS pane from being sticky.
   *
   * Monaco remembers whether the details pane was expanded and restores it on
   * every later suggestion — for the rest of the session, across editors, with no
   * option to turn it off. Measured: open the list, expand the description,
   * dismiss it, type again, and the description is expanded before you ask for it,
   * covering the code you are writing.
   *
   * That is a preference Monaco keeps for a code IDE, where a developer wants
   * documentation pinned. Here the list is mostly column and table names, and a
   * pane that reappears unbidden reads as a stray popup that will not close.
   *
   * So the pane is normalised to collapsed each time the list OPENS. Expanding it
   * still works and still shows the description for as long as the list is open;
   * it simply does not carry over. Implemented against `toggleSuggestionDetails`,
   * a public command, rather than Monaco's private storage.
   */
  private unstickSuggestDetails(
    editor: any,
    disposables: Array<{ dispose: () => void } | (() => void)>,
  ): void {
    const dom: HTMLElement | null = editor.getDomNode?.() ?? null;
    if (!dom || typeof MutationObserver === 'undefined') return;

    let wasOpen = false;
    const observer = new MutationObserver(() => {
      const widget = dom.querySelector('.suggest-widget');
      const isOpen = !!widget && widget.classList.contains('visible');

      // Only on the transition into open: doing it continuously would fight the
      // user the moment they expanded the pane themselves.
      if (isOpen && !wasOpen && dom.querySelector('.suggest-details-container')) {
        editor.trigger('dbexec', 'toggleSuggestionDetails', {});
      }
      wasOpen = isOpen;
    });

    observer.observe(dom, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    disposables.push(() => observer.disconnect());
  }

  /**
   * Re-apply the theme from the tokens currently in force.
   *
   * Call after an organisation's branding changes so open editors follow the new
   * primary colour instead of keeping the one captured at create.
   */
  refreshTheme(): void {
    if (!this.isLoaded) return;
    defineDbexecThemes();
    monaco.editor.setTheme(currentDbexecTheme());
  }

  /**
   * Bind an application shortcut on the editor.
   *
   * Implemented on `onKeyDown` rather than Monaco's `addCommand` / `addAction`,
   * because in this app neither of those actually binds. Measured in the browser:
   * a command registered through either API never fires — not with CtrlCmd, not
   * with WinCtrl, not with Alt — while Monaco's OWN built-ins (Cmd+A select-all)
   * respond to the very same synthetic keystrokes, and `onKeyDown` reports the
   * events correctly. So the keystrokes reach Monaco; only its dynamic keybinding
   * registration fails to resolve them. The root cause is not established, which
   * is exactly why this does not depend on it: `onKeyDown` plus explicit matching
   * is deterministic and entirely under our control.
   *
   * The handler re-enters Angular's zone. Without that, a shortcut that runs a
   * query leaves the results pane un-rendered until some unrelated event ticks
   * change detection, which reads to the user as "the shortcut did nothing".
   *
   * The listener is tracked on the handle, so it dies with the editor.
   */
  addShortcut(
    handle: EditorHandle,
    shortcut: EditorShortcut,
    run: () => void,
  ): void {
    // CtrlCmd means Cmd on macOS and Ctrl elsewhere, matching how Monaco and the
    // rest of the app describe their shortcuts to the user.
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

    handle.track(
      handle.editor.onKeyDown((e: any) => {
        const cmdPressed = isMac ? e.metaKey : e.ctrlKey;
        if (!!shortcut.ctrlCmd !== cmdPressed) return;
        if (!!shortcut.shift !== e.shiftKey) return;
        if (!!shortcut.alt !== e.altKey) return;
        if (e.keyCode !== shortcut.key) return;

        // Stop Monaco inserting a newline for Enter, and stop the browser
        // claiming combinations like Cmd+G.
        e.preventDefault();
        e.stopPropagation();
        this.zone.run(run);
      }),
    );
  }
}
