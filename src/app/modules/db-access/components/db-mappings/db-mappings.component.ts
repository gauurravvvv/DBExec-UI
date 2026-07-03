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
 * DbMappingsComponent — the DBExec-side bridge: app-user / app-group ↔
 * DB-role-name mappings for this datasource (FR-6.1, v1 storage only).
 * List + attach / detach dialogs. Detach requires an explicit confirm.
 */
@Component({
  selector: 'app-db-mappings',
  templateUrl: './db-mappings.component.html',
  styleUrls: ['./db-mappings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbMappingsComponent implements OnInit {
  @Input() datasourceId = '';
  @Input() canManage = false;

  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  mappings: any[] = [];
  roleNames: string[] = [];

  // attach dialog
  showAttach = false;
  attachType: 'user' | 'group' = 'user';
  attachEntityId = '';
  attachRole = '';
  attachNotes = '';

  // detach confirm
  showDetach = false;
  detachTarget: any = null;

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.dbAccess.loadRoles(this.datasourceId).then(() => {
      this.roleNames = (this.dbAccess.roles() ?? []).map(r => r.name);
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  load(): void {
    this.dbAccess.loadMappings(this.datasourceId).then(() => {
      this.mappings = this.dbAccess.mappings() ?? [];
      this.cdr.markForCheck();
    }).catch(() => this.cdr.markForCheck());
  }

  openAttach(): void {
    this.attachType = 'user';
    this.attachEntityId = '';
    this.attachRole = '';
    this.attachNotes = '';
    this.showAttach = true;
  }

  cancelAttach(): void {
    this.showAttach = false;
  }

  submitAttach(): void {
    if (!this.attachEntityId || !this.attachRole) return;
    const body: any = {
      dbRoleName: this.attachRole,
      mappingType: this.attachType,
      notes: this.attachNotes || undefined,
    };
    if (this.attachType === 'group') body.appGroupId = this.attachEntityId;
    else body.appUserId = this.attachEntityId;

    this.dbAccess
      .attachMapping(this.datasourceId, body)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showAttach = false;
          this.load();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  openDetach(mapping: any): void {
    this.detachTarget = mapping;
    this.showDetach = true;
  }

  cancelDetach(): void {
    this.showDetach = false;
    this.detachTarget = null;
  }

  proceedDetach(): void {
    if (!this.detachTarget) return;
    this.dbAccess
      .detachMapping(this.datasourceId, { id: this.detachTarget.id, confirm: true })
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showDetach = false;
          this.detachTarget = null;
          this.load();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }
}
