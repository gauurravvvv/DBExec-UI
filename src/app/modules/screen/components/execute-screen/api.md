# Frontend API Consumption Guide — Screen Rendering Flow

## Overview

A **Screen** is rendered in three sequential API calls:

```
1. GET /screen/getTabs/:orgId/:screenId        → load all tabs
2. GET /tab/getSections/:orgId/:screenId/:tabId → load sections for the active tab
3. GET /section/getPrompts/:orgId/:screenId/:tabId/:sectionId → load prompts per section
```

All APIs require a valid JWT token in the `Authorization` header.

---

## Authentication

```
Authorization: Bearer <token>
```

---

## Step 1 — Get Tabs for a Screen

### Request

```
GET /screen/getTabs/:orgId/:screenId
```

| Param      | Type   | Description     |
| ---------- | ------ | --------------- |
| `orgId`    | string | Organisation ID |
| `screenId` | string | Screen ID       |

### Response

```json
{
  "success": true,
  "code": 200,
  "message": "Screen tabs retrieved successfully",
  "data": [
    {
      "id": "1",
      "name": "Filters",
      "description": "Main filter tab",
      "tabControlName": "filtersTabControl",
      "databaseId": 1,
      "databaseName": "prod_db",
      "organisationId": 1,
      "organisationName": "Acme Corp",
      "sequence": 1,
      "status": 1,
      "createdOn": "2024-01-01T00:00:00.000Z",
      "tabSequence": 1
    },
    {
      "id": "2",
      "name": "Advanced",
      "tabControlName": "advancedTabControl",
      "tabSequence": 2
    }
  ]
}
```

**Key fields:**

- `tabSequence` — the order in which to render this tab **for this specific screen** (screen-level override, not the global `sequence` on the Tab entity)
- `tabControlName` — use this as the Angular form control name / React key for the tab component

### FE Logic

```ts
const { data: tabs } = await api.get(`/screen/getTabs/${orgId}/${screenId}`);
// tabs are already sorted by tabSequence ascending
renderTabs(tabs);
// Auto-select first tab and fetch its sections
fetchSections(tabs[0].id);
```

---

## Step 2 — Get Sections for a Tab

### Request

```
GET /tab/getSections/:orgId/:screenId/:tabId
```

| Param      | Type   | Description                                       |
| ---------- | ------ | ------------------------------------------------- |
| `orgId`    | string | Organisation ID                                   |
| `screenId` | string | Screen ID (required — sections are screen-scoped) |
| `tabId`    | string | Tab ID (from Step 1 response)                     |

### Response

```json
{
  "success": true,
  "code": 200,
  "message": "Tab sections retrieved successfully",
  "data": [
    {
      "id": "10",
      "name": "Date Range",
      "description": "Date selection section",
      "sectionControlName": "dateRangeSectionControl",
      "tabId": "1",
      "tabName": "Filters",
      "databaseId": 1,
      "organisationId": 1,
      "sequence": 1,
      "status": 1,
      "createdOn": "2024-01-01T00:00:00.000Z",
      "sectionSequence": 1
    }
  ]
}
```

**Key fields:**

- `sectionSequence` — screen+tab-scoped ordering for this section
- `sectionControlName` — use as form group name

### FE Logic

```ts
// Called when user clicks a tab OR on initial tab auto-select
const { data: sections } = await api.get(
  `/tab/getSections/${orgId}/${screenId}/${tabId}`,
);
// sections are already sorted by sectionSequence ascending

// Fetch prompts for each section in parallel
await Promise.all(sections.map(section => fetchPrompts(section.id)));
```

---

## Step 3 — Get Prompts for a Section

### Request

```
GET /section/getPrompts/:orgId/:screenId/:tabId/:sectionId
```

| Param       | Type   | Description                       |
| ----------- | ------ | --------------------------------- |
| `orgId`     | string | Organisation ID                   |
| `screenId`  | string | Screen ID                         |
| `tabId`     | string | Tab ID                            |
| `sectionId` | string | Section ID (from Step 2 response) |

### Response

```json
{
  "success": true,
  "code": 200,
  "message": "Section prompts retrieved successfully",
  "data": [
    {
      "id": "100",
      "name": "Start Date",
      "description": "Select the start date",
      "type": "date",
      "promptControlName": "startDatePromptControl",
      "mandatory": 1,
      "isGroup": false,
      "groupId": null,
      "validation": {
        "required": true
      },
      "sectionId": "10",
      "tabId": "1",
      "databaseId": 1,
      "organisationId": 1,
      "sequence": 1,
      "status": 1,
      "promptSequence": 1,
      "config": {
        "id": "50",
        "promptId": "100",
        "prompt_schema": "public",
        "prompt_table": "",
        "prompt_column": "",
        "prompt_join": "",
        "prompt_where": "",
        "prompt_sql": "",
        "prompt_values_sql": "",
        "appearance": {}
      },
      "values": []
    },
    {
      "id": "101",
      "name": "Region",
      "type": "dropdown",
      "promptControlName": "regionPromptControl",
      "mandatory": 0,
      "promptSequence": 2,
      "config": {
        "prompt_sql": "SELECT id, name FROM regions WHERE active = 1",
        "prompt_values_sql": "SELECT id, name FROM regions WHERE active = 1",
        "appearance": { "width": "half" }
      },
      "values": [
        { "id": "1", "promptId": "101", "value": "North" },
        { "id": "2", "promptId": "101", "value": "South" }
      ]
    }
  ]
}
```

