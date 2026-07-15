import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FOLDER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import type { FolderObjectType } from 'src/app/shared/validators/folders';

/**
 * A single node in the folder tree, shaped for PrimeNG `p-tree`. `data`
 * carries the raw folder id + metadata so selection / drag handlers can read
 * it back. Built by {@link FoldersService.toTreeNodes} from the flat BE rows.
 */
export interface FolderNode {
  key: string;
  label: string;
  data: { id: string; parentId: string | null; objectType: string };
  icon?: string;
  children?: FolderNode[];
  leaf?: boolean;
}

/** A flat folder row as returned by the BE list-tree endpoint. */
export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  objectType: string;
  sequence?: number;
}

/**
 * FoldersService — the cross-cutting folder-tree CRUD used by the shared
 * `<app-folder-tree>` panel on every object list (dataset / analysis /
 * dashboard / alert). Backed by the BE folders routes (spec §5.6):
 *
 *   GET    /folders/tree?objectType=   listFolderTree
 *   POST   /folders                    createFolder
 *   PUT    /folders/:folderId/rename   renameFolder
 *   PUT    /folders/:folderId/move     moveFolder
 *   DELETE /folders/:folderId          deleteFolder
 *   PUT    /folders/move-object        move an object into a folder
 *
 * Every call passes `{ skipLoader: true }` so the panel drives its own inline
 * spinner rather than the global route blocker. Org id is never sent — the BE
 * derives it from the JWT.
 */
@Injectable({ providedIn: 'root' })
export class FoldersService {
  constructor(private http: HttpClientService) {}

  /** Load the whole tree (flat rows) for one object family. */
  listTree(objectType: FolderObjectType): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(FOLDER.TREE, {
        params: { objectType },
        skipLoader: true,
      }),
    );
  }

  /**
   * Tag facet for the explorer's Tags rail — every distinct tag on the org's
   * assets of this objectType with its usage count, sorted by count desc.
   */
  async listTags(
    objectType: FolderObjectType,
  ): Promise<{ tag: string; count: number }[]> {
    const res: any = await lastValueFrom(
      this.http.apiGet(FOLDER.TAGS, {
        params: { objectType },
        skipLoader: true,
      }),
    );
    return res?.data?.tags ?? [];
  }

  /** Create a folder. `parentId` null / omitted = a root folder. */
  create(payload: {
    name: string;
    objectType: FolderObjectType;
    parentId?: string | null;
    sequence?: number;
  }): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(FOLDER.CREATE, payload, { skipLoader: true }),
    );
  }

  /** Rename a folder (id moves to the path). */
  rename(id: string, name: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(
        FOLDER.RENAME_PREFIX + id + FOLDER.RENAME_SUFFIX,
        { id, name },
        { skipLoader: true },
      ),
    );
  }

  /** Move (reparent) a folder. `parentId` null = move to root. */
  move(id: string, parentId: string | null, sequence?: number): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(
        FOLDER.MOVE_PREFIX + id + FOLDER.MOVE_SUFFIX,
        { id, parentId, ...(sequence != null ? { sequence } : {}) },
        { skipLoader: true },
      ),
    );
  }

  /** Delete a folder; the BE detaches its objects (folderId → null). */
  delete(id: string, justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(FOLDER.DELETE + id, {
        body: { justification },
        skipLoader: true,
      }),
    );
  }

  /** Move an object into a folder, or to root when `folderId` is null. */
  moveObject(
    objectType: FolderObjectType,
    objectId: string,
    folderId: string | null,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(
        FOLDER.MOVE_OBJECT,
        { objectType, objectId, folderId },
        { skipLoader: true },
      ),
    );
  }

  /**
   * Build the nested `p-tree` node array from flat BE rows. Rows may arrive in
   * any order; this links children to parents by `parentId` in a single pass.
   */
  toTreeNodes(rows: FolderRow[]): FolderNode[] {
    const byId = new Map<string, FolderNode>();
    for (const r of rows ?? []) {
      byId.set(r.id, {
        key: r.id,
        label: r.name,
        data: { id: r.id, parentId: r.parentId, objectType: r.objectType },
        icon: 'pi pi-folder',
        children: [],
      });
    }
    const roots: FolderNode[] = [];
    for (const r of rows ?? []) {
      const node = byId.get(r.id)!;
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      if (parent) parent.children!.push(node);
      else roots.push(node);
    }
    // Collapse empty children arrays to leaf markers so the tree renders
    // without a phantom expander on empty folders.
    const markLeaves = (nodes: FolderNode[]): void => {
      for (const n of nodes) {
        if (n.children && n.children.length) markLeaves(n.children);
        else {
          n.children = undefined;
          n.leaf = true;
        }
      }
    };
    markLeaves(roots);
    return roots;
  }
}
