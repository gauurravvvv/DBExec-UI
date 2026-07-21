import { Injectable, computed, signal } from '@angular/core';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import { StorageService } from 'src/app/core/services/storage.service';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { AI_WORKSPACE } from 'src/app/core/constants/api.constant';
import { environment } from 'src/environments/environment';
import type { AiCard } from 'src/app/shared/validators/ai-cards';
import { ScreenContextService } from './screen-context.service';

/** One message rendered in the thread. */
export interface AiThreadMessage {
  role: 'user' | 'assistant';
  text: string;
  cards: AiCard[];
  routedAgent?: string;
  progress?: string[];
}

/** An AgentEvent as received off the socket (mirror of BE union). */
type AgentEvent =
  | { type: 'ready' }
  | { type: 'routing'; agent: string }
  | { type: 'message_delta'; text: string }
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_end'; name: string; card?: AiCard }
  | { type: 'card'; card: AiCard }
  | { type: 'done'; conversationId: string; messageId: string }
  | { type: 'error'; message: string; kind: string };

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

  readonly messages = this._messages.asReadonly();
  readonly streaming = this._streaming.asReadonly();
  readonly routedAgent = this._routedAgent.asReadonly();
  readonly conversationId = this._conversationId.asReadonly();
  readonly conversations = this._conversations.asReadonly();
  readonly socketState = this._socketState.asReadonly();
  readonly isEmpty = computed(() => this._messages().length === 0);

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
    private screenCtx: ScreenContextService,
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
    this._messages.update((m) => [
      ...m,
      { role: 'assistant', text, cards: [] },
    ]);
  }

  /** Send a user message; opens the socket lazily and streams the reply. */
  send(message: string): void {
    const text = message.trim();
    if (!text || this._streaming()) return;

    // Append the user message + an empty assistant bubble to fill in.
    this._messages.update((m) => [
      ...m,
      { role: 'user', text, cards: [] },
      { role: 'assistant', text: '', cards: [], progress: [] },
    ]);
    this.streamingIdx = this._messages().length - 1;
    this._streaming.set(true);

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
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.closingIntentionally = false;
    this._socketState.set('connecting');
    const token = StorageService.get(StorageType.ACCESS_TOKEN) || '';
    // apiServer is like http://host:3000/api/v1 → derive the ws:// URL.
    const apiServer = environment.apiServer ?? '';
    const base = apiServer.replace(/^http/, 'ws');
    const url = `${base}${AI_WORKSPACE.WS}?token=${encodeURIComponent(token)}`;

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
        this.patchAssistant(this.streamingIdx, (msg) => {
          msg.progress = [];
          msg.cards.push({ kind: 'error', message: 'Connection lost.' });
        });
        this._streaming.set(false);
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

  /** Send a chat frame over the open socket. */
  private transmit(message: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'chat',
          message,
          conversationId: this._conversationId() ?? undefined,
          screenContext: this.screenCtx.snapshot(),
        }),
      );
    } catch {
      this.patchAssistant(this.streamingIdx, (msg) => {
        msg.cards.push({ kind: 'error', message: 'Could not send the message.' });
      });
      this._streaming.set(false);
    }
  }

  /** Apply one AgentEvent to the streaming assistant message. */
  private applyEvent(event: AgentEvent): void {
    const idx = this.streamingIdx;
    switch (event.type) {
      case 'ready':
        break; // socket authenticated; nothing to render
      case 'routing':
        this._routedAgent.set(event.agent);
        this.patchAssistant(idx, (m) => (m.routedAgent = event.agent));
        break;
      case 'message_delta':
        this.patchAssistant(idx, (m) => (m.text += event.text));
        break;
      case 'tool_start':
        this.patchAssistant(idx, (m) => (m.progress = [...(m.progress ?? []), event.label]));
        break;
      case 'tool_end':
        this.patchAssistant(idx, (m) => {
          if (event.card) m.cards.push(event.card);
        });
        break;
      case 'card':
        this.patchAssistant(idx, (m) => m.cards.push(event.card));
        break;
      case 'done':
        this._conversationId.set(event.conversationId);
        this.patchAssistant(idx, (m) => (m.progress = []));
        this._streaming.set(false);
        break;
      case 'error':
        this.patchAssistant(idx, (m) => {
          m.progress = [];
          m.cards.push({ kind: 'error', message: event.message });
        });
        this._streaming.set(false);
        break;
    }
  }

  /** Immutably patch the assistant message at `idx` (OnPush-safe). */
  private patchAssistant(idx: number, fn: (m: AiThreadMessage) => void): void {
    if (idx < 0) return;
    this._messages.update((list) => {
      if (idx >= list.length) return list;
      const next = list.slice();
      const msg = { ...next[idx], cards: next[idx].cards.slice() };
      fn(msg);
      next[idx] = msg;
      return next;
    });
  }

  // ── Conversation history (plain REST — cold reads) ─────────────────

  loadConversations(): void {
    this.http
      .apiGet<{ data?: { items?: AiConversationSummary[] } }>(
        AI_WORKSPACE.CONVERSATIONS,
        { skipLoader: true },
      )
      .subscribe({
        next: (res) => this._conversations.set(res?.data?.items ?? []),
        error: () => this._conversations.set([]),
      });
  }

  openConversation(id: string): void {
    this.cancel();
    this._conversationId.set(id);
    this.http
      .apiGet<{
        data?: {
          messages?: Array<{
            role: string;
            content: string | null;
            cards: AiCard[] | null;
            routedAgent: string | null;
          }>;
        };
      }>(`${AI_WORKSPACE.CONVERSATION}${id}`, { skipLoader: true })
      .subscribe({
        next: (res) => {
          const msgs = res?.data?.messages ?? [];
          this._messages.set(
            msgs
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({
                role: m.role as 'user' | 'assistant',
                text: m.content ?? '',
                cards: m.cards ?? [],
                routedAgent: m.routedAgent ?? undefined,
              })),
          );
        },
        error: () => this._messages.set([]),
      });
  }
}
