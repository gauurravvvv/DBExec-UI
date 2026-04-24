import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RLS_RULE } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { RlsRulesService } from '../../services/rls-rules.service';

@Component({
  selector: 'app-view-rls-rule',
  templateUrl: './view-rls-rule.component.html',
  styleUrls: ['./view-rls-rule.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewRlsRuleComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  // Signal refs
  current  = this.rlsRulesService.current;
  loading  = this.rlsRulesService.loading;
  saving   = this.rlsRulesService.saving;

  ruleId: string = '';
  orgId: string = '';
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private rlsRulesService: RlsRulesService,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.ruleId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    this.rlsRulesService.resetCurrent();
    this.loadRuleDetails();
  }

  loadRuleDetails() {
    this.rlsRulesService.loadOne(this.orgId, this.ruleId)
      .then(() => {
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onEdit() {
    this.router.navigate([RLS_RULE.EDIT, this.orgId, this.ruleId]);
  }

  goBack() {
    this.router.navigate([RLS_RULE.LIST]);
  }

  trackById(index: number, item: any): any {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  confirmDelete(): void {
    if (!this.current()) return;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    const ruleData = this.current();
    if (!ruleData || !this.deleteJustification.trim()) return;

    this.rlsRulesService
      .delete(this.orgId, ruleData.id, this.deleteJustification.trim())
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.showDeleteConfirm = false;
          this.deleteJustification = '';
          this.router.navigate([RLS_RULE.LIST]);
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.showDeleteConfirm = false;
        this.cdr.markForCheck();
      });
  }
}
