import { Injectable, computed, signal } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { AI_WORKSPACE } from 'src/app/core/constants/api.constant';
import { environment } from 'src/environments/environment';
import type { AiCard } from 'src/app/shared/validators/ai-cards';
import { AiScreenContextService } from 'src/app/shared/services/ai-screen-context.service';

/**
 * A sub-agent's own streamed event, nested inside a `subagent_event`
 * envelope. Mirror of the BE `SubAgentEvent` union (engine/types.ts): the
 * top-level stream MINUS the framing a sub-agent can't emit (no `routing`,
 * `done`, or the delegate_* / subagent_event trio — a sub-agent never
 * delegates further). The join key is `toolCallId` on the enclosing
 * `subagent_event`.
 */
type SubAgentEvent =
  | { type: 'message_delta'; text: string }
  | {
      type: 'tool_start';
      toolCallId: string;
      name: string;
      label: string;
      apiLabel?: string;
    }
  | {
      type: 'tool_end';
      toolCallId: string;
      name: string;
      apiLabel?: string;
      card?: AiCard;
      resultPreview?: string;
      isError?: boolean;
    }
  | { type: 'card'; card: AiCard }
  | { type: 'error'; message: string; kind: string };

/**
 * An AgentEvent as received off the socket (mirror of the BE union in
 * engine/types.ts). Tool + delegate events carry a `toolCallId` join key
 * plus `startedAt`/`endedAt` epoch-ms timestamps for the live elapsed
 * timer + done-state duration badge. Delegation streams a `delegate_start`
 * → 1..N `subagent_event` (same `toolCallId`) → `delegate_end`.
 */
type AgentEvent =
  | { type: 'ready' }
  | { type: 'routing'; agent: string }
  | { type: 'message_delta'; text: string }
  | {
      type: 'tool_start';
      toolCallId: string;
      name: string;
      label: string;
      apiLabel?: string;
      startedAt: number;
    }
  | {
      type: 'tool_end';
      toolCallId: string;
      name: string;
      apiLabel?: string;
      card?: AiCard;
      resultPreview?: string;
      isError?: boolean;
      endedAt: number;
    }
  | {
      type: 'delegate_start';
      toolCallId: string;
      agent: string;
      label: string;
      index: number;
      total: number;
      startedAt: number;
    }
  | {
      type: 'subagent_event';
      toolCallId: string;
      agent: string;
      event: SubAgentEvent;
    }
  | {
      type: 'delegate_end';
      toolCallId: string;
      agent: string;
      isError?: boolean;
      endedAt: number;
    }
  | { type: 'card'; card: AiCard }
  | { type: 'done'; conversationId: string; messageId: string }
  | { type: 'error'; message: string; kind: string };

/** Live-computation step status. */
export type AiStepStatus = 'running' | 'done' | 'error';

/**
 * One node in a message's live-computation tree (design §F). A plain tool
 * call is a leaf; a delegate call carries `subAgents` — each of which has
 * its OWN `steps` (the sub-agent's tool calls), recursively. Nesting is
 * bounded to one level (supervisor → specialist) by the engine.
 */
export interface ToolStep {
  toolCallId: string;
  name: string;
  label: string;
  /** Short HTTP label for the live "which API" line, e.g. `GET /users`. */
  apiLabel?: string;
  status: AiStepStatus;
  startedAt: number;
  endedAt?: number;
  /** Short scrubbed JSON snippet — the collapsed `{}` chip. */
  resultPreview?: string;
  card?: AiCard;
  /** Present when this step is a delegate; each is one specialist run. */
  subAgents?: SubAgentStep[];
  expanded?: boolean;
}

/** One delegated specialist run nested under a delegate `ToolStep`. */
export interface SubAgentStep {
  agent: string;
  label: string;
  index?: number;
  total?: number;
  status: AiStepStatus;
  startedAt?: number;
  endedAt?: number;
  /** The sub-agent's own tool steps. */
  steps: ToolStep[];
  /** The sub-agent's streamed text. */
  text: string;
  expanded?: boolean;
}

/** One message rendered in the thread. */
export interface AiThreadMessage {
  role: 'user' | 'assistant';
  text: string;
  cards: AiCard[];
  /** The nested live-computation tree (delegate + tool steps). */
  steps: ToolStep[];
  routedAgent?: string;
  progress?: string[];
}

