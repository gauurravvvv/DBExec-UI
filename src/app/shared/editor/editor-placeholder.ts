/**
 * Placeholder text for an empty editor.
 *
 * Monaco has no placeholder option — CodeMirror did, via its `placeholder()`
 * extension, so the Query Executor's hint would simply have vanished in the
 * move. This reproduces it as a positioned element inside the editor's host.
 *
 * Deliberately plain DOM rather than an Angular template: the editor runs
 * outside Angular's zone and the host is a Monaco-owned element, so a component
 * binding here would be change-detection noise for a static string.
 */

/** The host must establish a positioning context for the overlay. */
const HOST_POSITION_FALLBACK = 'relative';

/**
 * Show `text` while the model is empty; hide as soon as anything is typed.
 *
 * @returns a dispose function — hand it to `EditorHandle.track` so it is cleaned
 *   up with the editor rather than left listening on a detached model.
 */
export function attachPlaceholder(
  editor: any,
  host: HTMLElement,
  text: string,
): () => void {
  const el = document.createElement('div');
  el.className = 'dbx-editor-placeholder';
  el.textContent = text;
  // Never intercept clicks: the user must be able to click "through" the hint to
  // place the caret, which is the whole point of clicking an empty editor.
  el.style.pointerEvents = 'none';
  el.style.position = 'absolute';
  el.style.zIndex = '1';

  if (getComputedStyle(host).position === 'static') {
    host.style.position = HOST_POSITION_FALLBACK;
  }
  host.appendChild(el);

  const sync = () => {
    const empty = (editor.getValue() ?? '').length === 0;
    el.style.display = empty ? 'block' : 'none';
    if (!empty) return;
    // Line up with the first character rather than the host's corner, so the
    // hint sits on the text baseline whatever the gutter width or padding.
    const top = editor.getTopForLineNumber?.(1) ?? 0;
    const left = editor.getLayoutInfo?.().contentLeft ?? 0;
    const opts = editor.getRawOptions?.() ?? {};
    el.style.top = `${top + (opts.padding?.top ?? 0)}px`;
    el.style.left = `${left + 1}px`;
  };

  sync();
  const sub = editor.onDidChangeModelContent(() => sync());
  const layoutSub = editor.onDidLayoutChange?.(() => sync());

  return () => {
    sub?.dispose?.();
    layoutSub?.dispose?.();
    el.remove();
  };
}
