# 25 · AI Insights / Natural-language Q&A

## Why

Every modern BI tool ships an AI assistant: ThoughtSpot Sage, Tableau
Pulse, Power BI Q&A, Looker's Visual Assistant, Metabase X-Ray.

The pattern: user types in English → LLM translates to a structured
SemanticRequest → compiler emits SQL → results visualised.

## Architecture

```
User: "What was revenue by region last month?"
         │
         ▼
   ┌─────────────────────────────┐
   │ NL → Semantic Request       │
   │  - LLM with tools           │
   │  - Tools: listDatasets,     │
   │           describeModel,    │
   │           buildQuery        │
   └────────────┬────────────────┘
                │
                ▼
   SemanticRequest {
     modelId: 'sales',
     metrics: ['revenue'],
     dimensions: ['region'],
     filters: [{ field: 'order_date', op: 'between', values: [prev_month_start, prev_month_end] }]
   }
                │
                ▼
        SemanticCompiler → SQL → rows
                │
                ▼
   ┌─────────────────────────────┐
   │ Visual chooser              │
   │  - rule-based: 2 dims → bar │
   │              1 dim → KPI    │
   │              time → line    │
   └────────────┬────────────────┘
                │
                ▼
             Visual
```

## Tool definitions for the LLM

```ts
const tools = [
  {
    name: 'list_semantic_models',
    description: 'List available semantic models with their dimensions and metrics',
    parameters: { type: 'object', properties: {} },
    handler: async () => { /* return summary of available models */ },
  },
  {
    name: 'describe_model',
    description: 'Get the full dimensions, metrics, and example values for a model',
    parameters: { type: 'object', properties: { modelId: { type: 'string' } }, required: ['modelId'] },
    handler: async ({ modelId }) => { /* ... */ },
  },
  {
    name: 'execute_query',
    description: 'Run a semantic query and return rows',
    parameters: { /* SemanticQueryRequest schema */ },
    handler: async (req) => { /* compile + run, return rows */ },
  },
];
```

LLM iterates: list models → pick one → describe → build query →
execute. Returns the query + a chart suggestion.

## Privacy posture

- Customer data NEVER leaves DBExec — only **schema** (semantic model
  metadata) goes to the LLM.
- Self-hosted option: connect to a local Llama 3 or Ollama instance.
- "AI off" toggle per org.

## Embed

A chat-style sidebar on the analyses/dashboard view. User types,
DBExec opens a new visual with the result.

## Tests

- **AI-H-01** — "revenue by region" produces a bar chart on the right model
- **AI-H-02** — follow-up "for APAC only" adds a filter
- **AI-N-01** — request for an undefined metric → graceful "I don't have that"
- **AI-N-02** — request that would expose denied columns → refused
- **AI-PRIV-H-01** — no row data ever sent to the LLM

## Appendix · Review additions

- **Conversation memory** across turns ("and for last year").
- **Explain a visual** — AI generates 2-sentence summary.
- **Anomaly callouts** — highlight outliers automatically.
- **Suggested next-question chips**.
- **Confidence indicator** (% certainty for the picked metric).
- **Source citation** ("based on dataset `orders`, metric `revenue`").
- **Local LLM** (Ollama / vLLM) for on-prem deployments.
- **Schema sanitisation** — strip PII names before sending to LLM.
- **Prompt injection defence** — system prompt is server-side only;
  user input never appears in privileged tool descriptions.
- **AI audit category** — every AI query logs to `audit_log` as
  `category='ai_query'`.
- **Per-org cost meter** — token usage stored, billable rollup.

### Schema delta

```sql
CREATE TABLE ai_session (
  id              uuid PRIMARY KEY,
  organisation_id uuid NOT NULL,
  user_id         uuid NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  total_tokens_in  int DEFAULT 0,
  total_tokens_out int DEFAULT 0,
  total_cost_usd   numeric(10,4) DEFAULT 0
);

CREATE TABLE ai_turn (
  id          uuid PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES ai_session(id) ON DELETE CASCADE,
  role        varchar(16) NOT NULL,  -- user|assistant|tool
  content     text,
  tool_calls  jsonb,
  tokens_in   int,
  tokens_out  int,
  latency_ms  int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### Test IDs

- AI-CONV-H-01 — follow-up question reuses prior context
- AI-EXPLAIN-H-01 — "summarise this visual" returns 2 sentences
- AI-INJ-N-01 — prompt-injection attempt ignored
- AI-COST-H-01 — tokens recorded per org
- AI-SANIT-H-01 — PII columns redacted in schema sent to LLM
- AI-CONF-H-01 — confidence indicator shown next to result
