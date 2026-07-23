import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  AI_WORKSPACE as AI_API,
  DATASET as DATASET_API,
} from 'src/app/core/constants/api.constant';
import {
  DATASET as DATASET_ROUTE,
  QUERY_RUNNER,
} from 'src/app/core/constants/routes.constant';
import type {
  AiCard,
  ConfirmCard,
  DatasetDraftCard,
  SqlCard,
} from 'src/app/shared/validators/ai-cards';
import {
  AiChatService,
  AiThreadMessage,
} from 'src/app/modules/ai-workspace/services/ai-chat.service';
import { AiConfigService } from 'src/app/modules/ai-workspace/services/ai-config.service';
import { AiLauncherService } from 'src/app/shared/services/ai-launcher.service';

/**
 * ai-launcher — the docked, always-available AI panel + its floating
 * trigger. Mounted once at the home-shell root (like global-search and
 * notification-modal) so it overlays every in-app page.
 *
 * The floating button appears only when the org has AI configured
 * (AiConfigService.health) AND the user holds the aiWorkspace permission
 * (the *hasPermission directive in the template). Clicking it slides in a
 * right-docked panel hosting a lightweight inline thread + composer.
 *
 * This panel is the ONLY AI surface (there is no full-page route) — it is
 * deliberately COMPACT and self-contained. It renders a lean, text-first
 * view of each card rather than pulling the heavy card components (and their
 * ECharts dependency) into the eager shell bundle: SQL cards offer copy +
 * "open in SQL Workspace"; data-heavy cards (result grid, schema, chart)
 * show a compact summary label. Rich in-panel rendering is intentionally
 * out of scope to keep the always-mounted shell lean.
 *
 * Writes go through the GUARDED execute path: confirm cards POST to
 * `/ai/confirm` (never the target endpoint directly), which re-validates
 * the payload against the proposing tool's schema, re-checks the acting
 * user's RBAC, runs the real guarded controller in-process, and audit-logs
 * it (source:'ai'). Dataset drafts still POST /datasets directly (that is a
 * plain form save the user authors, not a Dex proposal).
 *
 * Destructive proposals (card.destructive) are gated behind an explicit
 * arm-then-confirm step and rendered with a warning treatment. Any proposal
 * can be edited inline (a compact key/value editor over card.payload) before
 * approval. Where a create returns a new id and the entity is deletable, a
 * one-tap Undo is offered on the success toast — never faked.
 */
/**
 * One row in the compact inline proposal editor. `editable` is false for
 * object/array payload fields (shown read-only); `original` preserves the
 * source JSON type so a committed edit is coerced back to it.
 */
interface EditRow {
  key: string;
  value: string;
  editable: boolean;
  original: unknown;
}

/** Presentational-only per-confirm-card state (never serialised). */
interface CardUiState {
  /** Destructive proposal armed (first click) → awaiting the confirm click. */
  armed: boolean;
  /** Execution in flight. */
  busy: boolean;
  /** Inline key/value editor open. */
  editing: boolean;
  /** The editable rows in the inline editor. */
  rows: EditRow[];
  /**
   * A trivially-reversible action offered after a successful create: the
   * compensating DELETE endpoint. Null when no honest Undo is available.
   */
  undo: { endpoint: string } | null;
}

