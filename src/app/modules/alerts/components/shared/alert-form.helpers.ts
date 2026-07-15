/**
 * Shared, dependency-light helpers for the add / edit alert forms so the two
 * components stay thin and identical in behaviour: option lists, source +
 * field loading, recipient user paging, and payload composition into the shape
 * the mirrored addAlertSchema / updateAlertSchema expect.
 *
 * These are plain functions (not an Angular service) — they take the concrete
 * services they need as arguments, mirroring the `loadDatasourcesPage` fetcher
 * pattern already used across the app's list/add screens.
 */
import {
  ALERT_SEVERITIES,
  ALERT_SOURCE_TYPES,
} from 'src/app/shared/validators/alerts';
import { DATASET, ANALYSES } from 'src/app/core/constants/api.constant';
import type { HttpClientService } from 'src/app/core/services/http-client.service';
import { lastValueFrom } from 'rxjs';
import type { AlertFieldOption } from '../alert-condition-builder/alert-condition-builder.component';

/* ── static option lists ──────────────────────────────────────────── */

export const SOURCE_TYPE_OPTIONS = ALERT_SOURCE_TYPES.map(v => ({
  value: v,
  label: 'ALERTS.SOURCE_' + v.toUpperCase(),
}));

export const SEVERITY_OPTIONS = ALERT_SEVERITIES.map(v => ({
  value: v,
  label: 'ALERTS.SEVERITY_' + v.toUpperCase(),
}));

/** Cron presets — value is a 5-field cron the lenient schema accepts. */
export const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'ALERTS.PRESET_EVERY_5M', value: '*/5 * * * *' },
  { label: 'ALERTS.PRESET_EVERY_15M', value: '*/15 * * * *' },
  { label: 'ALERTS.PRESET_HOURLY', value: '0 * * * *' },
  { label: 'ALERTS.PRESET_EVERY_6H', value: '0 */6 * * *' },
  { label: 'ALERTS.PRESET_DAILY_9', value: '0 9 * * *' },
  { label: 'ALERTS.PRESET_WEEKDAYS_9', value: '0 9 * * 1-5' },
  { label: 'ALERTS.PRESET_WEEKLY_MON', value: '0 9 * * 1' },
];

/** A pragmatic IANA timezone shortlist; label falls back to the id. */
export const TIMEZONE_OPTIONS: { label: string; value: string }[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
].map(tz => ({ label: tz, value: tz }));

/* ── field option builder ─────────────────────────────────────────── */

/**
 * Normalise a raw dataset / analysis field list (shape:
 * { columnToUse, columnToView, dataType, customLogic? }) into the
 * AlertFieldOption[] the condition builder consumes. Custom-logic fields
 * (formulas) are tagged kind:'formula'.
 */
export function buildSourceFieldOptions(rawFields: any[]): AlertFieldOption[] {
  return (rawFields ?? []).map(f => {
    const ref = f.columnToUse ?? f.columnName ?? f.columnToView ?? '';
    const label = f.columnToView ?? f.displayName ?? ref;
    const isFormula = !!(f.customLogic ?? f.isCustom ?? f.expression);
    return {
      ref,
      label,
      kind: isFormula ? 'formula' : 'field',
      dataType: f.dataType,
    } as AlertFieldOption;
  }).filter(f => !!f.ref);
}

/* ── source + field loading ───────────────────────────────────────── */

interface SourceServices {
  datasetService: {
    listDatasets: (params: any) => Promise<any>;
    getDataset: (id: string) => Promise<any>;
    getDistinctColumnValues: (id: string, col: string) => Promise<any>;
  };
  globalService: { handleSuccessService: (res: any, showToast?: boolean) => boolean };
  /** Injected only when analysis sources are in play. */
  http?: HttpClientService;
}

