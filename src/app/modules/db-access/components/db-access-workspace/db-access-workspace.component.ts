import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DbAccessService } from '../../services/db-access.service';

/**
 * DbAccessWorkspaceComponent — the per-datasource shell. Reads
 * :datasourceId from the route, probes capability once, and hosts the
 * feature tabs (Users / Roles / Privileges / Effective / Mappings /
 * Audit) via p-tabView. `canManage` flows down to every child so
 * read-only mode disables mutations app-wide.
 */
@Component({
  selector: 'app-db-access-workspace',
  templateUrl: './db-access-workspace.component.html',
  styleUrls: ['./db-access-workspace.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbAccessWorkspaceComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  capability: any = null;
  loadingCapability = true;
  activeIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dbAccess: DbAccessService,
  ) {}

  ngOnInit(): void {
    this.datasourceId = this.route.snapshot.paramMap.get('datasourceId') ?? '';
    if (!this.datasourceId) {
      this.router.navigate(['/app/db-access']);
      return;
    }
    this.dbAccess
      .loadCapability(this.datasourceId)
      .then(res => {
        if (res?.status) this.capability = res.data;
      })
      .catch(() => {
        // Non-postgres or unreachable — bounce back to the picker.
        this.router.navigate(['/app/db-access']);
      })
      .finally(() => {
        this.loadingCapability = false;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.dbAccess.cancelReads();
    this.dbAccess.reset();
  }

  get canManage(): boolean {
    return !!this.capability?.canManage;
  }

  get datasourceName(): string {
    return this.capability?.datasourceName ?? this.capability?.name ?? '';
  }

  back(): void {
    this.router.navigate(['/app/db-access']);
  }
}
