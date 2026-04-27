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
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

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

  isLoadingAssignments = false;
  scopeTargetsLoading = false;

  scopeOptions = [
    { label: 'User', value: 'user' },
    { label: 'Group', value: 'group' },
  ];

  constructor(
    private rlsRulesService: RlsRulesService,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
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
    if (!scope) return;
    this.loadScopeTargets(scope);
  }

  loadScopeTargets(scope: string): void {
    const params = { orgId: this.orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.scopeTargetsLoading = true;

    if (scope === 'user') {
      this.userService
        .listUser(params)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.scopeTargets = (response.data.users || []).map((u: any) => ({
              label: `${u.firstName} ${u.lastName}`,
              value: u.id,
            }));
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
            this.scopeTargets = (response.data.groups || []).map((g: any) => ({
              label: g.name,
              value: g.id,
            }));
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
