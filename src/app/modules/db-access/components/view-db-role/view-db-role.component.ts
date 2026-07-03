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
import { DbAccessService } from '../../services/db-access.service';

/**
 * ViewDbRoleComponent — read-only detail for a group role: hero header +
 * detail sections (attributes, member count / member-of, mapped app
 * users / groups, effective privileges summary). Mirrors view-datasource's
 * hero-card + info-card layout.
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
  effective: any[] = [];
  effectiveLoading = false;
  mappings: any[] = [];

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.datasourceId = this.route.snapshot.paramMap.get('datasourceId') ?? '';
    this.roleName = this.route.snapshot.paramMap.get('roleName') ?? '';
    this.load();
  }

  private load(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        this.role = all.find(r => r.name === this.roleName) ?? null;
        if (!this.role) {
          this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
          return;
        }
        this.loadEffective();
        this.loadMappings();
      })
      .catch(() =>
        this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]),
      )
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private loadEffective(): void {
    this.effectiveLoading = true;
    this.dbAccess
      .loadEffective(this.datasourceId, this.roleName)
      .then(res => {
        this.effective = res?.status ? (res.data ?? []) : [];
      })
      .catch(() => (this.effective = []))
      .finally(() => {
        this.effectiveLoading = false;
        this.cdr.markForCheck();
      });
  }

  private loadMappings(): void {
    this.dbAccess
      .loadMappings(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.mappings() ?? [];
        this.mappings = all.filter(m => m.dbRoleName === this.roleName);
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  get attrs(): any {
    return this.role?.attributes ?? this.role ?? {};
  }

  flags(): string[] {
    const a = this.attrs;
    const flags: string[] = [];
    if (a.createdb) flags.push('CREATEDB');
    if (a.createrole) flags.push('CREATEROLE');
    if (a.inherit !== false) flags.push('INHERIT');
    return flags;
  }

  get memberCount(): number {
    return this.role?.memberCount ?? this.role?.members?.length ?? 0;
  }

  mappingLabel(m: any): string {
    return (
      m.appUserName || m.appGroupName || m.appUserId || m.appGroupId || '—'
    );
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
  }

  onEdit(): void {
    this.router.navigate([
      DB_ACCESS.roleEdit(this.datasourceId, this.roleName),
    ]);
  }
}
