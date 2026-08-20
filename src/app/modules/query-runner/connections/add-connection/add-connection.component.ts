import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { ConnectorService } from 'src/app/modules/connector/services/connector.service';
import { QueryRunnerService } from '../../services/query-runner.service';

/**
 * AddConnectionComponent — create OR edit one of the user's private
 * connection profiles. A connection = datasource + a DB login (username
 * + password) the user was given. Same add/edit shell as the DB-access
 * forms (back header, vertical form with shared app-custom-* controls).
 *
 * On edit the password field stays blank and is only sent if the user
 * types a new one (blank ⇒ keep the stored credential).
 */
@Component({
  selector: 'app-add-connection',
  templateUrl: './add-connection.component.html',
  styleUrls: ['./add-connection.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddConnectionComponent implements OnInit, HasUnsavedChanges {
  private cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  saving = false;
  isEdit = false;
  connectionId = '';

  constructor(
    private fb: FormBuilder,
    private service: QueryRunnerService,
    private datasourceService: ConnectorService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      connectorId: ['', [Validators.required]],
      username: ['', [Validators.required, Validators.maxLength(128)]],
      password: ['', []],
    });
  }

  ngOnInit(): void {
    this.connectionId = this.route.snapshot.paramMap.get('id') ?? '';
    this.isEdit = !!this.connectionId;
    if (this.isEdit) {
      // On edit the password is optional (blank = unchanged).
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.updateValueAndValidity();
      this.loadForEdit();
    } else {
      this.form.get('password')?.setValidators([Validators.required]);
      this.form.get('password')?.updateValueAndValidity();
    }
  }

  /** Server-mode fetcher for the datasource dropdown (Postgres list). */
  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (res?.status) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /** Resolve a single datasource so its name shows on the edit form. */
  resolveDatasource = async (id: string): Promise<any> => {
    try {
      const res: any = await this.datasourceService.loadOne(id);
      return res?.data ?? null;
    } catch {
      return null;
    }
  };

  private loadForEdit(): void {
    this.service
      .getConnection(this.connectionId)
      .then(res => {
        if (res?.status && res.data) {
          this.form.patchValue({
            name: res.data.name,
            connectorId: res.data.connectorId,
            username: res.data.username,
            password: '',
          });
        } else {
          this.globalService.handleSuccessService(res);
          this.goBack();
        }
      })
      .catch(() => this.goBack())
      .finally(() => this.cdr.markForCheck());
  }

  getErrorMessage(field: string): string {
    const ctrl = this.form.get(field);
    if (!ctrl || !ctrl.errors) return '';
    if (ctrl.errors['required'])
      return this.translate.instant('VALIDATION.REQUIRED');
    if (ctrl.errors['maxlength'])
      return this.translate.instant('VALIDATION.TOO_LONG');
    return '';
  }

  onSubmit(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    const raw = this.form.getRawValue();
    const payload: any = {
      name: raw.name,
      connectorId: raw.connectorId,
      username: raw.username,
    };
    // Only send password when non-empty (create always has it; edit
    // sends it only when the user typed a new one).
    if (raw.password) payload.password = raw.password;

    const done = (res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.form.markAsPristine();
        this.router.navigate([QUERY_RUNNER.CONNECTIONS_LIST]);
      }
    };

    const req = this.isEdit
      ? this.service.updateConnection(this.connectionId, payload)
      : this.service.addConnection(payload);

    req
      .then(done)
      .catch(() => {})
      .finally(() => {
        this.saving = false;
        this.cdr.markForCheck();
      });
  }

  onCancel(): void {
    this.goBack();
  }

  goBack(): void {
    this.router.navigate([QUERY_RUNNER.CONNECTIONS_LIST]);
  }

  /** HasUnsavedChanges contract — the guard prompts when this is true. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving;
  }
}
