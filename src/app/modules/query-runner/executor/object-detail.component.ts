import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { QueryRunnerService } from '../services/query-runner.service';

export type ObjectKind =
  'table' | 'view' | 'matview' | 'function' | 'sequence' | 'trigger';

/**
 * ObjectDetailComponent — a read-only, tabbed modal describing one DB
 * object. Fetches its detail on open (when [visible] flips true and a
 * target is set) and switches tabs by object kind:
 *   table    → Columns · Indexes · Constraints · Triggers · DDL · Info
 *   view     → Columns · Definition · Info
 *   matview  → Columns · Definition · Indexes · Info (+ Refresh)
 *   function → Signature · Source · Info
 *   sequence → Info
 * No editing here — changes are made as SQL in the editor.
 */
@Component({
  selector: 'app-object-detail',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './object-detail.component.html',
  styleUrls: ['./object-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObjectDetailComponent implements OnChanges {
  private cdr = inject(ChangeDetectorRef);

  @Input() visible = false;
  @Input() connectionId = '';
  @Input() kind: ObjectKind | null = null;
  @Input() schema = '';
  @Input() name = '';
  @Input() table = ''; // owning table (triggers only)

  @Output() closed = new EventEmitter<void>();

  loading = false;
  error = '';
  detail: any = null;
  activeTab = '';
  refreshing = false;

  private lastKey = '';

  constructor(private service: QueryRunnerService) {}

  ngOnChanges(): void {
    if (!this.visible || !this.kind || !this.name) return;
    const key = `${this.kind}:${this.schema}.${this.table}.${this.name}`;
    if (key === this.lastKey) return; // already loaded this target
    this.lastKey = key;
    this.load();
  }

  /** Tabs available for the current kind (only rendered if data present). */
  get tabs(): string[] {
    switch (this.kind) {
      case 'table': {
        const base = ['columns', 'indexes', 'constraints', 'triggers'];
        // Partitions only when the table actually has children.
        if (this.detail?.partitions?.length) base.push('partitions');
        base.push('dependencies', 'permissions', 'stats', 'ddl', 'info');
        return base;
      }
      case 'matview':
        return ['columns', 'definition', 'indexes', 'info'];
      case 'view':
        return ['columns', 'definition', 'dependencies', 'info'];
      case 'function':
        return ['signature', 'source', 'info'];
      case 'sequence':
        return ['info'];
      case 'trigger':
        return ['definition', 'info'];
      default:
        return [];
    }
  }

  private load(): void {
    this.loading = true;
    this.error = '';
    this.detail = null;
    this.cdr.markForCheck();

    const done = (res: any) => {
      if (res?.status && res.data) {
        this.detail = res.data;
        this.activeTab = this.tabs[0] ?? '';
      } else {
        this.error = res?.message || 'Failed to load object';
      }
    };
    const fail = (e: any) => {
      this.error = e?.message || 'Failed to load object';
    };

    let req: Promise<any>;
    switch (this.kind) {
      case 'table':
        req = this.service.getTableDetail(
          this.connectionId,
          this.schema,
          this.name,
        );
        break;
      case 'view':
        req = this.service.getViewDetail(
          this.connectionId,
          this.schema,
          this.name,
          false,
        );
        break;
      case 'matview':
        req = this.service.getViewDetail(
          this.connectionId,
          this.schema,
          this.name,
          true,
        );
        break;
      case 'function':
        req = this.service.getFunctionDetail(
          this.connectionId,
          this.schema,
          this.name,
        );
        break;
      case 'sequence':
        req = this.service.getSequenceDetail(
          this.connectionId,
          this.schema,
          this.name,
        );
        break;
      case 'trigger':
        req = this.service.getTriggerDetail(
          this.connectionId,
          this.schema,
          this.table,
          this.name,
        );
        break;
      default:
        req = Promise.resolve({ status: false });
    }
    req
      .then(done)
      .catch(fail)
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  setTab(t: string): void {
    this.activeTab = t;
    this.cdr.markForCheck();
  }

  refreshMatview(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    this.cdr.markForCheck();
    this.service
      .refreshMatview(this.connectionId, this.schema, this.name)
      .catch(() => {})
      .finally(() => {
        this.refreshing = false;
        this.cdr.markForCheck();
      });
  }

  copy(text: string): void {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  close(): void {
    this.lastKey = ''; // so re-opening the same object re-fetches
    this.closed.emit();
  }

  humanSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }
}
