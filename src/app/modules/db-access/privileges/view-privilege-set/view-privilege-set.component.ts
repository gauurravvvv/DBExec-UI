import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';

/**
 * ViewPrivilegeSetComponent — read-only detail for a saved privilege set
 * (a db_role_template row): name, description, and its structured privilege
 * definition rendered as plain-language scope rows. Datasource carried by
 * ?ds= for back-nav consistency.
 */
@Component({
  selector: 'app-view-privilege-set',
  templateUrl: './view-privilege-set.component.html',
  styleUrls: ['./view-privilege-set.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewPrivilegeSetComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  setId = '';
  loading = true;
  set: any = null;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.datasourceId =
      this.route.snapshot.queryParamMap.get('ds') || this.ctx.datasourceId() || '';
    this.setId = this.route.snapshot.paramMap.get('id') ?? '';
    this.load();
  }

  private load(): void {
    this.dbAccess
      .loadTemplates()
      .then(() => {
        const all = this.dbAccess.templates() ?? [];
        this.set = all.find(t => String(t.id) === this.setId) ?? null;
        if (!this.set) this.goBack();
      })
      .catch(() => this.goBack())
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  get definition(): any[] {
    const def = this.set?.definition;
    if (!def) return [];
    return Array.isArray(def) ? def : [];
  }

  scopeText(entry: any): string {
    const scope = entry.scope ?? {};
    if (scope.allInSchema) return `all in ${scope.schema}`;
    if (scope.objects?.length) return `${scope.objects.join(', ')} in ${scope.schema}`;
    return scope.schema || '—';
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.PRIVILEGES_LIST], { queryParams: { ds: this.datasourceId } });
  }
}