export interface AiConversationSummary {
  id: string;
  title: string | null;
  updatedOn?: string;
}

/** Socket connection lifecycle state. */
export type AiSocketState = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * AiChatService — owns the chat transcript + a PERSISTENT WebSocket to
 * the AI engine. One socket carries every message (no per-message HTTP);
 * the socket auto-connects on first send and auto-reconnects with backoff
 * after an unexpected drop. AgentEvents stream back over the same socket
 * and update signals live so the thread paints incrementally.
 *
 * The reducer builds a nested step tree keyed by `toolCallId`: supervisor
 * tool calls are leaf `ToolStep`s; `delegate_*` opens a delegate step whose
 * `subagent_event`s stream a specialist's own transcript into its
 * `SubAgentStep`. There is NO screen context — agents pull domain context
 * via tools, so the outbound frame never carries a screen snapshot.
 *
 * Conversation history (list + reopen) still uses plain REST — those are
 * one-shot reads, not the hot streaming path.
 */
@Injectable({ providedIn: 'root' })
export class AiChatService {
  private _messages = signal<AiThreadMessage[]>([]);
  private _streaming = signal(false);
  private _conversationId = signal<string | null>(null);
  private _routedAgent = signal<string>('');
  private _conversations = signal<AiConversationSummary[]>([]);
  private _socketState = signal<AiSocketState>('idle');
  /** The live tool step currently running (drives the activity line). */
  private _activeStep = signal<{ apiLabel?: string; label: string } | null>(
    null,
  );

  readonly messages = this._messages.asReadonly();
  readonly streaming = this._streaming.asReadonly();
  readonly routedAgent = this._routedAgent.asReadonly();
  readonly conversationId = this._conversationId.asReadonly();
  readonly conversations = this._conversations.asReadonly();
  readonly socketState = this._socketState.asReadonly();
  readonly isEmpty = computed(() => this._messages().length === 0);

  /**
   * The live agent/API activity line: which agent is handling the turn and
   * the API it's calling right now, e.g. { agent: 'Access', api: 'GET
   * /users' }. Null when nothing is running. Drives the compact real-time
   * telemetry line in the panel.
   */
  readonly activity = computed<{ agent: string; api?: string; label?: string } | null>(
    () => {
      if (!this._streaming()) return null;
      const step = this._activeStep();
      const agent = this._routedAgent();
      if (!step && !agent) return null;
      return {
        agent: agent || 'DBExecAI',
        api: step?.apiLabel,
        label: step?.label,
      };
    },
  );

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  /** Index of the assistant bubble currently being streamed into. */
  private streamingIdx = -1;
  /** A message queued to send once the socket opens. */
  private pending: { message: string } | null = null;
  /** Intentional close (newConversation / destroy) suppresses reconnect. */
  private closingIntentionally = false;

  constructor(
    private http: HttpClientService,
    private screenCtx: AiScreenContextService,
  ) {}

  /** Start a fresh conversation (clears the transcript; keeps the socket). */
  newConversation(): void {
    this.cancel();
    this._messages.set([]);
    this._conversationId.set(null);
    this._routedAgent.set('');
  }

  /**
   * Append a standalone assistant note to the transcript. Used to reflect
   * the outcome of a client-side apply (a confirmed write, a saved dataset)
   * so the thread stays an honest record of what happened — these notes are
   * view-only and not sent to the engine.
   */
  noteAssistant(text: string): void {
    if (!text) return;
    this._messages.update(m => [
      ...m,
      { role: 'assistant', text, cards: [], steps: [] },
    ]);
  }