export const loadSourceFields = {
  /**
   * List sources of the given type under a datasource for the source dropdown.
   * Dataset sources use DatasetService; analysis sources hit /analyses.
   */
  async listSources(
    sourceType: string,
    datasourceId: string,
    { search, page, limit }: { search: string; page: number; limit: number },
    svc: SourceServices,
  ): Promise<{ items: any[]; total: number }> {
    const params: any = { datasourceId, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      if (sourceType === 'analysis') {
        if (!svc.http) return { items: [], total: 0 };
        const res: any = await lastValueFrom(
          svc.http.apiGet(ANALYSES.LIST, { params, skipLoader: true }),
        );
        if (svc.globalService.handleSuccessService(res, false)) {
          return { items: res?.data?.analyses ?? [], total: res?.data?.count ?? 0 };
        }
        return { items: [], total: 0 };
      }
      const res: any = await svc.datasetService.listDatasets(params);
      if (svc.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.datasets ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  },

  /**
   * Load the field list for a chosen source. Returns both the raw field list
   * and the underlying datasetId (analysis sources evaluate their parent
   * dataset, so distinct-value lookups + the condition reference the dataset).
   */
  async fields(
    sourceType: string,
    sourceId: string,
    svc: SourceServices,
  ): Promise<{ fields: any[]; datasetId: string }> {
    if (sourceType === 'analysis') {
      if (!svc.http) return { fields: [], datasetId: '' };
      const res: any = await lastValueFrom(
        svc.http.apiGet(
          ANALYSES.FIELDS_PREFIX + sourceId + ANALYSES.FIELDS_SUFFIX,
          { skipLoader: true },
        ),
      );
      if (svc.globalService.handleSuccessService(res, false)) {
        const fields = res?.data?.fields ?? res?.data ?? [];
        const datasetId = res?.data?.datasetId ?? '';
        return { fields, datasetId };
      }
      return { fields: [], datasetId: '' };
    }
    // dataset source
    const res: any = await svc.datasetService.getDataset(sourceId);
    if (svc.globalService.handleSuccessService(res, false)) {
      return { fields: res?.data?.datasetFields ?? [], datasetId: sourceId };
    }
    return { fields: [], datasetId: '' };
  },

  /** Build a distinct-value fetcher (label/value[]) bound to a datasetId. */
  distinctFetcher(
    datasetId: string,
    svc: Pick<SourceServices, 'datasetService'>,
  ): (ref: string) => Promise<{ label: string; value: string }[]> {
    return async (ref: string) => {
      if (!datasetId || !ref) return [];
      try {
        const res: any = await svc.datasetService.getDistinctColumnValues(
          datasetId,
          ref,
        );
        if (res?.status && res.data) {
          return (res.data as any[]).map(v => ({
            label: String(v),
            value: String(v),
          }));
        }
        return [];
      } catch {
        return [];
      }
    };
  },
};

/* ── recipient users ──────────────────────────────────────────────── */

/** Server-mode multiselect fetcher for org users (id + display label). */
export function loadRecipientUsersPage(
  deps: () => { globalService: { handleSuccessService: (r: any, t?: boolean) => boolean } },
  userLister?: (params: any) => Promise<any>,
) {
  return async ({ search, page, limit }: any) => {
    if (!userLister) return { items: [], total: 0 };
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ search });
    try {
      const res: any = await userLister(params);
      if (deps().globalService.handleSuccessService(res, false)) {
        const users = (res?.data?.users ?? []).map((u: any) => ({
          ...u,
          displayLabel:
            [u.firstName, u.lastName].filter(Boolean).join(' ') ||
            u.username ||
            u.email,
        }));
        return { items: users, total: res?.data?.count ?? users.length };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };
}

/* ── payload composition ──────────────────────────────────────────── */

/**
 * Compose the create/update payload from the form value + the condition
 * builder's serialised output. Shapes recipients into the { userIds, emails }
 * jsonb the entity + validator expect and drops the FE-only proxy fields.
 */
export function buildAlertPayload(
  formVal: any,
  condition: {
    mode: 'builder' | 'expression';
    conditionBuilder: any;
    conditionExpression: string | null;
  },
): any {
  const payload: any = {
    name: formVal.name,
    description: formVal.description || undefined,
    sourceType: formVal.sourceType,
    sourceId: formVal.sourceId,
    datasourceId: formVal.datasourceId,
    conditionMode: condition.mode,
    conditionBuilder: condition.conditionBuilder ?? undefined,
    conditionExpression: condition.conditionExpression ?? undefined,
    filterState: formVal.filterState ?? undefined,
    cronExpression: formVal.cronExpression,
    timezone: formVal.timezone,
    severity: formVal.severity,
    recipients: {
      userIds: formVal.recipientUserIds ?? [],
      emails: formVal.recipientEmails ?? [],
    },
    notifyInApp: !!formVal.notifyInApp,
    notifyEmail: !!formVal.notifyEmail,
    cooldownMinutes: formVal.cooldownMinutes ?? 60,
    consecutiveBreachesRequired: formVal.consecutiveBreachesRequired ?? 1,
    enabled: formVal.enabled ?? true,
    // Track F: free-form organizational tags (string[]). Omitted when empty.
    tags:
      Array.isArray(formVal.tags) && formVal.tags.length
        ? formVal.tags
        : undefined,
    // Folder-explorer: the folder the alert is filed into (null = Root).
    ...(formVal.folderId ? { folderId: formVal.folderId } : {}),
  };
  if (formVal.id) payload.id = formVal.id;
  return payload;
}
