/**
 * Canonical field-name → PrimeIcon mapping.
 *
 * Every input / dropdown / multiselect / search bar should pick its icon
 * from here, keyed by the form-control name. Centralising the mapping
 * means:
 *
 *   - "email" reads the same icon on every screen (was pi-at on some
 *     screens, pi-envelope on others)
 *   - "name" doesn't drift across modules (was pi-tag / pi-pencil /
 *     pi-bookmark / pi-box depending on author)
 *   - New fields default to a known-good icon via `resolveFieldIcon`
 *     instead of each component picking arbitrarily
 *
 * Lookup strategy in resolveFieldIcon:
 *   1. Exact match on the registry key (e.g. "email")
 *   2. Case-insensitive match on lowercase (e.g. "Email" → "email")
 *   3. Suffix match — fields like "datasourceId" / "userEmail" fall
 *      through to the last word ("id" / "email")
 *   4. Fallback to `pi-pencil` (generic editable)
 *
 * When in doubt, prefer the PrimeIcon glyph that visually represents
 * the data, not the UI control (a date input uses pi-calendar regardless
 * of whether it's rendered as a textbox or a picker).
 */
export const FIELD_ICONS: Record<string, string> = {
  // ── Identity & people ──
  name: 'pi-id-card',
  firstName: 'pi-user',
  lastName: 'pi-user',
  fullName: 'pi-user',
  displayName: 'pi-user',
  username: 'pi-user',
  email: 'pi-envelope',

  // ── Auth & secrets ──
  password: 'pi-lock',
  currentPassword: 'pi-lock',
  newPassword: 'pi-lock',
  confirmPassword: 'pi-lock',
  otp: 'pi-key',
  token: 'pi-key',
  apiKey: 'pi-key',
  secret: 'pi-lock',

  // ── Org / hierarchy ──
  organisation: 'pi-building',
  organization: 'pi-building',
  organisationId: 'pi-building',
  organisationName: 'pi-building',
  group: 'pi-users',
  groupId: 'pi-users',
  role: 'pi-shield',
  roleId: 'pi-shield',

  // ── Datasource / connection ──
  host: 'pi-desktop',
  hostname: 'pi-desktop',
  port: 'pi-hashtag',
  database: 'pi-database',
  databaseName: 'pi-database',
  dbName: 'pi-database',
  dbUsername: 'pi-user',
  dbPassword: 'pi-lock',
  connection: 'pi-link',
  connectionId: 'pi-link',
  url: 'pi-link',
  schema: 'pi-sitemap',
  table: 'pi-table',

  // ── Text / metadata ──
  description: 'pi-align-left',
  notes: 'pi-align-left',
  comment: 'pi-comment',
  comments: 'pi-comments',
  message: 'pi-comment',
  title: 'pi-bookmark',
  label: 'pi-tag',
  tag: 'pi-tag',
  tags: 'pi-tag',
  category: 'pi-folder',

  // ── Numeric / ids ──
  id: 'pi-hashtag',
  count: 'pi-hashtag',
  limit: 'pi-hashtag',
  number: 'pi-hashtag',

  // ── Time ──
  date: 'pi-calendar',
  startDate: 'pi-calendar',
  endDate: 'pi-calendar',
  time: 'pi-clock',
  duration: 'pi-clock',
  timeout: 'pi-clock',
  expiresAt: 'pi-clock',
  createdAt: 'pi-clock',
  updatedAt: 'pi-clock',

  // ── Status / lifecycle ──
  status: 'pi-circle-fill',
  state: 'pi-circle-fill',
  active: 'pi-check',

  // ── Search / filter / generic UI ──
  search: 'pi-search',
  query: 'pi-search',
  filter: 'pi-filter',
  sort: 'pi-sort-alt',

  // ── Domain-specific ──
  dataset: 'pi-database',
  datasetId: 'pi-database',
  analysis: 'pi-chart-bar',
  analysisId: 'pi-chart-bar',
  dashboard: 'pi-th-large',
  dashboardId: 'pi-th-large',
  visual: 'pi-chart-pie',
  prompt: 'pi-megaphone',
  promptId: 'pi-megaphone',
  type: 'pi-th-large',
  language: 'pi-globe',
  locale: 'pi-globe',
  country: 'pi-globe',
  ipAddress: 'pi-globe',
  userAgent: 'pi-mobile',

  // ── Action verbs (used as control names sometimes) ──
  reason: 'pi-info-circle',
  justification: 'pi-info-circle',
  action: 'pi-cog',
  module: 'pi-box',

  // ── List/form selector ngModel aliases ──
  // List views and some forms bind dropdowns to ad-hoc component
  // properties (selectedOrg, selectedDatasource, etc.) rather than to
  // a FormControl. These aren't field names in the strict sense but
  // resolveFieldIcon treats them the same — we still want the right
  // icon to surface.
  selectedOrg: 'pi-building',
  selectedOrgId: 'pi-building',
  selectedDatasource: 'pi-database',
  selectedDatasourceObj: 'pi-database',
  selectedRole: 'pi-shield',
  selectedGroup: 'pi-users',
  selectedValue: 'pi-tag',
  selectedItem: 'pi-tag',
  selectedDataset: 'pi-database',
  selectedAnalysis: 'pi-chart-bar',
  selectedDashboard: 'pi-th-large',
  sectionId: 'pi-bookmark',
  section: 'pi-bookmark',
  tab: 'pi-folder',
  tabId: 'pi-folder',
  targetGroup: 'pi-users',
  targetGroupId: 'pi-users',
  newScope: 'pi-shield',
  newScopeId: 'pi-shield',
  operator: 'pi-filter',
  dataType: 'pi-th-large',
  columnName: 'pi-id-card',
  adminLocale: 'pi-globe',

  // ── Filter-dialog field aliases ──
  filterDialogColumn: 'pi-id-card',
  filterDialogType: 'pi-th-large',
  filterDialogControl: 'pi-cog',
  filterDialogOperator: 'pi-filter',
  filterDialogNullOption: 'pi-circle-fill',
  filterDialogDateFormat: 'pi-calendar',
  filterDialogDefaultValue: 'pi-pencil',

  // ── Multiselect lists (collections that ARE the field) ──
  users: 'pi-users',
  groups: 'pi-users',
  groupIds: 'pi-users',
  values: 'pi-tag',
  selectedValues: 'pi-tag',
  tables: 'pi-table',
  columns: 'pi-id-card',
  columnToUse: 'pi-id-card',
  columnToView: 'pi-id-card',

  // ── Justification text family (audit-required reasons on destructive ops) ──
  deleteJustification: 'pi-info-circle',
  saveJustification: 'pi-info-circle',
  filterDeleteJustification: 'pi-info-circle',

  // ── Prompt-config dialog fields ──
  placeholder: 'pi-pencil',
  filterPlaceholder: 'pi-search',
  pattern: 'pi-code',
  prefix: 'pi-tag',
  suffix: 'pi-tag',
  maxSelectedLabels: 'pi-hashtag',
  virtualScrollItemSize: 'pi-hashtag',
  emptyMessage: 'pi-comment',
  emptyFilterMessage: 'pi-comment',
  selectedItemsLabel: 'pi-tag',
  selectionLimit: 'pi-hashtag',
  previewValue: 'pi-eye',

  // ── Visual-config-sidebar numeric / label fields ──
  // The valueColumns + chartType categories aren't real "fields" — these
  // are chart-style parameters. Numeric sizes use pi-hashtag, free-text
  // labels use pi-tag, code-shaped formatters use pi-code.
  xAxisLabel: 'pi-tag',
  yAxisLabel: 'pi-tag',
  barWidth: 'pi-hashtag',
  barGap: 'pi-hashtag',
  barCategoryGap: 'pi-hashtag',
  barMaxWidth: 'pi-hashtag',
  barMinWidth: 'pi-hashtag',
  candleBarWidth: 'pi-hashtag',
  units: 'pi-tag',
  funnelMinSize: 'pi-hashtag',
  funnelMaxSize: 'pi-hashtag',
  sunburstRadius: 'pi-hashtag',
  treeEdgeForkPosition: 'pi-hashtag',
  pictorialSymbolMargin: 'pi-hashtag',
  gaugeDetailFormatter: 'pi-code',

  // ── Search-by-IP across list views (network filter) ──
  ipAddress: 'pi-search',
};

