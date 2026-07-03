import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { DbAccessService } from '../../services/db-access.service';

/**
 * DbMappingsComponent — the DBExec-side bridge: app-user / app-group ↔
 * DB-role-name mappings for this datasource. List + attach / detach.
 * The attach dialog picks app users + groups from TWO multiselects
 * (populated from UserService / GroupService) — no free-text id. Each
 * selected user becomes { appUserId, mappingType:'user' } and each group
 * { appGroupId, mappingType:'group' } on the mappings endpoint. Detach
 * requires an explicit confirm.
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

  // App user / group pickers.
  appUserOptions: { label: string; value: string }[] = [];
  appGroupOptions: { label: string; value: string }[] = [];

  // attach dialog
  showAttach = false;
  attachUserIds: string[] = [];
  attachGroupIds: string[] = [];
  attachRole = '';
  attachNotes = '';

  // detach confirm
  showDetach = false;
  detachTarget: any = null;

  constructor(
    private dbAccess: DbAccessService,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        this.roleNames = (this.dbAccess.roles() ?? []).map(r => r.name);
        this.cdr.markForCheck();
      })
      .catch(() => {});
    this.loadAppEntities();
  }

  load(): void {
    this.dbAccess
      .loadMappings(this.datasourceId)
      .then(() => {
        this.mappings = this.dbAccess.mappings() ?? [];
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  private loadAppEntities(): void {
    this.userService
      .listUser({ page: 1, limit: 1000 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.appUserOptions = (res?.data?.users ?? []).map((u: any) => ({
            value: u.id,
            label: this.userLabel(u),
          }));
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());

    this.groupService
      .listGroups({ page: 1, limit: 1000 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          this.appGroupOptions = (res?.data?.groups ?? []).map((g: any) => ({
            value: g.id,
            label: g.name,
          }));
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  private userLabel(u: any): string {
    const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return full || u.username || u.email || u.id;
  }

  openAttach(): void {
    this.attachUserIds = [];
    this.attachGroupIds = [];
    this.attachRole = '';
    this.attachNotes = '';
    this.showAttach = true;
  }

  cancelAttach(): void {
    this.showAttach = false;
  }

  get attachValid(): boolean {
    return (
      !!this.attachRole &&
      (this.attachUserIds.length > 0 || this.attachGroupIds.length > 0)
    );
  }

  async submitAttach(): Promise<void> {
    if (!this.attachValid) return;
    const notes = this.attachNotes || undefined;
    const payloads: any[] = [];
    this.attachUserIds.forEach(id =>
      payloads.push({
        appUserId: id,
        mappingType: 'user',
        dbRoleName: this.attachRole,
        notes,
      }),
    );
    this.attachGroupIds.forEach(id =>
      payloads.push({
        appGroupId: id,
        mappingType: 'group',
        dbRoleName: this.attachRole,
        notes,
      }),
    );

    let ok = true;
    for (const body of payloads) {
      try {
        const res = await this.dbAccess.attachMapping(this.datasourceId, body);
        if (!this.globalService.handleSuccessService(res)) ok = false;
      } catch {
        ok = false;
      }
    }
    if (ok) this.showAttach = false;
    this.load();
    this.cdr.markForCheck();
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
      .detachMapping(this.datasourceId, {
        id: this.detachTarget.id,
        confirm: true,
      })
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
