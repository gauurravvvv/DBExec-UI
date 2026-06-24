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