const FALLBACK_ICON = 'pi-pencil';

/**
 * Resolve a PrimeIcon class name from a form-control name.
 *
 * Matches in order: exact → lowercase → camelCase suffix → fallback.
 * Returns the class WITHOUT the leading `pi pi-` — pair it with the
 * <app-custom-input>'s `icon` input, which expects just the modifier
 * (e.g. "pi-envelope").
 *
 * Examples:
 *   resolveFieldIcon('email')         // 'pi-envelope'
 *   resolveFieldIcon('Email')         // 'pi-envelope'
 *   resolveFieldIcon('userEmail')     // 'pi-envelope' (suffix match)
 *   resolveFieldIcon('foo')           // 'pi-pencil'   (fallback)
 */
export function resolveFieldIcon(controlName: string): string {
  if (!controlName) return FALLBACK_ICON;

  // 1. exact
  if (FIELD_ICONS[controlName]) return FIELD_ICONS[controlName];

  // 2. lowercase
  const lc = controlName.toLowerCase();
  if (FIELD_ICONS[lc]) return FIELD_ICONS[lc];

  // 3. camelCase suffix — pull the trailing word and lowercase its first
  //    letter (userEmail → email, datasourceId → id, firstName → name)
  const suffixMatch = controlName.match(/[A-Z][a-z0-9]*$/);
  if (suffixMatch) {
    const suffix =
      suffixMatch[0].charAt(0).toLowerCase() + suffixMatch[0].slice(1);
    if (FIELD_ICONS[suffix]) return FIELD_ICONS[suffix];
  }

  return FALLBACK_ICON;
}
