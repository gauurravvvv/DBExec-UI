import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessService } from '../../services/db-access.service';

/**
 * DbAuditComponent — the append-only operation log for this datasource
 * (action, actor, target role, outcome, timestamp) + an Export button
 * that downloads the full grant snapshot as JSON (FR-7.1 / FR-7.5).
 */
@Component({
  selector: 'app-db-audit',
  templateUrl: './db-audit.component.html',
  styleUrls: ['./db-audit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbAuditComponent implements OnInit {
  @Input() datasourceId = '';

  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  rows: any[] = [];
  exporting = false;

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.dbAccess.loadAudit(this.datasourceId).then(() => {
      this.rows = this.dbAccess.audit() ?? [];
      this.cdr.markForCheck();
    }).catch(() => this.cdr.markForCheck());
  }

  export(): void {
    this.exporting = true;
    this.cdr.markForCheck();
    this.dbAccess
      .exportGrants(this.datasourceId)
      .then(res => {
        const payload = res?.data ?? res;
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `db-access-grants-${this.datasourceId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {})
      .finally(() => {
        this.exporting = false;
        this.cdr.markForCheck();
      });
  }
}
