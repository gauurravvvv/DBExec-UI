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
 * Whether the current theme is dark, from the resolved editor surface.
 *
 * The org/user theme can now be a DARK preset. Monaco's `vs` base paints
 * syntax tokens (keywords, strings, comments) and the suggest/hover
 * widget internals in colours tuned for a light surface — unreadable on
 * a dark editor. We pick the `vs-dark` base when the surface is dark so
 * those built-ins flip with it, then still override the chrome from our
 * tokens on top. Luminance test mirrors ThemeService.computeIsDark.
 */
function surfaceIsDark(surfaceHex: string): boolean {
  const h = surfaceHex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.4;
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
 * Blend `hex` toward `toward` by `alpha` (0 = all `hex`, 1 = all `toward`).
 *
 * `tint` only blends toward white, which washes a selection fill out on a dark
 * surface. This generalises it so a selection can be blended toward the actual
 * editor surface — dark or light — keeping the brand hue while staying subtle.
 */
function mixToward(hex: string, toward: string, alpha: number): string {
  const a = hex.replace('#', '');
  const b = toward.replace('#', '');
  if (a.length < 6 || b.length < 6) return hex;
  const two = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
  const ch = (i: number) => {
    const from = parseInt(a.slice(i, i + 2), 16);
    const to = parseInt(b.slice(i, i + 2), 16);
    return two(from * (1 - alpha) + to * alpha);
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/**
 * Monaco `rules[].foreground` wants a hex WITHOUT the leading `#` (unlike the
 * `colors` map, which requires it). Normalise a resolved colour to that form,
 * expanding shorthand as needed.
 */
function strip(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length === 3) return `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  return h.slice(0, 6);
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
  const success = token('--success-color', '#4caf50');

  const dark = surfaceIsDark(surface);

  // Solid fills derived from the live brand colour, so a red-branded org gets a
  // red-tinted selection rather than a stray blue one. On a dark surface a
  // white-ward tint would wash the selection out, so blend toward the surface.
  const selection = mixToward(primary, surface, dark ? 0.55 : 0.82);
  const selectionSoft = mixToward(primary, surface, dark ? 0.75 : 0.9);

  // Syntax token colours. `vs`/`vs-dark` ship a light/dark-tuned set, but its
  // keyword/comment hues are fixed blues/greens that ignore the brand and, on a
  // dark surface via inherit alone, some tokens (operators, delimiters) fall
  // back to near-black. Pin an explicit, surface-appropriate palette derived
  // from the live tokens so SQL/formula text is always legible and on-brand.
  const identifier = text;
  const keyword = primary;
  const stringLit = success;
  const numberLit = warning;
  const comment = subtle;
  const delimiter = muted;

  monaco.editor.defineTheme(DBEXEC_THEME, {
    // Pick the base that matches the surface so Monaco's own built-ins (the
    // suggest/hover widget internals, whitespace, guides) flip with it; our
    // explicit rules + colours then override on top for brand + legibility.
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: strip(identifier) },
      { token: 'keyword', foreground: strip(keyword) },
      { token: 'keyword.sql', foreground: strip(keyword) },
      { token: 'operator.sql', foreground: strip(delimiter) },
      { token: 'string', foreground: strip(stringLit) },
      { token: 'string.sql', foreground: strip(stringLit) },
      { token: 'number', foreground: strip(numberLit) },
      { token: 'comment', foreground: strip(comment), fontStyle: 'italic' },
      { token: 'delimiter', foreground: strip(delimiter) },
      { token: 'identifier', foreground: strip(identifier) },
      { token: 'predefined.sql', foreground: strip(keyword) },
    ],
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
