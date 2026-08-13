import { Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * A screen descriptor sent with each DBExecAI chat frame so the assistant
 * knows what the user is looking at. The BE maps `module` → a domain
 * specialist (e.g. users → Access) and, when mapped, runs the turn SCOPED to
 * that specialist — so on the Users screen DBExecAI is limited to Users /
 * Groups / Roles.
 *
 * MIRRORS the BE contract in
 * dbexec-api/src/modules/ai-workspace/engine/screen.ts — the `module` keys
 * and the set of scoped modules must stay in sync with `MODULE_TO_SPECIALIST`
 * there. This service is the FE half.
 */
export interface AiScreenContext {
  /** Route module key, e.g. 'users'. */
  module: string;
  /** View within the module: 'list' | 'add' | 'edit' | 'view' | undefined. */
  view?: string;
  /** Record id when the route carries one (edit/view screens). */
  recordId?: string;
  /** Human label for the module chip + prompt grounding. */
  label: string;
  /** True when the BE scopes this module to a domain specialist. Drives the
   *  "scoped to this module" hint in the panel header. */
  scoped: boolean;
}

/**
 * One route→module rule. `test` matches the first path segment; `view`/`id`
 * are pulled from the remaining segments. Kept declarative so adding a module
 * later (datasets, alerts…) is a one-line addition.
 */
interface ModuleRule {
  /** First path segment(s) that identify the module. */
  segment: string;
  module: string;
  label: string;
  /** Whether the BE scopes this module to a specialist (mirror of BE map). */
  scoped: boolean;
}

/**
 * The module table. `scoped: true` entries mirror the BE
 * MODULE_TO_SPECIALIST map (users/groups/roles → Access). Non-scoped entries
 * still send a screen (for the header chip + prompt grounding) but run the
 * global assistant. Order matters only for longest-prefix intent; we match
 * the exact first segment, so it doesn't here.
 */
const MODULE_RULES: ModuleRule[] = [
  { segment: 'users', module: 'users', label: 'Users', scoped: true },
  { segment: 'groups', module: 'groups', label: 'Groups', scoped: true },
  { segment: 'role', module: 'role', label: 'Roles', scoped: true },
  {
    segment: 'system-users',
    module: 'system-users',
    label: 'System Users',
    scoped: true,
  },
  {
    segment: 'system-groups',
    module: 'system-groups',
    label: 'System Groups',
    scoped: true,
  },
  {
    segment: 'system-roles',
    module: 'system-roles',
    label: 'System Roles',
    scoped: true,
  },
];

/** Segments that denote a sub-view rather than a record id. */
const VIEW_SEGMENTS = new Set(['add', 'edit', 'view', 'new', 'create', 'list']);

/**
 * AiScreenContextService — tracks the current route and exposes it as a
 * normalized {@link AiScreenContext} signal for DBExecAI. Subscribes once to
 * router NavigationEnd (provided in root, lives for the app's lifetime).
 */
@Injectable({ providedIn: 'root' })
export class AiScreenContextService {
  private _screen = signal<AiScreenContext | null>(null);
  /** The current screen descriptor, or null on an unmapped route. */
  readonly screen = this._screen.asReadonly();

  constructor(private router: Router) {
    // Seed from the current URL, then track every navigation.
    this._screen.set(this.parse(this.router.url));
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this._screen.set(this.parse(e.urlAfterRedirects || e.url)));
  }

  /**
   * Parse a router URL into a screen descriptor. Strips the query string +
   * a leading `app/` shell segment, matches the first meaningful segment
   * against the module table, and derives view/recordId from the tail.
   */
  private parse(url: string): AiScreenContext | null {
    const path = (url.split('?')[0] || '').split('#')[0];
    const segs = path.split('/').filter(Boolean);
    // Drop a leading shell segment if the app nests routes under it.
    if (segs[0] === 'app') segs.shift();
    if (!segs.length) return null;

    const first = segs[0];
    const rule = MODULE_RULES.find(r => r.segment === first);
    if (!rule) return null;

    // Derive view + recordId from the tail. Patterns seen in the app:
    //   /users                     → list
    //   /users/add                 → add
    //   /users/:id/edit            → edit, recordId
    //   /users/:id/view | /users/:id → view, recordId
    let view: string | undefined;
    let recordId: string | undefined;
    const tail = segs.slice(1);
    for (const s of tail) {
      if (VIEW_SEGMENTS.has(s)) view = s === 'new' || s === 'create' ? 'add' : s;
      else if (!recordId) recordId = s;
    }
    if (!view) view = recordId ? 'view' : 'list';

    return {
      module: rule.module,
      view,
      recordId,
      label: rule.label,
      scoped: rule.scoped,
    };
  }
}
