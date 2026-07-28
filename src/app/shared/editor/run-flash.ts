/**
 * Briefly highlight the lines that just ran.
 *
 * The Query Executor can run the statement under the cursor rather than the
 * whole buffer, so it flashes the range it actually sent — without it, a script
 * of five statements gives no feedback about which one executed. CodeMirror did
 * this with a StateField + StateEffect; Monaco's equivalent is a decorations
 * collection.
 */

declare const monaco: any;

/** Long enough to register, short enough not to linger over the results. */
const FLASH_MS = 420;

/** Editors with a flash in flight, so a rapid re-run cancels the previous one. */
const pending = new WeakMap<object, any>();

/**
 * Flash lines `startLine`..`endLine` (1-based, inclusive).
 *
 * Colour comes from `.dbx-run-flash` in the shared chrome stylesheet rather than
 * from an inline style, so it follows the organisation's brand tokens like every
 * other highlight.
 */
export function flashRange(
  editor: any,
  startLine: number,
  endLine: number,
): void {
  if (!editor || typeof monaco === 'undefined') return;

  const model = editor.getModel?.();
  if (!model) return;

  // Clamp: a stale range from a previous buffer would otherwise throw inside
  // Monaco when the document has since shrunk.
  const maxLine = model.getLineCount();
  const from = Math.max(1, Math.min(startLine, maxLine));
  const to = Math.max(from, Math.min(endLine, maxLine));

  const previous = pending.get(editor);
  if (previous) {
    clearTimeout(previous.timer);
    previous.collection.clear();
  }

  const collection = editor.createDecorationsCollection([
    {
      range: new monaco.Range(from, 1, to, model.getLineMaxColumn(to)),
      options: {
        isWholeLine: true,
        className: 'dbx-run-flash',
        // Mark the ruler too, so a flash below the fold is still visible.
        overviewRuler: {
          color: 'rgba(33, 150, 243, 0.35)',
          position: monaco.editor.OverviewRulerLane.Full,
        },
      },
    },
  ]);

  const timer = setTimeout(() => {
    collection.clear();
    pending.delete(editor);
  }, FLASH_MS);

  pending.set(editor, { collection, timer });
}
