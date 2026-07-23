// Custom CodeMirror 6 search panel — a compact, Monaco-style floating find /
// replace card (top-right of the editor). Replaces the stock @codemirror/search
// panel (a flat full-width strip of text buttons) with the app's visual
// language: a search field + icon-only prev/next/close, compact toggle chips
// (case / regex / whole-word), an "n/total" match count, and a replace row.
//
// It wires to the standard search commands so all existing shortcuts and the
// search state keep working — this only swaps the DOM the panel renders.
//
// The editor runs outside Angular, so this is plain DOM; translated labels are
// injected via `SearchPanelLabels` (resolved with TranslateService.instant at
// editor-init time). Positioning (floating card) lives in the component SCSS
// (`.cm-panels.cm-panels-top` / `.qx-find`).

import { EditorView, Panel, runScopeHandlers } from '@codemirror/view';
import {
  SearchQuery,
  findNext,
  findPrevious,
  getSearchQuery,
  setSearchQuery,
  replaceNext,
  replaceAll,
  closeSearchPanel,
} from '@codemirror/search';

export interface SearchPanelLabels {
  find: string; // Find field placeholder
  replace: string; // Replace field placeholder
  matchCase: string; // toggle title
  useRegex: string;
  wholeWord: string;
  next: string; // button titles
  prev: string;
  close: string;
  replaceOne: string;
  replaceAll: string;
  noMatches: string; // shown when count == 0 and a query is present
}

const MATCH_CAP = 999; // stop counting past this (shows "999+")

// Count matches of the current query in the doc, and the 1-based index of the
// match at/after the current selection head. Bounded by MATCH_CAP so a huge
// doc + broad query can't lock the UI thread.
function countMatches(
  view: EditorView,
  query: SearchQuery,
): { total: number; current: number; capped: boolean } {
  if (!query.search) return { total: 0, current: 0, capped: false };
  let total = 0;
  let current = 0;
  const head = view.state.selection.main.from;
  try {
    const cursor = query.getCursor(view.state.doc);
    for (;;) {
      const next = cursor.next();
      if (next.done) break;
      total++;
      if (current === 0 && next.value.from >= head) current = total;
      if (total >= MATCH_CAP) return { total, current, capped: true };
    }
  } catch {
    // Invalid regexp mid-typing — treat as no matches rather than throwing.
    return { total: 0, current: 0, capped: false };
  }
  // Selection is past the last match → wrap to the first for display.
  if (current === 0 && total > 0) current = total;
  return { total, current, capped: false };
}

function icon(cls: string): HTMLElement {
  const i = document.createElement('i');
  i.className = `pi ${cls}`;
  return i;
}

