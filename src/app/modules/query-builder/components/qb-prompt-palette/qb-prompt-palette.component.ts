/**
 * qb-prompt-palette — the searchable prompt library for the form designer.
 *
 * Lists every prompt available for the builder's datasource, grouped by the
 * prompt's groupName, filtered by a search box. Each chip is a CDK drag source
 * the designer drops into a group; already-placed prompts are greyed so the
 * admin sees at a glance what's left to add.
 */
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
import { QbAdminService } from '../../services/qb-admin.service';

export interface PalettePrompt {
  promptId: string;
  name: string;
  type: string;
  groupName: string | null;
}

@Component({
  selector: 'qb-prompt-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qb-prompt-palette.component.html',
  styleUrls: ['./qb-prompt-palette.component.scss'],
})
export class QbPromptPaletteComponent implements OnInit {
  @Input({ required: true }) datasourceId!: string;
  /** promptIds already placed — rendered greyed. */
  @Input() placedIds: Set<string> = new Set();
  /** CDK drop-list id this palette connects to. */
  @Input() connectedTo: string[] = [];

  private readonly admin = inject(QbAdminService);
  private readonly global = inject(GlobalService);

  readonly all = signal<PalettePrompt[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');

  /** Prompts filtered by the search term. */
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.all();
    if (!q) return list;
    return list.filter(p => p.name.toLowerCase().includes(q));
  });

  /** Filtered prompts bucketed by groupName ('' bucket rendered last). */
  readonly groups = computed(() => {
    const buckets = new Map<string, PalettePrompt[]>();
    for (const p of this.filtered()) {
      const key = p.groupName || '';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(p);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])))
      .map(([label, prompts]) => ({ label, prompts }));
  });

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.listPrompts(this.datasourceId);
      const rows = res?.data?.prompts ?? res?.data ?? [];
      this.all.set(
        (Array.isArray(rows) ? rows : []).map((p: any) => ({
          promptId: p.id ?? p.promptId,
          name: p.name ?? p.displayName ?? '',
          type: p.type ?? 'text',
          groupName: p.groupName ?? null,
        })),
      );
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load prompts');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(value: string): void {
    this.search.set(value ?? '');
  }

  isPlaced(id: string): boolean {
    return this.placedIds.has(id);
  }

  trackByGroup = (_: number, g: { label: string }) => g.label;
  trackByPrompt = (_: number, p: PalettePrompt) => p.promptId;
}
