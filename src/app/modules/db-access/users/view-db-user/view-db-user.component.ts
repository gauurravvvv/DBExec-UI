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

/**
 * ViewDbUserComponent — read-only detail for a login role: hero header +
 * detail sections (attributes, member-of, and an effective-privileges
 * summary). Mirrors view-datasource's hero + info-card layout. Datasource
 * carried by ?ds=.
 */
@Component({
  selector: 'app-view-db-user',
  templateUrl: './view-db-user.component.html',
  styleUrls: ['./view-db-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDbUserComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  roleName = '';
  loading = true;
  user: any = null;
  effective: any[] = [];
  effectiveLoading = false;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.datasourceId =
      this.route.snapshot.queryParamMap.get('ds') || this.ctx.datasourceId() || '';
    this.roleName = this.route.snapshot.paramMap.get('roleName') ?? '';
    if (!this.datasourceId) {
      this.router.navigate([DB_ACCESS.USERS_LIST]);
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
        this.user = all.find(r => r.name === this.roleName) ?? null;
        if (!this.user) {
          this.goBack();
          return;
        }
        this.loadEffective();
      })
      .catch(() => this.goBack())
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private loadEffective(): void {
    this.effectiveLoading = true;
    this.dbAccess
      .loadEffective(this.datasourceId, this.roleName)
      .then(res => (this.effective = res?.status ? (res.data ?? []) : []))
      .catch(() => (this.effective = []))
      .finally(() => {
        this.effectiveLoading = false;
        this.cdr.markForCheck();
      });
  }

  get attrs(): any {
    return this.user?.attributes ?? this.user ?? {};
  }

  flags(): string[] {
    const a = this.attrs;
    const flags: string[] = [];
    if (a.superuser) flags.push('SUPERUSER');
    if (a.createdb) flags.push('CREATEDB');
    if (a.createrole) flags.push('CREATEROLE');
    if (a.replication) flags.push('REPLICATION');
    if (a.bypassrls) flags.push('BYPASSRLS');
    if (a.inherit !== false) flags.push('INHERIT');
    return flags;
  }

  status(): 'active' | 'no-login' | 'expired' {
    const a = this.attrs;
    if (!(this.user?.canLogin || a.login)) return 'no-login';
    const validUntil = a.validUntil ?? this.user?.validUntil;
    if (validUntil && new Date(validUntil).getTime() < Date.now()) return 'expired';
    return 'active';
  }

  get connLimit(): string {
    const cl = this.attrs.connectionLimit ?? this.user?.connectionLimit;
    if (cl === -1 || cl == null) return this.translate.instant('DB_ACCESS.UNLIMITED');
    return String(cl);
  }

  get validUntil(): string | null {
    return this.attrs.validUntil ?? this.user?.validUntil ?? null;
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.USERS_LIST], { queryParams: { ds: this.datasourceId } });
  }

  onEdit(): void {
    this.router.navigate([DB_ACCESS.userEdit(this.roleName)], {
      queryParams: { ds: this.datasourceId },
    });
  }
}