  /** Send a user message; opens the socket lazily and streams the reply. */
  send(message: string): void {
    const text = message.trim();
    if (!text || this._streaming()) return;

    // Append the user message + an empty assistant bubble to fill in.
    this._messages.update(m => [
      ...m,
      { role: 'user', text, cards: [], steps: [] },
      { role: 'assistant', text: '', cards: [], steps: [], progress: [] },
    ]);
    this.streamingIdx = this._messages().length - 1;
    this._streaming.set(true);
    this._activeStep.set(null);
    this._routedAgent.set('');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.transmit(text);
    } else {
      // Queue it and (re)connect.
      this.pending = { message: text };
      this.connect();
    }
  }

  /** Cancel an in-flight stream (server aborts provider + query). */
  cancel(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this._streaming()) {
      try {
        this.ws.send(JSON.stringify({ type: 'cancel' }));
      } catch {
        /* ignore */
      }
    }
    this._streaming.set(false);
    this._activeStep.set(null);
  }

  /** Tear down the socket (e.g. on logout). */
  disconnect(): void {
    this.closingIntentionally = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this._socketState.set('closed');
  }

  // ── Socket lifecycle ───────────────────────────────────────────────

  private connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.closingIntentionally = false;
    this._socketState.set('connecting');
    const token = StorageService.get(StorageType.ACCESS_TOKEN) || '';
    // The AI WebSocket lives on the dbexec-ai BFF when `aiServer` is set
    // (e.g. http://host:3001/ai/v1 → ws://host:3001/ai/v1/ws). When it is
    // not set, fall back to the embedded engine on the main API
    // (apiServer + /ai/ws) so the FE works with either topology.
    const aiServer = environment.aiServer;
    const httpBase = aiServer
      ? `${aiServer.replace(/\/+$/, '')}/ws`
      : `${(environment.apiServer ?? '').replace(/\/+$/, '')}${AI_WORKSPACE.WS}`;
    const base = httpBase.replace(/^http/, 'ws');
    const url = `${base}?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._socketState.set('open');
      this.reconnectAttempts = 0;
      // Flush a queued message once the socket is ready.
      if (this.pending) {
        const { message } = this.pending;
        this.pending = null;
        this.transmit(message);
      }
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      let event: AgentEvent;
      try {
        event = JSON.parse(ev.data) as AgentEvent;
      } catch {
        return;
      }
      this.applyEvent(event);
    };

    this.ws.onerror = () => {
      // onclose will follow and drive reconnect.
    };

    this.ws.onclose = () => {
      this.ws = null;
      this._socketState.set('closed');
      // If a turn was mid-flight, surface a connection error on it.
      if (this._streaming() && this.streamingIdx >= 0) {
        this.patchAssistant(this.streamingIdx, msg => {
          msg.progress = [];
          msg.cards.push({ kind: 'error', message: 'Connection lost.' });
        });
        this._streaming.set(false);
        this._activeStep.set(null);
      }
      if (!this.closingIntentionally) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.closingIntentionally) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /**
   * Send a chat frame over the open socket. The frame carries the message,
   * the optional conversation id, and — new — the SCREEN the user is on so
   * the BE can scope the turn to the current module's specialist (e.g. on
   * /users → the Access agent, limited to Users/Groups/Roles). The screen is
   * a hint; the agent still pulls domain context (session, datetime) via
   * tools.
   */
  private transmit(message: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const screen = this.screenCtx.screen();
    const framedScreen = screen
      ? {
          module: screen.module,
          view: screen.view,
          recordId: screen.recordId,
          label: screen.label,
        }
      : undefined;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'chat',
          message,
          conversationId: this._conversationId() ?? undefined,
          screen: framedScreen,
        }),
      );
    } catch {
      this.patchAssistant(this.streamingIdx, msg => {
        msg.cards.push({
          kind: 'error',
          message: 'Could not send the message.',
        });
      });
      this._streaming.set(false);
    }
  }

  // ── Event reducer (nested step tree, keyed by toolCallId) ──────────

  /** Apply one AgentEvent to the streaming assistant message. */
  private applyEvent(event: AgentEvent): void {
    const idx = this.streamingIdx;
    switch (event.type) {
      case 'ready':
        break; // socket authenticated; nothing to render
      case 'routing':
        this._routedAgent.set(event.agent);
        this.patchAssistant(idx, m => (m.routedAgent = event.agent));
        break;
      case 'message_delta':
        // Top-level supervisor text.
        this.patchAssistant(idx, m => (m.text += event.text));
        break;
      case 'tool_start':
        this._activeStep.set({ apiLabel: event.apiLabel, label: event.label });
        this.patchAssistant(idx, m => {
          m.progress = [...(m.progress ?? []), event.label];
          m.steps.push({
            toolCallId: event.toolCallId,
            name: event.name,
            label: event.label,
            apiLabel: event.apiLabel,
            status: 'running',
            startedAt: event.startedAt,
          });
        });
        break;
      case 'tool_end':
        this._activeStep.set(null);
        this.patchAssistant(idx, m => {
          const step = this.findStep(m.steps, event.toolCallId);
          if (step) {
            step.status = event.isError ? 'error' : 'done';
            step.endedAt = event.endedAt;
            if (event.apiLabel !== undefined) step.apiLabel = event.apiLabel;
            if (event.resultPreview !== undefined)
              step.resultPreview = event.resultPreview;
            if (event.card) step.card = event.card;
          }
          if (event.card) m.cards.push(event.card);
        });
        break;
      case 'delegate_start':
        this.patchAssistant(idx, m => {
          m.progress = [...(m.progress ?? []), event.label];
          m.steps.push({
            toolCallId: event.toolCallId,
            name: event.agent,
            label: event.label,
            status: 'running',
            startedAt: event.startedAt,
            subAgents: [
              {
                agent: event.agent,
                label: event.label,
                index: event.index,
                total: event.total,
                status: 'running',
                startedAt: event.startedAt,
                steps: [],
                text: '',
              },
            ],
          });
        });
        break;
      case 'subagent_event':
        this.patchAssistant(idx, m => {
          const parent = this.findStep(m.steps, event.toolCallId);
          const sub = parent?.subAgents?.[0];
          if (sub) this.applySubEvent(sub, event.event);
        });
        break;
      case 'delegate_end':
        this.patchAssistant(idx, m => {
          const parent = this.findStep(m.steps, event.toolCallId);
          if (!parent) return;
          const status: AiStepStatus = event.isError ? 'error' : 'done';
          parent.status = status;
          parent.endedAt = event.endedAt;
          const sub = parent.subAgents?.[0];
          if (sub) {
            sub.status = status;
            sub.endedAt = event.endedAt;
          }
        });
        break;
      case 'card':
        this.patchAssistant(idx, m => m.cards.push(event.card));
        break;
      case 'done':
        this._conversationId.set(event.conversationId);
        this.patchAssistant(idx, m => (m.progress = []));
        this._activeStep.set(null);
        this._streaming.set(false);
        break;
      case 'error':
        this.patchAssistant(idx, m => {
          m.progress = [];
          m.cards.push({ kind: 'error', message: event.message });
        });
        this._activeStep.set(null);
        this._streaming.set(false);
        break;
    }
  }

  /** Route one sub-agent event into its SubAgentStep (mutates in place). */
  private applySubEvent(sub: SubAgentStep, ev: SubAgentEvent): void {
    switch (ev.type) {
      case 'message_delta':
        sub.text += ev.text;
        break;
      case 'tool_start':
        sub.steps.push({
          toolCallId: ev.toolCallId,
          name: ev.name,
          label: ev.label,
          apiLabel: ev.apiLabel,
          status: 'running',
          startedAt: Date.now(),
        });
        break;
      case 'tool_end': {
        const step = this.findStep(sub.steps, ev.toolCallId);
        if (step) {
          step.status = ev.isError ? 'error' : 'done';
          step.endedAt = Date.now();
          if (ev.apiLabel !== undefined) step.apiLabel = ev.apiLabel;
          if (ev.resultPreview !== undefined)
            step.resultPreview = ev.resultPreview;
          if (ev.card) step.card = ev.card;
        }
        break;
      }
      case 'card':
        // Attach to the sub-agent's most recent step, else its last step.
        if (sub.steps.length) sub.steps[sub.steps.length - 1].card = ev.card;
        break;
      case 'error':
        sub.status = 'error';
        break;
    }
  }

  /** Find a step by toolCallId within a step list (one shallow level). */
  private findStep(
    steps: ToolStep[],
    toolCallId: string,
  ): ToolStep | undefined {
    return steps.find(s => s.toolCallId === toolCallId);
  }

  /**
   * Immutably patch the assistant message at `idx` (OnPush-safe). Clones
   * the message + its `cards`/`steps` arrays; the reducer mutates the
   * freshly-cloned nodes, then the new message replaces the old in a new
   * list so signals fire and OnPush repaints.
   */
  private patchAssistant(idx: number, fn: (m: AiThreadMessage) => void): void {
    if (idx < 0) return;
    this._messages.update(list => {
      if (idx >= list.length) return list;
      const next = list.slice();
      const msg = {
        ...next[idx],
        cards: next[idx].cards.slice(),
        steps: this.cloneSteps(next[idx].steps),
      };
      fn(msg);
      next[idx] = msg;
      return next;
    });
  }

  /** Deep-clone the step tree so in-place reducer mutation stays OnPush-safe. */
  private cloneSteps(steps: ToolStep[]): ToolStep[] {
    return steps.map(s => ({
      ...s,
      subAgents: s.subAgents?.map(sa => ({
        ...sa,
        steps: this.cloneSteps(sa.steps),
      })),
    }));
  }

  // ── Conversation history (plain REST — cold reads) ─────────────────
  //
  // When the dbexec-ai BFF is configured (`aiServer`), AI REST goes there as
  // an ABSOLUTE URL — and because the http interceptor skips auth on absolute
  // URLs, we attach the x-auth-token ourselves. Endpoint shape differs: the
  // BFF exposes /conversations (base path already /ai/v1); the embedded engine
  // on the main API exposes /ai/conversations via the interceptor. `aiGet`
  // hides that difference so callers use one relative-ish path.

  /** Absolute BFF URL for an AI path, or '' when no BFF (use interceptor). */
  private aiAbsolute(bffPath: string): string {
    const ai = environment.aiServer;
    return ai ? `${ai.replace(/\/+$/, '')}${bffPath}` : '';
  }

  /** GET an AI REST resource from the BFF (absolute + token) or the main API. */
  private aiGet<T>(bffPath: string, mainApiPath: string) {
    const abs = this.aiAbsolute(bffPath);
    if (abs) {
      const token = StorageService.get(StorageType.ACCESS_TOKEN) || '';
      const headers = new HttpHeaders({ 'x-auth-token': token });
      return this.http.apiGet<T>(abs, { skipLoader: true, headers });
    }
    return this.http.apiGet<T>(mainApiPath, { skipLoader: true });
  }

  /**
   * Execute an approved write proposal through the guarded confirm path. Goes
   * to the dbexec-ai BFF's POST /confirm when configured (absolute + token),
   * else the main API's embedded /ai/confirm via the interceptor. Returns the
   * relayed envelope so the caller decides success by { code/status }.
   */
  confirmAction(body: {
    endpoint: string;
    method: string;
    payload: Record<string, unknown>;
    proposalId?: string;
  }) {
    const abs = this.aiAbsolute('/confirm');
    if (abs) {
      const token = StorageService.get(StorageType.ACCESS_TOKEN) || '';
      const headers = new HttpHeaders({ 'x-auth-token': token });
      return this.http.apiPost(abs, body, { skipLoader: true, headers });
    }
    return this.http.apiPost(AI_WORKSPACE.CONFIRM, body, { skipLoader: true });
  }

  loadConversations(): void {
    this.aiGet<{ data?: { items?: AiConversationSummary[] } }>(
      '/conversations',
      AI_WORKSPACE.CONVERSATIONS,
    ).subscribe({
      next: res => this._conversations.set(res?.data?.items ?? []),
      error: () => this._conversations.set([]),
    });
  }

  openConversation(id: string): void {
    this.cancel();
    this._conversationId.set(id);
    this.aiGet<{
      data?: {
        messages?: Array<{
          role: string;
          content: string | null;
          cards: AiCard[] | null;
          routedAgent: string | null;
        }>;
      };
    }>(`/conversations/${id}`, `${AI_WORKSPACE.CONVERSATION}${id}`)
      .subscribe({
        next: res => {
          const msgs = res?.data?.messages ?? [];
          this._messages.set(
            msgs
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map(m => ({
                role: m.role as 'user' | 'assistant',
                text: m.content ?? '',
                cards: m.cards ?? [],
                steps: [],
                routedAgent: m.routedAgent ?? undefined,
              })),
          );
        },
        error: () => this._messages.set([]),
      });
  }
}
