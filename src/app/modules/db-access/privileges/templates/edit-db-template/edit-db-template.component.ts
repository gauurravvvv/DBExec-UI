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
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbTemplateService } from '../../../services/db-template.service';

type RuleLevel =
  | 'database'
  | 'schema'
  | 'table'
  | 'column'
  | 'sequence'
  | 'function';

/** One editable privilege rule row (abstract — no concrete schema/table). */
interface RuleRow {
  action: 'grant' | 'revoke';
  level: RuleLevel;
  privileges: string[];
  scope: 'allInSchema' | 'named';
  withGrantOption: boolean;
}

/** Per-level privilege vocab (mirrors the composer). */
const PRIVS: Record<RuleLevel, string[]> = {
  database: ['CONNECT', 'CREATE', 'TEMPORARY'],
  schema: ['USAGE', 'CREATE'],
  table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'ALL'],
  column: ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
  sequence: ['USAGE', 'SELECT', 'UPDATE', 'ALL'],
  function: ['EXECUTE', 'ALL'],
};

/**
 * EditDbTemplateComponent — create OR edit a role/privilege template
 * (PDM D10). One component for both (id in the route ⇒ edit). A template
 * is abstract: attribute flags + privilege RULES with no concrete
 * schema/table (resolved when applied). Built-ins are read-only and can't
 * reach this screen (the list hides their Edit action + the BE refuses).
 */
@Component({
  selector: 'app-edit-db-template',
  templateUrl: './edit-db-template.component.html',
  styleUrls: ['./edit-db-template.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDbTemplateComponent implements OnInit, HasUnsavedChanges {
  private cdr = inject(ChangeDetectorRef);
  private tpl = inject(DbTemplateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private translate = inject(TranslateService);
  private globalService = inject(GlobalService);

  saving = this.tpl.saving;
  loading = this.tpl.loading;

  id: string | null = null;
  isEdit = false;
  dirty = false;

  // Form model.
  name = '';
  description = '';
  scope: 'org' | 'datasource' = 'org';
  connectorId: string | null = null;
  attrs = {
    login: true,
    inherit: true,
    createdb: false,
    createrole: false,
  };
  rules: RuleRow[] = [];

  levelOptions: { label: string; value: RuleLevel }[] = [];
  actionOptions: { label: string; value: 'grant' | 'revoke' }[] = [];
  scopeOptions: { label: string; value: 'allInSchema' | 'named' }[] = [];

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant(k);
    this.levelOptions = (
      ['database', 'schema', 'table', 'column', 'sequence', 'function'] as RuleLevel[]
    ).map(l => ({ label: t('DB_ACCESS.LEVEL_' + l.toUpperCase()), value: l }));
    this.actionOptions = [
      { label: t('DB_ACCESS.ACTION_GRANT'), value: 'grant' },
      { label: t('DB_ACCESS.ACTION_REVOKE'), value: 'revoke' },
    ];
    this.scopeOptions = [
      { label: t('DB_ACCESS.SCOPE_ALL_IN_SCHEMA'), value: 'allInSchema' },
      { label: t('DB_ACCESS.SCOPE_NAMED'), value: 'named' },
    ];

    this.id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.id;
    if (this.isEdit) {
      this.load();
    } else {
      this.addRule();
    }
  }

  hasUnsavedChanges(): boolean {
    return this.dirty;
  }
  markDirty(): void {
    this.dirty = true;
  }

  private load(): void {
    this.tpl
      .get(this.id!)
      .then(res => {
        if (!res?.status || !res.data) {
          this.goBack();
          return;
        }
        const d = res.data;
        if (d.isBuiltIn) {
          // Built-ins are read-only — never editable.
          this.goBack();
          return;
        }
        this.name = d.name;
        this.description = d.description ?? '';
        this.scope = d.connectorId ? 'datasource' : 'org';
        this.connectorId = d.connectorId ?? null;
        const def = d.definition ?? {};
        this.attrs = { ...this.attrs, ...(def.attributes ?? {}) };
        this.rules = (def.rules ?? []).map((r: any) => ({
          action: r.action,
          level: r.level,
          privileges: r.privileges ?? [],
          scope: r.scope,
          withGrantOption: !!r.withGrantOption,
        }));
        if (!this.rules.length) this.addRule();
      })
      .catch(() => this.goBack())
      .finally(() => this.cdr.markForCheck());
  }

  privsFor(level: RuleLevel): { label: string; value: string }[] {
    return (PRIVS[level] ?? []).map(p => ({ label: p, value: p }));
  }

  addRule(): void {
    this.rules = [
      ...this.rules,
      {
        action: 'grant',
        level: 'table',
        privileges: [],
        scope: 'allInSchema',
        withGrantOption: false,
      },
    ];
    this.markDirty();
  }

  removeRule(i: number): void {
    this.rules = this.rules.filter((_, idx) => idx !== i);
    this.markDirty();
  }

  onLevelChange(rule: RuleRow): void {
    // Prune privileges not valid for the new level.
    const allowed = PRIVS[rule.level] ?? [];
    rule.privileges = rule.privileges.filter(p => allowed.includes(p));
    this.rules = [...this.rules];
    this.markDirty();
  }

  get canSave(): boolean {
    if (this.saving() || !this.name.trim()) return false;
    if (this.scope === 'datasource' && !this.connectorId) return false;
    // Every rule needs at least one privilege.
    if (!this.rules.length) return false;
    return this.rules.every(r => r.privileges.length > 0);
  }

  private buildBody(): any {
    return {
      name: this.name.trim(),
      description: this.description.trim() || null,
      connectorId: this.scope === 'datasource' ? this.connectorId : null,
      definition: {
        attributes: this.attrs,
        rules: this.rules.map(r => ({
          action: r.action,
          level: r.level,
          privileges: r.privileges,
          scope: r.scope,
          withGrantOption: r.withGrantOption,
        })),
      },
    };
  }

  onSubmit(): void {
    if (!this.canSave) return;
    const body = this.buildBody();
    const req = this.isEdit
      ? this.tpl.update(this.id!, body)
      : this.tpl.create(body);
    req
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.dirty = false;
          this.goBack();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  onDatasourceChange(id: string): void {
    this.connectorId = id || null;
    this.markDirty();
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.TEMPLATES_LIST]);
  }

  trackByIndex = (i: number): number => i;
}
