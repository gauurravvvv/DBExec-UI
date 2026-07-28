/**
 * EditorDoc — an offset-oriented view of a Monaco model.
 *
 * Monaco addresses text by line and column. The Query Executor's logic is
 * written in character offsets, because that is what `splitStatements` and
 * `statementAtCursor` return — they mirror the backend splitter so that "run the
 * statement at the cursor" sends exactly the range the server will run. Offsets
 * are therefore the natural currency here and line/column is the awkward one.
 *
 * Rather than scatter `getOffsetAt` / `getPositionAt` conversions across fifty
 * call sites, they live here once. This is not a CodeMirror-shaped shim kept for
 * convenience: offsets are what the surrounding code genuinely needs, and every
 * method below is a real operation on a Monaco model.
 *
 * Every accessor tolerates a disposed or absent model and returns a safe empty
 * value, because the executor can be torn down mid-request.
 */

declare const monaco: any;

export interface DocLine {
  /** 1-based line number, matching Monaco and the gutter the user sees. */
  number: number;
  /** Offset of the first character. */
  from: number;
  /** Offset just past the last character, excluding the newline. */
  to: number;
  text: string;
}

export interface DocSelection {
  from: number;
  to: number;
  /** Where the caret actually is — `to` when selecting forwards, else `from`. */
  head: number;
  empty: boolean;
}

export class EditorDoc {
  constructor(private readonly editor: any) {}

  private get model(): any | null {
    return this.editor?.getModel?.() ?? null;
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  text(): string {
    return this.model?.getValue() ?? '';
  }

  length(): number {
    const m = this.model;
    if (!m) return 0;
    // getValueLength() counts the model's own EOL sequence, which is what offset
    // arithmetic against getValue() has to agree with.
    return m.getValueLength();
  }

  lineCount(): number {
    return this.model?.getLineCount() ?? 0;
  }

  /** The line containing `offset`, clamped into the document. */
  lineAt(offset: number): DocLine {
    const m = this.model;
    if (!m) return { number: 1, from: 0, to: 0, text: '' };
    const pos = m.getPositionAt(this.clamp(offset));
    return this.line(pos.lineNumber);
  }

  /** Line `n`, 1-based and clamped. */
  line(n: number): DocLine {
    const m = this.model;
    if (!m) return { number: 1, from: 0, to: 0, text: '' };
    const number = Math.max(1, Math.min(n, m.getLineCount()));
    const text = m.getLineContent(number);
    const from = m.getOffsetAt({ lineNumber: number, column: 1 });
    return { number, from, to: from + text.length, text };
  }

  sliceDoc(from: number, to: number): string {
    const m = this.model;
    if (!m) return '';
    const a = this.clamp(Math.min(from, to));
    const b = this.clamp(Math.max(from, to));
    return m.getValueInRange(this.rangeOf(a, b));
  }

  selection(): DocSelection {
    const m = this.model;
    const sel = this.editor?.getSelection?.();
    if (!m || !sel) return { from: 0, to: 0, head: 0, empty: true };
    const from = m.getOffsetAt({
      lineNumber: sel.startLineNumber,
      column: sel.startColumn,
    });
    const to = m.getOffsetAt({
      lineNumber: sel.endLineNumber,
      column: sel.endColumn,
    });
    // getSelection() reports start/end in document order, so recover the caret
    // end from the separate position — reversing a selection must not move the
    // reported head.
    const posn = this.editor.getPosition?.();
    const head = posn ? m.getOffsetAt(posn) : to;
    return { from, to, head, empty: from === to };
  }

  offsetToPosition(offset: number): any {
    return this.model?.getPositionAt(this.clamp(offset)) ?? null;
  }

  // ── Writing ───────────────────────────────────────────────────────────────

  /**
   * Replace `from`..`to` with `insert`, as one undoable edit.
   *
   * `executeEdits` rather than `model.applyEdits` so the change joins the
   * editor's undo stack — a replacement the user cannot undo is a bug.
   */
  replaceRange(from: number, to: number, insert: string): void {
    const m = this.model;
    if (!m) return;
    const a = this.clamp(Math.min(from, to));
    const b = this.clamp(Math.max(from, to));
    this.editor.executeEdits('dbexec', [
      { range: this.rangeOf(a, b), text: insert, forceMoveMarkers: true },
    ]);
  }

  /** Insert at the caret, replacing any selection. */
  insertAtCursor(text: string): void {
    const sel = this.selection();
    this.replaceRange(sel.from, sel.to, text);
    this.focus();
  }

  /**
   * Replace the whole document.
   *
   * Uses an edit over the full range rather than `setValue`, because `setValue`
   * resets the undo stack and drops the user's history.
   */
  setText(text: string): void {
    const m = this.model;
    if (!m) return;
    this.replaceRange(0, m.getValueLength(), text ?? '');
  }

  // ── Caret and viewport ────────────────────────────────────────────────────

  setCursor(offset: number, reveal = true): void {
    const m = this.model;
    if (!m) return;
    const pos = m.getPositionAt(this.clamp(offset));
    this.editor.setPosition(pos);
    if (reveal) this.editor.revealPositionInCenterIfOutsideViewport(pos);
  }

  select(from: number, to: number, reveal = true): void {
    const m = this.model;
    if (!m) return;
    const a = m.getPositionAt(this.clamp(from));
    const b = m.getPositionAt(this.clamp(to));
    this.editor.setSelection({
      startLineNumber: a.lineNumber,
      startColumn: a.column,
      endLineNumber: b.lineNumber,
      endColumn: b.column,
    });
    if (reveal) this.editor.revealPositionInCenterIfOutsideViewport(b);
  }

  goToLine(n: number): void {
    const line = this.line(n);
    this.editor?.setPosition({ lineNumber: line.number, column: 1 });
    this.editor?.revealLineInCenter(line.number);
    this.focus();
  }

  focus(): void {
    this.editor?.focus();
  }

  /**
   * Ask Monaco to (re)compute completions now.
   *
   * Hides the widget first, which is not cosmetic: triggering while the widget is
   * already open reuses the list it is showing. That is precisely the case that
   * matters here — a lazily-fetched table's columns arrive AFTER the user typed
   * `alias.`, so the open list still holds the keyword fallback computed before
   * the schema was known. Without the hide, the columns never appear until the
   * user dismisses the list and asks again.
   */
  triggerSuggest(): void {
    if (!this.editor) return;
    this.editor.trigger('dbexec', 'hideSuggestWidget', {});
    this.editor.trigger('dbexec', 'editor.action.triggerSuggest', {});
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private clamp(offset: number): number {
    const max = this.length();
    if (!Number.isFinite(offset)) return 0;
    return Math.max(0, Math.min(Math.trunc(offset), max));
  }

  private rangeOf(from: number, to: number): any {
    const m = this.model;
    const a = m.getPositionAt(from);
    const b = m.getPositionAt(to);
    return new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column);
  }
}
