/**
 * qb-form-designer — the admin screen that replaces the tab/section-coupled
 * configure screen (spec §11.2, route :id/design).
 *
 * A builder's form is a flat list of prompt placements bucketed by groupLabel —
 * no tabs, no sections. The admin drags prompts from the palette into groups,
 * reorders within and across groups, renames or adds groups, and sets per-
 * placement FORM POSITION only (mandatory / locked / display-name). Prompt
 * CONFIG — SQL, values, appearance, operators — is owned by the Prompt module
 * and is NOT editable here. Saved via QbAdminService.savePlacements as an
 * ordered replace.
 *
 * Placement order is implied by array order at save (groupSequence from group
 * index, promptSequence from within-group index), so the store never has to
 * track sequence numbers during editing.
 */
import {
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { QbAdminService, QbPlacement } from '../../services/qb-admin.service';
import { PalettePrompt } from '../qb-prompt-palette/qb-prompt-palette.component';

interface DesignPlacement extends QbPlacement {
  /** Display label for the row (override or the prompt's own name). */
  name: string;
  type: string;
}

interface DesignGroup {
  /** '' for the ungrouped bucket. */
  label: string;
  dropId: string;
  placements: DesignPlacement[];
}

@Component({
  selector: 'qb-form-designer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-form-designer.component.html',
  styleUrls: ['./qb-form-designer.component.scss'],
})
export class QbFormDesignerComponent implements OnInit {
  @Input({ required: true }) queryBuilderId!: string;
  @Input({ required: true }) datasourceId!: string;

  private readonly admin = inject(QbAdminService);
  private readonly global = inject(GlobalService);

  readonly groups = signal<DesignGroup[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  /** All drop-list ids so the palette + every group connect to each other. */
  readonly dropIds = computed(() => [
    'qb-palette',
    ...this.groups().map(g => g.dropId),
  ]);

  /** promptIds already placed, for greying the palette. */
  readonly placedIds = computed(
    () => new Set(this.groups().flatMap(g => g.placements.map(p => p.promptId))),
  );

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.getPlacements(this.queryBuilderId);
      const rows = res?.data?.placements ?? res?.data ?? [];
      this.hydrate(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load placements');
      this.hydrate([]);
    } finally {
      this.loading.set(false);
    }
  }

  private hydrate(rows: any[]): void {
    const byGroup = new Map<string, DesignPlacement[]>();
    for (const r of rows) {
      const label = r.groupLabel || '';
      if (!byGroup.has(label)) byGroup.set(label, []);
      byGroup.get(label)!.push({
        promptId: r.promptId,
        name: r.displayNameOverride || r.name || r.promptName || r.promptId,
        type: r.type || r.promptType || 'text',
        groupLabel: label || null,
        groupSequence: r.groupSequence ?? 0,
        promptSequence: r.promptSequence ?? 0,
        isMandatory: !!r.isMandatory,
        isLocked: !!r.isLocked,
        displayNameOverride: r.displayNameOverride ?? null,
      });
    }
    // Always keep an ungrouped bucket so there's a default drop target.
    if (!byGroup.has('')) byGroup.set('', []);
    const groups: DesignGroup[] = Array.from(byGroup.entries())
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
      .map(([label, placements], i) => ({
        label,
        dropId: `qb-group-${i}`,
        placements,
      }));
    this.groups.set(groups);
  }

  // ── Drag/drop ───────────────────────────────────────────────────────

  /** Drop within/between group lists, or from the palette. */
  drop(event: CdkDragDrop<DesignPlacement[]>, target: DesignGroup): void {
    if (event.previousContainer === event.container) {
      const list = [...target.placements];
      moveItemInArray(list, event.previousIndex, event.currentIndex);
      this.replaceGroup(target.dropId, list);
      return;
    }
    // Coming from the palette: the dragged data is a PalettePrompt.
    const data: any = event.item.data;
    if (data && 'promptId' in data && !('isMandatory' in data)) {
      const prompt = data as PalettePrompt;
      if (this.placedIds().has(prompt.promptId)) {
        this.global.showInfo('This prompt is already placed');
        return;
      }
      const placement: DesignPlacement = {
        promptId: prompt.promptId,
        name: prompt.name,
        type: prompt.type,
        groupLabel: target.label || null,
        groupSequence: 0,
        promptSequence: 0,
        isMandatory: false,
        isLocked: false,
        displayNameOverride: null,
      };
      const list = [...target.placements];
      list.splice(event.currentIndex, 0, placement);
      this.replaceGroup(target.dropId, list);
      return;
    }
    // Moving a placement between two groups.
    this.groups.update(groups => {
      const from = groups.find(g => g.placements === event.previousContainer.data);
      const to = groups.find(g => g.dropId === target.dropId);
      if (!from || !to) return groups;
      const fromList = [...from.placements];
      const toList = [...to.placements];
      transferArrayItem(
        fromList,
        toList,
        event.previousIndex,
        event.currentIndex,
      );
      return groups.map(g => {
        if (g.dropId === from.dropId) return { ...g, placements: fromList };
        if (g.dropId === to.dropId) {
          return {
            ...g,
            placements: toList.map(p => ({ ...p, groupLabel: to.label || null })),
          };
        }
        return g;
      });
    });
  }

  private replaceGroup(dropId: string, placements: DesignPlacement[]): void {
    this.groups.update(groups =>
      groups.map(g => (g.dropId === dropId ? { ...g, placements } : g)),
    );
  }

  // ── Groups ──────────────────────────────────────────────────────────

  addGroup(): void {
    this.groups.update(groups => {
      const n = groups.filter(g => g.label).length + 1;
      const next: DesignGroup = {
        label: `Group ${n}`,
        dropId: `qb-group-new-${groups.length}`,
        placements: [],
      };
      // Insert before the trailing ungrouped bucket.
      const idx = groups.findIndex(g => g.label === '');
      const copy = [...groups];
      copy.splice(idx < 0 ? copy.length : idx, 0, next);
      return copy;
    });
  }

  renameGroup(dropId: string, label: string): void {
    this.groups.update(groups =>
      groups.map(g =>
        g.dropId === dropId
          ? {
              ...g,
              label,
              placements: g.placements.map(p => ({
                ...p,
                groupLabel: label || null,
              })),
            }
          : g,
      ),
    );
  }

  removeGroup(dropId: string): void {
    // Move its placements back to the ungrouped bucket rather than dropping them.
    this.groups.update(groups => {
      const victim = groups.find(g => g.dropId === dropId);
      if (!victim || victim.label === '') return groups;
      const orphans = victim.placements.map(p => ({ ...p, groupLabel: null }));
      return groups
        .filter(g => g.dropId !== dropId)
        .map(g =>
          g.label === ''
            ? { ...g, placements: [...g.placements, ...orphans] }
            : g,
        );
    });
  }

  // ── Per-placement flags ─────────────────────────────────────────────

  toggleFlag(
    dropId: string,
    promptId: string,
    flag: 'isMandatory' | 'isLocked',
    value: boolean,
  ): void {
    this.groups.update(groups =>
      groups.map(g =>
        g.dropId === dropId
          ? {
              ...g,
              placements: g.placements.map(p =>
                p.promptId === promptId ? { ...p, [flag]: value } : p,
              ),
            }
          : g,
      ),
    );
  }

  removePlacement(dropId: string, promptId: string): void {
    this.groups.update(groups =>
      groups.map(g =>
        g.dropId === dropId
          ? {
              ...g,
              placements: g.placements.filter(p => p.promptId !== promptId),
            }
          : g,
      ),
    );
  }

  /** In-form display name for this placement (falls back to the prompt name). */
  setDisplayName(dropId: string, promptId: string, value: string): void {
    const trimmed = (value ?? '').trim();
    this.groups.update(groups =>
      groups.map(g =>
        g.dropId === dropId
          ? {
              ...g,
              placements: g.placements.map(p =>
                p.promptId === promptId
                  ? { ...p, displayNameOverride: trimmed || null }
                  : p,
              ),
            }
          : g,
      ),
    );
  }

  // ── Save ────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const payload: QbPlacement[] = [];
      this.groups().forEach((g, gi) => {
        g.placements.forEach((p, pi) => {
          payload.push({
            promptId: p.promptId,
            groupLabel: g.label || null,
            groupSequence: gi,
            promptSequence: pi,
            isMandatory: p.isMandatory,
            isLocked: p.isLocked,
            displayNameOverride: p.displayNameOverride ?? null,
          });
        });
      });
      const res = await this.admin.savePlacements(this.queryBuilderId, payload);
      this.global.handleAPIResponse(res);
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  trackByGroup = (_: number, g: DesignGroup) => g.dropId;
  trackByPlacement = (_: number, p: DesignPlacement) => p.promptId;
}
