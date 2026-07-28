/**
 * The single Monaco theme for the whole app.
 *
 * Every code editor — Query Executor, Dataset Creator, Field Creator and their
 * edit screens — uses this one theme, so they cannot drift apart.
 *
 * WHY IT IS BUILT AT RUNTIME RATHER THAN WRITTEN OUT AS HEX
 *
 * `ThemeService` rewrites `--primary-color`, `--primary-color-transparent` and a
 * dozen sibling variables at runtime from each organisation's brand settings. A
 * theme with literal hex in it is therefore wrong the moment an org picks a
 * colour: the app turns red and the editor's suggest widget, cursor and bracket
 * highlights stay blue. Monaco's colour map cannot resolve `var(--…)`, so the
 * only correct option is to READ the computed value of each token and hand
 * Monaco the resolved colour. Re-run `defineDbexecThemes()` and the editor
 * follows the brand.
 *
 * ON DARK MODE
 *
 * There is none yet. Four components used to branch on
 * `document.body.classList.contains('dark-theme')`, but nothing in the app ever
 * adds that class — every reference only read it, so the dark branch was dead
 * and Monaco always rendered light. Rather than keep a branch that cannot fire,
 * there is one theme. When dark mode arrives it needs no change here: give the
 * tokens dark values under whatever selector is chosen and this theme picks them
 * up, because it reads computed values rather than hard-coded ones.
 */

declare const monaco: any;

/** The only theme name any editor should pass to Monaco. */
export const DBEXEC_THEME = 'dbexec';

/**
 * Convert a CSS colour to the `#rrggbb` / `#rrggbbaa` form Monaco demands.
 *
 * Tokens are a mix of forms: `--border-color` is `#e0e0e0`, while
 * `--primary-color-transparent` is `rgba(33, 150, 243, 0.15)`. Monaco rejects
 * `rgb()`/`rgba()` outright and throws while defining the theme, which would
 * take the editor down with it — hence the conversion, and hence returning null
 * rather than guessing when the input is unrecognised.
 */
function toMonacoHex(css: string): string | null {
  const v = (css || '').trim();
  if (!v) return null;

  // #rgb → #rrggbb
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{8}$/i.test(v)) return v;

  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(v);
  if (!m) return null;

  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const r = hex(parseFloat(m[1]));
  const g = hex(parseFloat(m[2]));
  const b = hex(parseFloat(m[3]));
  if (m[4] === undefined) return `#${r}${g}${b}`;

  const a = Math.max(0, Math.min(1, parseFloat(m[4])));
  return `#${r}${g}${b}${hex(a * 255)}`;
}

/** Read a design token off the document and resolve it to a Monaco colour. */
function token(name: string, fallback: string): string {
  const raw = getComputedStyle(document.body).getPropertyValue(name);
  return toMonacoHex(raw) ?? toMonacoHex(fallback) ?? '#000000';
}

/**
 * Blend a colour with white at the given alpha.
 *
 * The suggest widget's selected row needs a solid fill, not a translucent one:
 * Monaco paints the row over the widget background, and an alpha fill lets the
 * text of the row beneath bleed through on some GPUs. `--primary-color-transparent`
 * is translucent by design, so it is flattened here instead.
 */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  const two = (n: number) => n.toString(16).padStart(2, '0');
  return `#${two(mix(r))}${two(mix(g))}${two(mix(b))}`;
}

/**
 * Define (or redefine) the app theme from the tokens currently in force.
 *
 * Safe to call repeatedly — `defineTheme` overwrites, and overwriting is the
 * point: it is how the editor picks up a brand change. Callers should invoke it
 * immediately before `monaco.editor.create`, which is also when the org's brand
 * variables are guaranteed to be applied.
 */
export function defineDbexecThemes(): void {
  if (typeof monaco === 'undefined' || !monaco?.editor?.defineTheme) return;

  const surface = token('--card-background', '#ffffff');
  const text = token('--text-color', '#333333');
  const border = token('--border-color', '#e0e0e0');
  const borderStrong = token('--border-strong', '#c7c7c7');
  const subtle = token('--text-subtle', '#9ca3af');
  const muted = token('--text-muted', '#6b7280');
  const primary = token('--primary-color', '#2196f3');
  const codeBg = token('--code-bg', '#f8fafc');
  const error = token('--error-color', '#f44336');
  const warning = token('--warning-color', '#ff9800');

  // Solid fills derived from the live brand colour, so a red-branded org gets a
  // red-tinted selection rather than a stray blue one.
  const selection = tint(primary, 0.18);
  const selectionSoft = tint(primary, 0.1);

  monaco.editor.defineTheme(DBEXEC_THEME, {
    // Inherit every syntax rule from `vs`; only chrome colours are overridden,
    // so SQL and formula highlighting stay exactly as they are today.
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': surface,
      'editor.foreground': text,
      'editor.lineHighlightBackground': codeBg,
      'editor.selectionBackground': selection,
      'editor.inactiveSelectionBackground': selectionSoft,
      'editor.selectionHighlightBackground': selectionSoft,
      'editor.wordHighlightBackground': selectionSoft,
      'editor.findMatchBackground': selection,
      'editor.findMatchHighlightBackground': selectionSoft,

      'editorCursor.foreground': primary,
      'editorLineNumber.foreground': subtle,
      'editorLineNumber.activeForeground': text,
      'editorGutter.background': surface,

      'editorIndentGuide.background': border,
      'editorIndentGuide.activeBackground': borderStrong,
      'editorBracketMatch.background': selectionSoft,
      'editorBracketMatch.border': primary,

      'editorError.foreground': error,
      'editorWarning.foreground': warning,

      // The suggest widget is the piece that most obviously betrayed a stock
      // theme: `vs` paints the highlighted row in a saturated blue with white
      // text, which reads as an unstyled browser widget next to the app's own
      // light-tint/coloured-text selected rows.
      'editorSuggestWidget.background': surface,
      'editorSuggestWidget.border': border,
      'editorSuggestWidget.foreground': text,
      'editorSuggestWidget.selectedBackground': selection,
      'editorSuggestWidget.selectedForeground': text,
      'editorSuggestWidget.highlightForeground': primary,
      'editorSuggestWidget.focusHighlightForeground': primary,

      'editorHoverWidget.background': surface,
      'editorHoverWidget.border': border,
      'editorHoverWidget.foreground': text,

      // Find/replace. Monaco's own widget replaces the executor's hand-built
      // panel, so it has to carry the app's surface and border.
      'editorWidget.background': surface,
      'editorWidget.border': border,
      'editorWidget.foreground': text,
      'input.background': surface,
      'input.border': border,
      'input.foreground': text,
      'inputOption.activeBorder': primary,
      'inputPlaceholderForeground': muted,

      'scrollbarSlider.background': tint(borderStrong, 0.5),
      'scrollbarSlider.hoverBackground': borderStrong,
      'scrollbarSlider.activeBackground': borderStrong,
    },
  });
}

/**
 * The theme name to pass to `monaco.editor.create`.
 *
 * A function rather than a constant so call sites read the same as before and so
 * a future light/dark split has one place to change.
 */
export function currentDbexecTheme(): string {
  return DBEXEC_THEME;
}
