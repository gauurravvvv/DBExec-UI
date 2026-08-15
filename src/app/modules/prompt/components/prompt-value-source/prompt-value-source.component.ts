/**
 * prompt-value-source — admin editor for where a prompt's options come from.
 * Lives in the Prompt module (value-source is prompt-level config, configured
 * once and identical in every Query Builder). Five ways, four persisted kinds:
 *
 *   free            no list (text search, arbitrary values)
 *   static          curated list — typed by hand or bulk-pasted / CSV
 *   lookup_query    an admin SELECT returning value (+ optional display)
 *   distinct_column pick schema.table.column -> generated SELECT DISTINCT
 *
 * A Preview runs the chosen source (or shows the static list) so the admin
 * sees exactly what they configured before saving. On save the server probes
 * cardinality and, above the threshold, forces server-paged typeahead at
 * runtime — surfaced here as a warning.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { PromptService } from '../../services/prompt.service';

type Kind = 'free' | 'static' | 'lookup_query' | 'distinct_column' | 'upload';

interface StaticRow {
  value: string;
  display: string;
}

@Component({
  selector: 'prompt-value-source',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './prompt-value-source.component.html',
  styleUrls: ['./prompt-value-source.component.scss'],
})
export class PromptValueSourceComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @Input({ required: true }) promptId!: string;

  private readonly admin = inject(PromptService);
  private readonly global = inject(GlobalService);
  private readonly codeEditor = inject(CodeEditorService);

  @ViewChild('sqlHost') sqlHost?: ElementRef<HTMLElement>;
  private sqlHandle: EditorHandle | null = null;
  private lookupSql = '';

  readonly kind = signal<Kind>('free');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly previewing = signal(false);
  readonly cardinality = signal<number | null>(null);

  // static
  readonly staticRows = signal<StaticRow[]>([]);
  readonly pasteText = signal('');

  // distinct_column
  readonly dcSchema = signal('');
  readonly dcTable = signal('');
  readonly dcColumn = signal('');
  readonly dcDisplay = signal('');

  // preview
  readonly previewRows = signal<{ value: string; display: string }[]>([]);
  readonly previewTotal = signal<number | null>(null);

  // upload (CSV/XLSX -> parsed + cached as static)
  readonly uploadFile = signal<File | null>(null);
  readonly valueColumn = signal('');
  readonly labelColumn = signal('');
  readonly hasHeaderRow = signal(true);
  readonly uploadSample = signal<{ value: string; display: string }[]>([]);
  readonly uploadRowCount = signal<number | null>(null);
  readonly uploadServerMode = signal(false);
  readonly uploading = signal(false);
  readonly showReuploadDialog = signal(false);

  readonly kinds = [
    { key: 'free' as const, label: 'QUERY_BUILDER.VS.FREE', icon: 'pi pi-pencil' },
    { key: 'static' as const, label: 'QUERY_BUILDER.VS.STATIC', icon: 'pi pi-list' },
    {
      key: 'lookup_query' as const,
      label: 'QUERY_BUILDER.VS.LOOKUP',
      icon: 'pi pi-code',
    },
    {
      key: 'distinct_column' as const,
      label: 'QUERY_BUILDER.VS.DISTINCT',
      icon: 'pi pi-database',
    },
    {
      key: 'upload' as const,
      label: 'PROMPT_MODULE.VS.UPLOAD',
      icon: 'pi pi-upload',
    },
  ];

  readonly showThresholdWarning = computed(() => {
    const c = this.cardinality();
    return c != null && c > 500;
  });

  async ngOnInit(): Promise<void> {
    try {
      const res = await this.admin.getValueSource(this.promptId);
      const d = res?.data;
      if (d) {
        this.kind.set((d.valueSourceKind as Kind) ?? 'free');
        this.cardinality.set(d.cardinality ?? null);
        this.lookupSql = d.valuesSql ?? '';
      }
    } catch (e: any) {
      this.global.showWarn(e?.error?.message || 'Failed to load value source');
    } finally {
      this.loading.set(false);
    }
  }

  async ngAfterViewInit(): Promise<void> {
    // Mount the SQL editor lazily whenever the lookup host appears.
    await this.mountSqlIfNeeded();
  }

  private async mountSqlIfNeeded(): Promise<void> {
    if (this.kind() !== 'lookup_query' || !this.sqlHost || this.sqlHandle) return;
    this.sqlHandle = await this.codeEditor.create({
      host: this.sqlHost.nativeElement,
      flavour: 'sql',
      value: this.lookupSql,
    });
  }

  async setKind(k: Kind): Promise<void> {
    this.kind.set(k);
    // Give the *ngIf host a tick to render before mounting Monaco.
    setTimeout(() => this.mountSqlIfNeeded(), 0);
  }

  // ── static list editing ──────────────────────────────────────────────

  addStaticRow(): void {
    this.staticRows.update(r => [...r, { value: '', display: '' }]);
  }
  removeStaticRow(i: number): void {
    this.staticRows.update(r => r.filter((_, idx) => idx !== i));
  }
  setStaticValue(i: number, value: string): void {
    this.staticRows.update(r =>
      r.map((row, idx) => (idx === i ? { ...row, value } : row)),
    );
  }
  setStaticDisplay(i: number, display: string): void {
    this.staticRows.update(r =>
      r.map((row, idx) => (idx === i ? { ...row, display } : row)),
    );
  }

  /** Bulk import: parse pasted lines "value" or "value,display" into rows. */
  importPaste(): void {
    const text = this.pasteText().trim();
    if (!text) return;
    const rows: StaticRow[] = [];
    const seen = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [value, display] = trimmed.split(/[,\t]/).map(s => s.trim());
      if (!value || seen.has(value)) continue;
      seen.add(value);
      rows.push({ value, display: display || value });
    }
    this.staticRows.update(existing => {
      const merged = [...existing];
      for (const row of rows) {
        if (!merged.some(m => m.value === row.value)) merged.push(row);
      }
      return merged;
    });
    this.pasteText.set('');
  }

  // ── upload (CSV/XLSX) — parsed server-side, cached as static ───────────

  onFile(file: File | null): void {
    this.uploadFile.set(file);
  }

  /** First upload uploads directly; a re-upload over an existing set confirms. */
  requestUpload(): void {
    if ((this.cardinality() ?? 0) > 0) this.showReuploadDialog.set(true);
    else this.doUpload();
  }

  async doUpload(justification?: string): Promise<void> {
    const file = this.uploadFile();
    if (!file || !this.valueColumn().trim()) {
      this.global.showWarn('Choose a file and a value column');
      return;
    }
    this.uploading.set(true);
    try {
      const res = await this.admin.uploadValues(this.promptId, file, {
        valueColumn: this.valueColumn().trim(),
        labelColumn: this.labelColumn().trim() || undefined,
        hasHeaderRow: this.hasHeaderRow(),
        justification,
      });
      if (res?.status) {
        this.uploadSample.set(res.data?.sample ?? []);
        this.uploadRowCount.set(res.data?.parsedRowCount ?? null);
        this.uploadServerMode.set(!!res.data?.serverMode);
        this.cardinality.set(res.data?.cardinality ?? null);
        this.global.handleAPIResponse(res);
      } else {
        this.applyErrors(res);
      }
    } catch (e: any) {
      this.applyErrors(e?.error);
    } finally {
      this.uploading.set(false);
      this.showReuploadDialog.set(false);
    }
  }

  // ── build the PromptValueSource payload from the current UI state ──────

  private buildSource(): any {
    const k = this.kind();
    if (k === 'static') {
      return {
        kind: 'static',
        options: this.staticRows()
          .filter(r => r.value.trim())
          .map(r => ({ value: r.value.trim(), display: r.display.trim() || undefined })),
      };
    }
    if (k === 'lookup_query') {
      return { kind: 'lookup_query', sql: this.currentSql() };
    }
    if (k === 'distinct_column') {
      const source: any = {
        kind: 'distinct_column',
        schema: this.dcSchema().trim(),
        table: this.dcTable().trim(),
        column: this.dcColumn().trim(),
      };
      if (this.dcDisplay().trim()) source.displayColumn = this.dcDisplay().trim();
      return source;
    }
    return { kind: 'free' };
  }

  private currentSql(): string {
    // Read straight from Monaco when mounted; fall back to the last stored SQL.
    return (this.sqlHandle as any)?.getValue?.() ?? this.lookupSql;
  }

  // ── preview + save ────────────────────────────────────────────────────

  async preview(): Promise<void> {
    this.previewing.set(true);
    try {
      const res = await this.admin.previewValues(this.promptId, this.buildSource(), 50);
      if (res?.status) {
        this.previewRows.set(res.data?.options ?? []);
        this.previewTotal.set(res.data?.total ?? null);
      } else {
        this.applyErrors(res);
      }
    } catch (e: any) {
      this.applyErrors(e?.error);
    } finally {
      this.previewing.set(false);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const res = await this.admin.saveValueSource(this.promptId, this.buildSource());
      if (res?.status) {
        this.cardinality.set(res.data?.cardinality ?? null);
        if (res.data?.warning) this.global.showWarn(res.data.warning);
        this.global.handleAPIResponse(res);
      } else {
        this.applyErrors(res);
      }
    } catch (e: any) {
      this.applyErrors(e?.error);
    } finally {
      this.saving.set(false);
    }
  }

  private applyErrors(res: any): void {
    // Value-source PUT/preview return { data: { errors: [{message}] } }; the
    // upload endpoint returns { data: { code, message } }. Handle both.
    const err = res?.data?.errors?.[0];
    this.global.showWarn(
      err?.message || res?.data?.message || res?.message || 'Operation failed',
    );
  }

  ngOnDestroy(): void {
    this.sqlHandle?.dispose();
    this.sqlHandle = null;
  }

  trackByIndex = (i: number) => i;
}
