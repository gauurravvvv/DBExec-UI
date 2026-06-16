/**
 * PermissionService — FE source of truth for "can the current user
 * do X?".
 *
 * The BE returns a nested permission tree at GET /auth/session (Phase
 * 2 of login). LoginService stores it under StorageType.PERMISSION_TREE
 * as a JSON string. This service reads from that key on demand, caches
 * the parsed tree until the raw string changes, and exposes a small
 * surface:
 *
 *   levelOf(value)         → 0..3, the user's effective level
 *   canRead(value)         → level >= READ
 *   canWrite(value)        → level >= WRITE
 *   canDelete(value)       → level >= FULL  (also covers admin actions)
 *   hasLevel(value, level) → compare against an arbitrary level
 *   reset()                → drop the cache (call on logout / refresh)
 *
 * Tree shape (each node):
 *   { value, level?, children?[], subPermissions?[] }
 * Modules don't carry `level`; only leaves do. Walks both shapes so
 * legacy snapshots from older logins keep resolving.
 *
 * Used by:
 *   - *hasPermission structural directive (template-level gating)
 *   - sidebar component (render only granted nav items)
 *   - components that need imperative checks (e.g. enabling/disabling
 *     a column-level action button)
 */
import { Injectable } from '@angular/core';
import { StorageType } from 'src/app/core/constants/storage-type.constant';
import { StorageService } from 'src/app/core/services/storage.service';

export const ACCESS = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  FULL: 3,
} as const;

export type AccessLevel = (typeof ACCESS)[keyof typeof ACCESS];

interface PermNode {
  value: string;
  level?: number;
  /** New nested-tree shape from buildSessionBootstrap. */
  children?: PermNode[];
  /** Legacy nested-tree shape. Walked too so older snapshots resolve. */
  subPermissions?: PermNode[];
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private cachedRaw: string | null = null;
  private cachedTree: PermNode[] = [];

  /** Effective level on `value`, or 0 (NONE) when absent. */
  levelOf(value: string): AccessLevel {
    const tree = this.readTree();
    return this.findLevel(tree, value) as AccessLevel;
  }

  canRead(value: string): boolean {
    return this.levelOf(value) >= ACCESS.READ;
  }

  canWrite(value: string): boolean {
    return this.levelOf(value) >= ACCESS.WRITE;
  }

  canDelete(value: string): boolean {
    return this.levelOf(value) >= ACCESS.FULL;
  }

  hasLevel(value: string, requiredLevel: AccessLevel): boolean {
    return this.levelOf(value) >= requiredLevel;
  }

  /** Drop the cached tree. Called on logout + on permission refresh. */
  reset(): void {
    this.cachedRaw = null;
    this.cachedTree = [];
  }

  // ── Internals ──────────────────────────────────────────────

  private readTree(): PermNode[] {
    const raw = StorageService.get(StorageType.PERMISSION_TREE);
    if (raw === this.cachedRaw) return this.cachedTree;
    this.cachedRaw = raw;
    if (!raw) {
      this.cachedTree = [];
      return this.cachedTree;
    }
    try {
      const parsed = JSON.parse(raw);
      this.cachedTree = Array.isArray(parsed) ? (parsed as PermNode[]) : [];
    } catch {
      this.cachedTree = [];
    }
    return this.cachedTree;
  }

  private findLevel(nodes: PermNode[], value: string): number {
    for (const node of nodes) {
      if (node?.value === value) {
        return typeof node.level === 'number' ? node.level : ACCESS.NONE;
      }
      const nested = node?.children ?? node?.subPermissions;
      if (Array.isArray(nested) && nested.length > 0) {
        const found = this.findLevel(nested, value);
        if (found > ACCESS.NONE) return found;
      }
    }
    return ACCESS.NONE;
  }
}
