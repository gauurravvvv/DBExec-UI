import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import {
  downloadAccessCsv,
  downloadAccessJson,
} from '../../services/access-export.util';

/**
 * ViewDbRoleComponent — read-only detail for a group role: hero header +
 * detail sections (attributes, member count / member-of, effective
 * privileges). Datasource carried by ?ds=.
 */
@Component({
  selector: 'app-view-db-role',
  templateUrl: './view-db-role.component.html',
  styleUrls: ['./view-db-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDbRoleComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  roleName = '';
  loading = true;
  role: any = null;
  exporting = false;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Datasource comes from the shared context (never the URL). A cold
    // deep-link with no context falls through to the redirect below.
    this.datasourceId = this.ctx.datasourceId() || '';
    this.roleName = this.route.snapshot.paramMap.get('roleName') ?? '';
    if (!this.datasourceId) {
      this.router.navigate([DB_ACCESS.ROLES_LIST]);
      return;
    }
    this.ctx.setDatasource(this.datasourceId);
    this.load();
  }

  private load(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        this.role = all.find(r => r.name === this.roleName) ?? null;
        if (!this.role) {
          this.goBack();
          return;
        }
        // Effective privileges are loaded lazily by <app-privilege-tree>.
      })
      .catch(() => this.goBack())
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  get attrs(): any {
    return this.role?.attributes ?? this.role ?? {};
  }

  /** A login user (canLogin) vs a group role. Drives which cards show. */
  get isLogin(): boolean {
    return !!(this.role?.canLogin || this.attrs.login);
  }

  status(): 'active' | 'no-login' | 'expired' {
    if (!this.isLogin) return 'no-login';
    const validUntil = this.attrs.validUntil;
    if (validUntil && new Date(validUntil).getTime() < Date.now())
      return 'expired';
    return 'active';
  }

  /** Map the lifecycle status to an app-chip semantic tone. */
  statusTone(): 'success' | 'error' | 'neutral' {
    switch (this.status()) {
      case 'active':
        return 'success';
      case 'expired':
        return 'error';
      default:
        return 'neutral';
    }
  }

  get validUntil(): string | null {
    return this.attrs.validUntil ?? null;
  }

  get connLimit(): string {
    const cl = this.attrs.connectionLimit;
    if (cl === -1 || cl == null)
      return this.translate.instant('DB_ACCESS.UNLIMITED');
    return String(cl);
  }

  flags(): string[] {
    const a = this.attrs;
    const flags: string[] = [];
    // Login-only capability flags first.
    if (this.isLogin) {
      if (a.superuser) flags.push('SUPERUSER');
      if (a.replication) flags.push('REPLICATION');
      if (a.bypassrls) flags.push('BYPASSRLS');
    }
    if (a.createdb) flags.push('CREATEDB');
    if (a.createrole) flags.push('CREATEROLE');
    if (a.inherit !== false) flags.push('INHERIT');
    return flags;
  }

  get memberCount(): number {
    return this.role?.memberCount ?? this.role?.members?.length ?? 0;
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.ROLES_LIST]);
  }

  onEdit(): void {
    this.router.navigate([DB_ACCESS.roleEdit(this.roleName)]);
  }

  /**
   * Fetch this role's full access profile and download it as JSON or
   * CSV. Live read from the datasource — nothing persisted.
   */
  exportAccess(format: 'json' | 'csv'): void {
    if (this.exporting) return;
    this.exporting = true;
    this.cdr.markForCheck();
    this.dbAccess
      .exportRoleAccess(this.datasourceId, this.roleName)
      .then(res => {
        if (res?.status && res.data) {
          if (format === 'csv') downloadAccessCsv(res.data);
          else downloadAccessJson(res.data);
        } else {
          this.globalService.handleSuccessService(res);
        }
      })
      .catch(() => {
        /* interceptor toasts the error */
      })
      .finally(() => {
        this.exporting = false;
        this.cdr.markForCheck();
      });
  }
}
