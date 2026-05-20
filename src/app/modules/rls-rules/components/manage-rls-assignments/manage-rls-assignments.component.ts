import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { TranslateService } from '@ngx-translate/core';
import { RlsRulesService } from '../../services/rls-rules.service';

@Component({
  selector: 'app-manage-rls-assignments',
  templateUrl: './manage-rls-assignments.component.html',
  styleUrls: ['./manage-rls-assignments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageRlsAssignmentsComponent implements OnInit {
  @Input() rule: any;
  @Input() orgId: string = '';
  @Output() closed = new EventEmitter<void>();

  private cdr = inject(ChangeDetectorRef);

  // Signal refs
  assignments = this.rlsRulesService.assignments;
  saving = this.rlsRulesService.saving;

  scopeTargets: { label: string; value: string }[] = [];

  newScope: string = '';
  newScopeId: string = '';

  // Server-mode preload for the scope-target dropdown. Cleared whenever the
  // scope flips between 'user' and 'group' so the dropdown re-fetches the
  // right entity. The dropdown's optionLabel/optionValue are also re-bound
  // (see template) since users render as firstName+lastName via a mapped
  // `displayLabel` field and groups render as their `name` field.
  preloadedScopeTargets: any[] | null = null;
  preloadedScopeTargetsTotal: number | null = null;

  isLoadingAssignments = false;
  scopeTargetsLoading = false;

  scopeOptions = [
    { label: this.translate.instant('RLS.USER'), value: 'user' },
    { label: this.translate.instant('RLS.GROUP'), value: 'group' },
  ];

  constructor(
    private rlsRulesService: RlsRulesService,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    if (!this.rule?.id) return;
    this.rlsRulesService.resetAssignments();
    this.loadAssignments();
  }

  loadAssignments(): void {
    if (!this.rule?.id) return;
    this.isLoadingAssignments = true;
    this.cdr.markForCheck();
    this.rlsRulesService
      .loadAssignments(this.orgId, this.rule.id)
      .then(() => {
        this.isLoadingAssignments = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isLoadingAssignments = false;
        this.cdr.markForCheck();
      });
  }

  onScopeChange(scope: string): void {
    this.newScopeId = '';
    this.scopeTargets = [];
    // Drop the dropdown's seed so it re-fetches against the new entity type
    // (user vs. group) on next open.
    this.preloadedScopeTargets = null;
    this.preloadedScopeTargetsTotal = null;
    if (!scope) return;
    this.loadScopeTargets(scope);
  }

  /**
   * Fetcher for the server-mode scope-target dropdown. Routes to user or
   * group service based on the currently selected scope. Returns items with
   * an injected `displayLabel` for users so a single optionLabel binding in
   * the template renders both entity types cleanly.
   */
  loadScopeTargetsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    if (!this.newScope || !this.orgId) return { items: [], total: 0 };
    const params: any = { orgId: this.orgId, page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      if (this.newScope === 'user') {
        const res: any = await this.userService.listUser(params);
        if (this.globalService.handleSuccessService(res, false)) {
          const users = (res?.data?.users ?? []).map((u: any) => ({
            ...u,
            displayLabel: `${u.firstName} ${u.lastName}`,
          }));
          return { items: users, total: res?.data?.count ?? users.length };
        }
      } else if (this.newScope === 'group') {
        const res: any = await this.groupService.listGroups(params);
        if (this.globalService.handleSuccessService(res, false)) {
          const groups = res?.data?.groups ?? [];
          return { items: groups, total: res?.data?.count ?? groups.length };
        }
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadScopeTargets(scope: string): void {
    const params = { orgId: this.orgId, page: DEFAULT_PAGE, limit: 10 };
    this.scopeTargetsLoading = true;

    if (scope === 'user') {
      this.userService
        .listUser(params)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, false)) {
            const users = (response?.data?.users ?? []).map((u: any) => ({
              ...u,
              displayLabel: `${u.firstName} ${u.lastName}`,
            }));
            // Keep the legacy {label, value} array populated for any consumers
            // outside this dropdown.
            this.scopeTargets = users.map((u: any) => ({
              label: u.displayLabel,
              value: u.id,
            }));
            this.preloadedScopeTargets = users;
            this.preloadedScopeTargetsTotal =
              response?.data?.count ?? users.length;
          }
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => {
          this.scopeTargetsLoading = false;
          this.cdr.markForCheck();
        });
    } else if (scope === 'group') {
      this.groupService
        .listGroups(params)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, false)) {
            const groups = response?.data?.groups ?? [];
            this.scopeTargets = groups.map((g: any) => ({
              label: g.name,
              value: g.id,
            }));
            this.preloadedScopeTargets = groups;
            this.preloadedScopeTargetsTotal =
              response?.data?.count ?? groups.length;
          }
        })
        .catch(() => {
          this.cdr.markForCheck();
        })
        .finally(() => {
          this.scopeTargetsLoading = false;
          this.cdr.markForCheck();
        });
    }
  }

  addAssignment(): void {
    if (!this.newScope || !this.newScopeId || this.saving()) return;

    const payload = {
      ruleId: this.rule.id,
      organisation: this.orgId,
      scope: this.newScope,
      scopeId: this.newScopeId,
    };

    this.rlsRulesService
      .addAssignment(payload)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.newScope = '';
          this.newScopeId = '';
          this.scopeTargets = [];
          this.loadAssignments();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  removeAssignment(assignment: any): void {
    this.rlsRulesService
      .deleteAssignment(this.orgId, assignment.id)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.loadAssignments();
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  trackById(index: number, item: any): any {
    return item.id;
  }

  close(): void {
    this.closed.emit();
  }
}
