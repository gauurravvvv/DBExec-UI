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
import { BlockType } from '../../services/fb-types';
import { FbAdminService } from '../../services/fb-admin.service';
import {
  LAYOUT_TILES,
  isLayoutType,
  promptTypeIcon,
} from '../../helpers/fb-prompt-type-icons';

export interface PalettePrompt {
  promptId: string | null;
  name: string;
  type: string;
  dataType: string | null;
  groupName: string | null;
  blockType: BlockType | null;
}

/**
 * Left pane — the draggable prompt library grouped by type, plus a synthetic
 * "Layout" group of block tiles. The container is a CDK drop-list with sorting
 * disabled (drag OUT only), connected to every section drop-id.
 */
@Component({
  selector: 'fb-prompt-palette',
  templateUrl: './fb-prompt-palette.component.html',
  styleUrls: ['./fb-prompt-palette.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbPromptPaletteComponent implements OnInit {
  @Input({ required: true }) datasourceId!: string;
  @Input() placedIds: Set<string> = new Set();
  @Input() connectedTo: string[] = [];
  @Input() disabled = false;

  private readonly admin = inject(FbAdminService);
  private readonly global = inject(GlobalService);

  readonly all = signal<PalettePrompt[]>([]);
  readonly loading = signal(true);
  readonly search = signal('');
  readonly icon = promptTypeIcon;
  readonly isLayout = isLayoutType;

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.all();
    return q ? list.filter(p => p.name.toLowerCase().includes(q)) : list;
  });

  readonly groups = computed(() => {
    const buckets = new Map<string, PalettePrompt[]>();
    for (const p of this.filtered()) {
      const key = p.groupName || p.type || '';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(p);
    }
    // Append the synthetic Layout group last.
    buckets.set('FORM_BUILDER.LAYOUT.GROUP', [...LAYOUT_TILES]);
    return Array.from(buckets.entries()).map(([label, prompts]) => ({
      label,
      prompts,
    }));
  });

  async ngOnInit(): Promise<void> {
    if (!this.datasourceId) {
      this.loading.set(false);
      return;
    }
    try {
      const res = await this.admin.listPrompts(this.datasourceId);
      const rows = res?.data?.prompts ?? res?.data ?? [];
      this.all.set(
        (Array.isArray(rows) ? rows : []).map((p: any) => ({
          promptId: p.id ?? p.promptId,
          name: p.name ?? p.displayName ?? '',
          type: p.type ?? 'text',
          dataType: p.dataType ?? null,
          groupName: p.groupName ?? null,
          blockType: null,
        })),
      );
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load prompts');
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(v: string): void {
    this.search.set(v ?? '');
  }
  isPlaced(id: string | null): boolean {
    return !!id && this.placedIds.has(id);
  }

  trackByGroup = (_: number, g: { label: string }) => g.label;
  trackByPrompt = (_: number, p: PalettePrompt) =>
    p.blockType ?? p.promptId ?? p.type;
}