**Key fields:**

| Field               | Description                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `type`              | Prompt input type — drives which UI component to render (see below)                                                   |
| `promptSequence`    | Screen+tab+section-scoped ordering                                                                                    |
| `promptControlName` | Use as form control name                                                                                              |
| `mandatory`         | `1` = required field, `0` = optional                                                                                  |
| `validation`        | JSON object with validation rules                                                                                     |
| `config`            | Rendering config (SQL for dynamic options, appearance overrides)                                                      |
| `values`            | Static option list (used for `dropdown`, `multiselect`, `radio`, `checkbox` when `config.prompt_values_sql` is empty) |

---

## Prompt Types Reference

| `type`        | Component to render     | Uses `values` | Uses `config.prompt_sql` |
| ------------- | ----------------------- | :-----------: | :----------------------: |
| `text`        | `<input type="text">`   |      No       |            No            |
| `number`      | `<input type="number">` |      No       |            No            |
| `date`        | Date picker             |      No       |            No            |
| `daterange`   | Date range picker       |      No       |            No            |
| `calendar`    | Calendar picker         |      No       |            No            |
| `dropdown`    | `<select>` / Dropdown   |      Yes      |      Yes (dynamic)       |
| `multiselect` | Multi-select dropdown   |      Yes      |      Yes (dynamic)       |
| `radio`       | Radio button group      |      Yes      |      Yes (dynamic)       |
| `checkbox`    | Checkbox group          |      Yes      |      Yes (dynamic)       |
| `rangeslider` | Range slider            |      No       |            No            |

### Option Loading Strategy for Dynamic Prompts

For `dropdown`, `multiselect`, `radio`, `checkbox`:

```ts
function getOptions(prompt) {
  // Priority 1: dynamic SQL via config
  if (prompt.config?.prompt_values_sql) {
    return fetchDynamicOptions(prompt.config.prompt_values_sql);
  }
  // Priority 2: static values list
  if (prompt.values?.length > 0) {
    return prompt.values.map(v => ({ label: v.value, value: v.value }));
  }
  return [];
}
```

---

## Full Flow with Error Handling

```ts
async function loadScreen(orgId: string, screenId: string) {
  // Step 1: Load tabs
  const tabsRes = await api.get(`/screen/getTabs/${orgId}/${screenId}`);
  if (!tabsRes.success) {
    showError(tabsRes.message); // "Screen not found" | "No tabs found for this screen"
    return;
  }
  const tabs = tabsRes.data; // sorted by tabSequence

  // Step 2: Load sections for the first (active) tab
  const activeTab = tabs[0];
  await loadTabSections(orgId, screenId, activeTab.id);
}

async function loadTabSections(orgId: string, screenId: string, tabId: string) {
  const sectionsRes = await api.get(
    `/tab/getSections/${orgId}/${screenId}/${tabId}`,
  );
  if (!sectionsRes.success) {
    showError(sectionsRes.message); // "No sections found"
    return;
  }
  const sections = sectionsRes.data; // sorted by sectionSequence

  // Step 3: Load prompts for each section (parallel)
  await Promise.all(
    sections.map(section =>
      loadSectionPrompts(orgId, screenId, tabId, section.id),
    ),
  );
}

async function loadSectionPrompts(
  orgId: string,
  screenId: string,
  tabId: string,
  sectionId: string,
) {
  const promptsRes = await api.get(
    `/section/getPrompts/${orgId}/${screenId}/${tabId}/${sectionId}`,
  );
  if (!promptsRes.success) {
    showError(promptsRes.message); // "No prompts found"
    return;
  }
  const prompts = promptsRes.data; // sorted by promptSequence
  renderSection(sectionId, prompts);
}
```

---

## Error Responses

All endpoints return the same error shape:

```json
{
  "success": false,
  "code": 404,
  "message": "Screen not found."
}
```

| HTTP Code | Scenario                                                   |
| --------- | ---------------------------------------------------------- |
| `404`     | Screen / Tab / Section not found, or no active items exist |
| `500`     | Server error                                               |

---

## Tab Switch Behaviour

When the user switches tabs, **only Step 2 and Step 3 need to re-run** — tabs are already loaded.

```ts
async function onTabChange(tabId: string) {
  clearCurrentSections();
  await loadTabSections(orgId, screenId, tabId);
}
```

---

## Sequence Summary

```
Screen load
│
├── GET /screen/getTabs/:orgId/:screenId
│     └── returns tabs[] sorted by tabSequence
│
├── [auto-select tab[0]]
│
├── GET /tab/getSections/:orgId/:screenId/:tabId
│     └── returns sections[] sorted by sectionSequence
│
└── for each section (parallel):
      GET /section/getPrompts/:orgId/:screenId/:tabId/:sectionId
            └── returns prompts[] sorted by promptSequence
                  each prompt includes:
                    - type (drives component)
                    - validation rules
                    - config (SQL + appearance)
                    - values (static options)
```
