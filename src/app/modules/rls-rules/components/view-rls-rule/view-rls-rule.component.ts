import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
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
  ruleId: string = '';
  orgId: string = '';
  ruleData: any = null;
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
    this.loadRuleDetails();
  }

  loadRuleDetails() {
    this.rlsRulesService
      .viewRule(this.orgId, this.ruleId)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.ruleData = response.data;
        }
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
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (this.ruleData && this.deleteJustification.trim()) {
      this.rlsRulesService
        .deleteRule(
          this.orgId,
          this.ruleData.id,
          this.deleteJustification.trim(),
        )
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.showDeleteConfirm = false;
            this.deleteJustification = '';
            this.router.navigate([RLS_RULE.LIST]);
          }
        });
    }
  }
}