@Component({
  selector: 'app-ai-launcher',
  templateUrl: './ai-launcher.component.html',
  styleUrls: ['./ai-launcher.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiLauncherComponent implements OnInit {
  /**
   * True when the org has AI enabled AND configured (from the /ai/health
   * probe run at shell load). This gates the ENTIRE Dex surface — bubble and
   * panel both render only when true (combined with the aiWorkspace
   * permission). If AI is off nothing appears; admins turn it on from
   * System Settings → AI Features, not from here. Starts false until the
   * probe resolves, so Dex never flashes in before we know it's ready.
   */
  readonly configured = computed(() => {
    const h = this.config.health();
    return !!h && h.enabled && h.configured;
  });

  /** The compact composer's text. */
  draft = '';

  /**
   * Starter prompts shown on the welcome (configured + empty) state. Clicking
   * one drops it into the composer so the user can tweak before sending —
   * turns the blank panel into an inviting launchpad. i18n keys resolve to
   * DBExec-flavoured tasks (schema / query / dataset).
   */
  readonly starters: ReadonlyArray<{ key: string; icon: string }> = [
    { key: 'AI_WORKSPACE.LAUNCHER.STARTER_SCHEMA', icon: 'pi-sitemap' },
    { key: 'AI_WORKSPACE.LAUNCHER.STARTER_QUERY', icon: 'pi-database' },
    { key: 'AI_WORKSPACE.LAUNCHER.STARTER_DATASET', icon: 'pi-table' },
  ];

  /** Drop a starter prompt into the composer, focused for editing/sending. */
  useStarter(s: { key: string }): void {
    this.draft = this.translate.instant(s.key);
  }

  constructor(
    public launcher: AiLauncherService,
    public chat: AiChatService,
    private config: AiConfigService,
    private translate: TranslateService,
    private http: HttpClientService,
    private router: Router,
    private message: MessageService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Probe health once so the FAB can decide whether to show. Cheap and
    // cached in the service; safe to call on every shell load.
    this.config.refreshHealth();
  }

  toggle(): void {
    this.launcher.toggle();
  }

  /** Flip between the right-sidebar panel and the centered overlay. */
  toggleMode(): void {
    this.launcher.toggleMode();
  }

  close(): void {
    this.launcher.close();
  }

  onSend(text: string): void {
    if (text.startsWith('@starter:')) {
      const key = text.slice('@starter:'.length);
      this.chat.send(this.translate.instant(key));
      return;
    }
    this.chat.send(text);
  }

  /** Submit the compact composer. */
  composerSubmit(): void {
    const value = this.draft.trim();
    if (!value || this.chat.streaming()) return;
    this.chat.send(value);
    this.draft = '';
  }

  /** Enter submits; Shift+Enter inserts a newline. */
  onEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (ke.shiftKey) return;
    ke.preventDefault();
    this.composerSubmit();
  }

  newChat(): void {
    this.chat.newConversation();
  }

  // ── card affordances (compact) ─────────────────────────────────────

  /** Copy generated SQL to the clipboard. */
  copySql(card: SqlCard): void {
    try {
      navigator.clipboard?.writeText(card.sql);
      this.toast('success', this.translate.instant('AI_WORKSPACE.COPIED'), '');
    } catch {
      /* clipboard unavailable */
    }
  }

  /** Stash SQL as the executor draft and open the standalone workspace. */
  openSql(card: SqlCard): void {
    if (!card.connectionId) return;
    try {
      localStorage.setItem(`qx-draft:${card.connectionId}`, card.sql);
    } catch {
      /* storage disabled */
    }
    window.open(
      `${QUERY_RUNNER.EXEC}?conn=${encodeURIComponent(card.connectionId)}`,
      '_blank',
    );
  }

  // ── confirm-card write gate (guarded execute) ─────────────────────
  //
  // Per-card ephemeral UI state, keyed by the card object's identity (cards
  // are stable objects inside the message array). Holds the destructive
  // arm flag, the in-progress flag, and the inline-edit model. Never
  // serialised — purely presentational.
  private readonly cardState = new WeakMap<ConfirmCard, CardUiState>();

  private stateFor(card: ConfirmCard): CardUiState {
    let s = this.cardState.get(card);
    if (!s) {
      s = { armed: false, busy: false, editing: false, rows: [], undo: null };
      this.cardState.set(card, s);
    }
    return s;
  }

  /** True while this proposal is executing (drives the button spinner). */
  isBusy(card: ConfirmCard): boolean {
    return this.stateFor(card).busy;
  }

  /**
   * True once a destructive proposal has been "armed" (first click). The
   * template then shows the explicit "Confirm delete" button; a second
   * click actually executes. Non-destructive cards are never armed.
   */
  isArmed(card: ConfirmCard): boolean {
    return this.stateFor(card).armed;
  }

  /** True while the compact key/value editor is open for this proposal. */
  isEditing(card: ConfirmCard): boolean {
    return this.stateFor(card).editing;
  }

  /** The editable rows bound in the inline editor. */
  editRows(card: ConfirmCard): EditRow[] {
    return this.stateFor(card).rows;
  }

  /**
   * Open the compact editor: flatten the proposal's simple (scalar) payload
   * fields into editable rows. Object/array fields are shown read-only (the
   * editor is intentionally simple — for fixing a name/email/flag, not
   * restructuring the body).
   */
  startEdit(card: ConfirmCard): void {
    const s = this.stateFor(card);
    const payload = (card.payload ?? {}) as Record<string, unknown>;
    s.rows = Object.keys(payload).map(key => {
      const v = payload[key];
      const simple =
        v === null ||
        v === undefined ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean';
      return {
        key,
        value: v === null || v === undefined ? '' : String(v),
        editable: simple,
        original: v,
      };
    });
    s.editing = true;
  }

  /** Discard edits and close the editor. */
  cancelEdit(card: ConfirmCard): void {
    const s = this.stateFor(card);
    s.editing = false;
    s.rows = [];
  }

  /**
   * Commit the editor back into card.payload. Scalars are coerced to match
   * their original JSON type (number stays number, boolean stays boolean);
   * read-only fields are left untouched. The BE re-validates the edited
   * payload against the real endpoint schema, so a bad edit fails cleanly at
   * /ai/confirm rather than being trusted.
   */
  commitEdit(card: ConfirmCard): void {
    const s = this.stateFor(card);
    const payload = { ...((card.payload ?? {}) as Record<string, unknown>) };
    for (const row of s.rows) {
      if (!row.editable) continue;
      payload[row.key] = this.coerce(row.value, row.original);
    }
    card.payload = payload;
    s.editing = false;
    s.rows = [];
  }

  private coerce(value: string, original: unknown): unknown {
    if (typeof original === 'number') {
      const n = Number(value);
      return value.trim() === '' || Number.isNaN(n) ? value : n;
    }
    if (typeof original === 'boolean') {
      return value === 'true' || value === '1';
    }
    return value;
  }

  /**
   * Approve a proposal → run it through the GUARDED execute path.
   *
   * Destructive proposals require an explicit arm-then-confirm: the first
   * click arms (template swaps in the warning button + line), the second
   * executes. Non-destructive proposals execute on the first click.
   *
   * Execution POSTs { endpoint, method, payload, proposalId } to
   * `/ai/confirm` — NOT the target endpoint. That guard re-validates the
   * payload, re-checks RBAC for the acting user, runs the real controller
   * in-process, and audit-logs it. The BE relays the executed endpoint's
   * own envelope; we treat only code:200 / status:true as success.
   */
  confirm(card: ConfirmCard): void {
    if (this.confirmInert(card)) return;
    const s = this.stateFor(card);
    if (s.busy) return;
    if (card.destructive && !s.armed) {
      s.armed = true;
      return;
    }
    s.busy = true;
    this.http
      .apiPost(
        AI_API.CONFIRM,
        {
          endpoint: card.endpoint,
          method: card.method,
          payload: card.payload ?? {},
          proposalId: card.proposalId ?? '',
        },
        { skipLoader: true },
      )
      .subscribe({
        next: (res: any) => {
          s.busy = false;
          // The BE relays the target endpoint's envelope verbatim; the
          // http interceptor unwraps envelope-carrying 4xx into this
          // success channel, so re-validation/RBAC rejections land here as
          // code !== 200. Only a real 200 is a success.
          if (res?.code === 200 || res?.status === true) {
            s.armed = false;
            this.toast(
              'success',
              this.translate.instant('AI_WORKSPACE.APPLY.DONE_TITLE'),
              card.summary,
            );
            this.chat.noteAssistant(
              this.translate.instant('AI_WORKSPACE.APPLY.CONFIRMED', {
                summary: card.summary,
              }),
            );
            (card as { inert?: boolean }).inert = true;
            this.stashUndo(card, s, res);
          } else {
            this.applyFailed(res?.message);
          }
          this.cdr.markForCheck();
        },
        error: () => {
          s.busy = false;
          this.applyFailed();
          this.cdr.markForCheck();
        },
      });
  }

  /**
   * Stash a one-tap Undo where the action is trivially reversible: a create
   * that returned a new id, for an entity whose delete is a bare
   * `${endpoint}/${id}`. We only offer it when we can honestly perform it —
   * otherwise no Undo is shown (we never fake one). The Undo runs back
   * through the same guarded `/ai/confirm` path (method DELETE), so it is
   * re-permissioned + audited like any other write. Rendered as an inline
   * action on the now-inert card (the shell has no toast-action template).
   */
  private stashUndo(card: ConfirmCard, s: CardUiState, res: any): void {
    if (card.action !== 'create' || card.method !== 'POST') return;
    const data = res?.data ?? {};
    const id =
      data.id ??
      data.savedUser?.id ??
      data.user?.id ??
      data.role?.id ??
      data.group?.id ??
      data.savedDataset?.id ??
      null;
    if (!id) return;
    s.undo = { endpoint: `${card.endpoint.replace(/\/$/, '')}/${id}` };
  }

  /** True when a successful create left a reversible Undo on this card. */
  hasUndo(card: ConfirmCard): boolean {
    return !!this.stateFor(card).undo;
  }

  /** Run the compensating delete for an undone create (guarded path). */
  runUndo(card: ConfirmCard): void {
    const s = this.stateFor(card);
    const target = s.undo;
    if (!target || s.busy) return;
    s.busy = true;
    this.http
      .apiPost(
        AI_API.CONFIRM,
        { endpoint: target.endpoint, method: 'DELETE', payload: {} },
        { skipLoader: true },
      )
      .subscribe({
        next: (res: any) => {
          s.busy = false;
          if (res?.code === 200 || res?.status === true) {
            s.undo = null;
            this.toast(
              'info',
              this.translate.instant('AI_WORKSPACE.UNDO.DONE_TITLE'),
              card.summary,
            );
          } else {
            this.toast(
              'error',
              this.translate.instant('AI_WORKSPACE.UNDO.FAILED_TITLE'),
              res?.message ||
                this.translate.instant('AI_WORKSPACE.UNDO.FAILED'),
            );
          }
          this.cdr.markForCheck();
        },
        error: () => {
          s.busy = false;
          this.toast(
            'error',
            this.translate.instant('AI_WORKSPACE.UNDO.FAILED_TITLE'),
            this.translate.instant('AI_WORKSPACE.UNDO.FAILED'),
          );
          this.cdr.markForCheck();
        },
      });
  }

  /** Persist a proposed dataset and deep-link to it. */
  saveDataset(draft: DatasetDraftCard): void {
    if (draft.readOnly) return;
    this.http
      .apiPost(
        DATASET_API.ADD,
        {
          name: draft.name,
          description: draft.description ?? '',
          datasource: draft.datasourceId,
          sql: draft.sql,
        },
        { skipLoader: true },
      )
      .subscribe({
        next: (res: any) => {
          const id = res?.data?.savedDataset?.id ?? res?.data?.id ?? null;
          this.toast(
            'success',
            this.translate.instant('AI_WORKSPACE.APPLY.DATASET_SAVED_TITLE'),
            draft.name,
          );
          this.chat.noteAssistant(
            this.translate.instant('AI_WORKSPACE.APPLY.DATASET_SAVED', {
              name: draft.name,
            }),
          );
          if (id) {
            this.launcher.close();
            this.router.navigate([DATASET_ROUTE.view(id)]);
          }
        },
        error: () => this.applyFailed(),
      });
  }

  // ── compact card view helpers (template reads these) ───────────────

  isSql(card: AiCard): card is SqlCard {
    return card.kind === 'sql';
  }
  isConfirm(card: AiCard): card is ConfirmCard {
    return card.kind === 'confirm';
  }
  isDatasetDraft(card: AiCard): card is DatasetDraftCard {
    return card.kind === 'dataset_draft';
  }
  isError(card: AiCard): boolean {
    return card.kind === 'error';
  }

  /** A one-line label for cards the compact view shows as a chip + link. */
  cardLabel(card: AiCard): string {
    switch (card.kind) {
      case 'result_grid':
        return this.translate.instant('AI_WORKSPACE.ROWS', {
          count: card.rowCount,
        });
      case 'schema':
        return this.translate.instant('AI_WORKSPACE.CARD_COMPACT.SCHEMA');
      case 'connections':
        return this.translate.instant('AI_WORKSPACE.CARD_COMPACT.CONNECTIONS', {
          count: card.items.length,
        });
      case 'table':
        return card.title;
      case 'visual_preview':
        return this.translate.instant('AI_WORKSPACE.CARD_COMPACT.VISUAL', {
          type: card.chartType,
        });
      default:
        return '';
    }
  }

  /** True for cards whose full rendering lives on the workspace page. */
  isRichCard(card: AiCard): boolean {
    return (
      card.kind === 'result_grid' ||
      card.kind === 'schema' ||
      card.kind === 'connections' ||
      card.kind === 'table' ||
      card.kind === 'visual_preview'
    );
  }

  confirmInert(card: ConfirmCard): boolean {
    return (card as { inert?: boolean }).inert === true;
  }

  trackMessage(index: number): number {
    return index;
  }
  trackCard(index: number): number {
    return index;
  }
  /** Track top-level steps by their stable toolCallId (OnPush-friendly). */
  trackStep(_index: number, step: { toolCallId: string }): string {
    return step.toolCallId;
  }

  asConfirm(card: AiCard): ConfirmCard {
    return card as ConfirmCard;
  }
  asSql(card: AiCard): SqlCard {
    return card as SqlCard;
  }
  asDatasetDraft(card: AiCard): DatasetDraftCard {
    return card as DatasetDraftCard;
  }

  private applyFailed(detail?: string): void {
    this.toast(
      'error',
      this.translate.instant('AI_WORKSPACE.APPLY.FAILED_TITLE'),
      detail || this.translate.instant('AI_WORKSPACE.APPLY.FAILED'),
    );
  }

  private toast(
    severity: 'success' | 'error' | 'warn' | 'info',
    summary: string,
    detail: string,
  ): void {
    // Route through the app's single mounted p-toast (key 'topRight'), the
    // same channel handleSuccessService uses — a keyless message renders
    // nowhere.
    this.message.add({
      severity,
      summary,
      detail,
      key: 'topRight',
      life: 3000,
      styleClass: 'custom-toast',
    });
  }

  // Exposed for the template's typed *ngFor over messages.
  messages(): AiThreadMessage[] {
    return this.chat.messages();
  }
}
