import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * EditDbRoleComponent — full-page edit for a group role. Loads by name,
 * pins the name read-only, edits the INHERIT / CREATEDB / CREATEROLE
 * attributes, and flows through the plain-language confirm gate.
 */
@Component({
  selector: 'app-edit-db-role',
  templateUrl: './edit-db-role.component.html',
  styleUrls: ['./edit-db-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDbRoleComponent implements OnInit, HasUnsavedChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  roleName = '';
  loadingRole = true;
  roleForm!: FormGroup;
  saving = this.dbAccess.saving;

  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  private pendingExecute: (() => Promise<any>) | null = null;

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
    this.roleForm = this.fb.group({
      name: [{ value: '', disabled: true }],
      inherit: [true],
      createdb: [false],
      createrole: [false],
    });
    this.loadRole();
  }

  private loadRole(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        const role = all.find(r => r.name === this.roleName);
        if (!role) {
          this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
          return;
        }
        const a = role.attributes ?? role;
        this.roleForm.reset({
          name: role.name,
          inherit: a.inherit !== false,
          createdb: !!a.createdb,
          createrole: !!a.createrole,
        });
        this.roleForm.get('name')?.disable();
      })
      .catch(() => this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]))
      .finally(() => {
        this.loadingRole = false;
        this.cdr.markForCheck();
      });
  }

  get isFormDirty(): boolean {
    return this.roleForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const v = this.roleForm.getRawValue();
    const attributes: any = {
      login: false,
      inherit: v.inherit,
      createdb: v.createdb,
      createrole: v.createrole,
    };

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_ALTER_ROLE');
    this.previewDestructive = false;
    this.confirmPhrase = null;

    const intent: ChangeIntent = {
      kind: 'alterRole',
      name: this.roleName,
      attributes,
    };
    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.updateRole(this.datasourceId, this.roleName, {
          attributes,
          previewOnly: true,
        }),
      () =>
        this.dbAccess.updateRole(this.datasourceId, this.roleName, {
          attributes,
        }),
    );
  }

  onCancel(): void {
    this.roleForm.markAsPristine();
    this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
  }

  private runPreviewAndArm(
    intents: ChangeIntent[],
    preview: () => Promise<any>,
    execute: () => Promise<any>,
  ): void {
    this.showPreview = true;
    this.previewLoading = true;
    this.summaries = intents.map(i => describeChange(i, this.translate));
    this.pendingExecute = execute;
    this.cdr.markForCheck();

    preview()
      .then(res => {
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showPreview = false;
        }
      })
      .catch(() => {
        this.showPreview = false;
      })
      .finally(() => {
        this.previewLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmPreview(): void {
    if (!this.pendingExecute) return;
    this.pendingExecute()
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showPreview = false;
          this.roleForm.markAsPristine();
          this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelPreview(): void {
    this.showPreview = false;
    this.pendingExecute = null;
  }
}
