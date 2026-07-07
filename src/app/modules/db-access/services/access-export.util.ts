/**
 * access-export.util — turn a per-role/user access profile (from
 * GET /:datasourceId/roles/:roleName/export) into a downloadable
 * JSON or flat CSV file, client-side. No SQL, no server round-trip
 * beyond the profile fetch.
 *
 * The profile shape (from exportRoleAccess controller):
 *   { datasourceName, roleName, kind, exportedAt, attributes,
 *     grantedRoles: [{role, adminOption}],
 *     effectivePrivileges: [{schema, table, privilege, via}],
 *     ownedObjects: {tables, sequences, functions, schemas, total} }
 */

export interface AccessProfile {
  datasourceName?: string | null;
  roleName: string;
  kind?: string;
  exportedAt?: string;
  attributes?: Record<string, unknown>;
  grantedRoles?: Array<{ role: string; adminOption: boolean }>;
  effectivePrivileges?: Array<{
    schema: string;
    table: string;
    privilege: string;
    via: string;
  }>;
  ownedObjects?: Record<string, number>;
}

/** Trigger a browser download of `content` as `filename`. */
function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Safe filename slug from the role name + datasource + date. */
function slug(profile: AccessProfile): string {
  const safe = (s: string) =>
    (s || 'unknown').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);
  const date = (profile.exportedAt ?? '').slice(0, 10) || 'export';
  return `access_${safe(profile.roleName)}_${date}`;
}

export function downloadAccessJson(profile: AccessProfile): void {
  download(
    `${slug(profile)}.json`,
    JSON.stringify(profile, null, 2),
    'application/json',
  );
}

/** RFC-4180-ish CSV cell: quote + double embedded quotes. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Flat CSV: one section header block per part (attributes, granted
 * roles, effective privileges, owned objects) so an auditor can open
 * it in a spreadsheet. Effective privileges — the bulk — are the main
 * table (schema, table, privilege, via).
 */
export function downloadAccessCsv(profile: AccessProfile): void {
  const lines: string[] = [];
  const row = (...cells: unknown[]) => lines.push(cells.map(csvCell).join(','));

  row('Access profile');
  row('Role/User', profile.roleName);
  row('Kind', profile.kind ?? '');
  row('Datasource', profile.datasourceName ?? '');
  row('Exported at', profile.exportedAt ?? '');
  lines.push('');

  row('Attributes');
  row('Attribute', 'Value');
  for (const [k, v] of Object.entries(profile.attributes ?? {})) {
    row(k, v as unknown);
  }
  lines.push('');

  row('Granted roles (member of)');
  row('Role', 'Admin option');
  for (const g of profile.grantedRoles ?? []) {
    row(g.role, g.adminOption ? 'yes' : 'no');
  }
  lines.push('');

  row('Effective privileges');
  row('Schema', 'Table', 'Privilege', 'Via');
  for (const p of profile.effectivePrivileges ?? []) {
    row(p.schema, p.table, p.privilege, p.via);
  }
  lines.push('');

  row('Owned objects');
  row('Type', 'Count');
  for (const [k, v] of Object.entries(profile.ownedObjects ?? {})) {
    row(k, v as unknown);
  }

  download(`${slug(profile)}.csv`, lines.join('\r\n'), 'text/csv');
}
