import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { DATASET as DATASET_API } from 'src/app/core/constants/api.constant';
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
 * Writes go through the user's own session: confirm cards fire their
 * self-described endpoint (the endpoint's permission middleware is the
 * authority), dataset saves POST /datasets.
 */
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
      this.toast(
        'success',
        this.translate.instant('AI_WORKSPACE.COPIED'),
        '',
      );
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

  /** Fire a confirm card's self-described guarded endpoint. */
  confirm(card: ConfirmCard): void {
    if ((card as { inert?: boolean }).inert) return;
    const opts = { skipLoader: true };
    const body = card.payload ?? {};
    const req =
      card.method === 'POST'
        ? this.http.apiPost(card.endpoint, body, opts)
        : card.method === 'PUT'
          ? this.http.apiPut(card.endpoint, body, opts)
          : this.http.apiDelete(card.endpoint, opts);
    req.subscribe({
      next: () => {
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
      },
      error: () => this.applyFailed(),
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

  asConfirm(card: AiCard): ConfirmCard {
    return card as ConfirmCard;
  }
  asSql(card: AiCard): SqlCard {
    return card as SqlCard;
  }
  asDatasetDraft(card: AiCard): DatasetDraftCard {
    return card as DatasetDraftCard;
  }

  private applyFailed(): void {
    this.toast(
      'error',
      this.translate.instant('AI_WORKSPACE.APPLY.FAILED_TITLE'),
      this.translate.instant('AI_WORKSPACE.APPLY.FAILED'),
    );
  }

  private toast(
    severity: 'success' | 'error' | 'warn' | 'info',
    summary: string,
    detail: string,
  ): void {
    this.message.add({ severity, summary, detail });
  }

  // Exposed for the template's typed *ngFor over messages.
  messages(): AiThreadMessage[] {
    return this.chat.messages();
  }
}