export function buildSearchPanel(labels: SearchPanelLabels) {
  return (view: EditorView): Panel => {
    const q = getSearchQuery(view.state);

    const dom = document.createElement('div');
    dom.className = 'qx-find';
    // Keep editor keybindings (Esc to close, Enter=next) working while focus is
    // in the panel — CM routes unhandled keys here.
    dom.onkeydown = e => {
      if (runScopeHandlers(view, e, 'search-panel')) e.preventDefault();
      else if (e.key === 'Enter' && e.target === findField) {
        e.preventDefault();
        (e.shiftKey ? findPrevious : findNext)(view);
      } else if (e.key === 'Enter' && e.target === replaceField) {
        e.preventDefault();
        replaceNext(view);
      }
    };

    // Read current control values into a SearchQuery and push to editor state.
    const commit = () => {
      const query = new SearchQuery({
        search: findField.value,
        replace: replaceField.value,
        caseSensitive: caseBtn.classList.contains('on'),
        regexp: regexBtn.classList.contains('on'),
        wholeWord: wordBtn.classList.contains('on'),
      });
      view.dispatch({ effects: setSearchQuery.of(query) });
      renderCount();
    };

    // ── row 1: find field + toggles + count + nav + close ──
    const row1 = document.createElement('div');
    row1.className = 'qx-find-row';

    const findField = document.createElement('input');
    findField.className = 'qx-find-input';
    findField.placeholder = labels.find;
    findField.setAttribute('main-field', 'true'); // CM focuses this on open
    findField.value = q.search;
    findField.oninput = commit;

    const toggles = document.createElement('div');
    toggles.className = 'qx-find-toggles';
    const mkToggle = (
      glyph: string,
      title: string,
      on: boolean,
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qx-find-toggle' + (on ? ' on' : '');
      b.title = title;
      b.textContent = glyph;
      b.onclick = () => {
        b.classList.toggle('on');
        commit();
        findField.focus();
      };
      return b;
    };
    const caseBtn = mkToggle('Aa', labels.matchCase, q.caseSensitive);
    const regexBtn = mkToggle('.*', labels.useRegex, q.regexp);
    const wordBtn = mkToggle('“ ”', labels.wholeWord, q.wholeWord);
    toggles.append(caseBtn, regexBtn, wordBtn);

    const count = document.createElement('span');
    count.className = 'qx-find-count';

    const nav = document.createElement('div');
    nav.className = 'qx-find-nav';
    const mkIconBtn = (
      glyph: string,
      title: string,
      onClick: () => void,
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qx-find-iconbtn';
      b.title = title;
      b.append(icon(glyph));
      b.onclick = onClick;
      return b;
    };
    const prevBtn = mkIconBtn('pi-chevron-up', labels.prev, () =>
      findPrevious(view),
    );
    const nextBtn = mkIconBtn('pi-chevron-down', labels.next, () =>
      findNext(view),
    );
    const closeBtn = mkIconBtn('pi-times', labels.close, () =>
      closeSearchPanel(view),
    );
    closeBtn.classList.add('qx-find-close');
    nav.append(prevBtn, nextBtn, closeBtn);

    row1.append(findField, toggles, count, nav);

    // ── row 2: replace field + replace / replace-all ──
    const row2 = document.createElement('div');
    row2.className = 'qx-find-row';

    const replaceField = document.createElement('input');
    replaceField.className = 'qx-find-input';
    replaceField.placeholder = labels.replace;
    replaceField.value = q.replace;
    replaceField.oninput = commit;

    const replaceActions = document.createElement('div');
    replaceActions.className = 'qx-find-replace-actions';
    const replaceOneBtn = document.createElement('button');
    replaceOneBtn.type = 'button';
    replaceOneBtn.className = 'qx-find-textbtn';
    replaceOneBtn.textContent = labels.replaceOne;
    replaceOneBtn.onclick = () => replaceNext(view);
    const replaceAllBtn = document.createElement('button');
    replaceAllBtn.type = 'button';
    replaceAllBtn.className = 'qx-find-textbtn';
    replaceAllBtn.textContent = labels.replaceAll;
    replaceAllBtn.onclick = () => replaceAll(view);
    replaceActions.append(replaceOneBtn, replaceAllBtn);

    row2.append(replaceField, replaceActions);

    dom.append(row1, row2);

    // Match-count label, kept in sync on every relevant update.
    function renderCount(): void {
      const query = getSearchQuery(view.state);
      if (!query.search) {
        count.textContent = '';
        count.classList.remove('empty');
        return;
      }
      const { total, current, capped } = countMatches(view, query);
      if (total === 0) {
        count.textContent = labels.noMatches;
        count.classList.add('empty');
      } else {
        count.textContent = `${current}/${total}${capped ? '+' : ''}`;
        count.classList.remove('empty');
      }
    }

    return {
      dom,
      top: true,
      mount: () => renderCount(),
      update: update => {
        // Re-count when the doc, selection, or the search query changed.
        if (
          update.docChanged ||
          update.selectionSet ||
          update.transactions.some(tr =>
            tr.effects.some(e => e.is(setSearchQuery)),
          )
        ) {
          renderCount();
        }
      },
    };
  };
}
