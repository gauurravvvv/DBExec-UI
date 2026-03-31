import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DASHBOARD as DB_ROUTES } from 'src/app/constants/routes';
import { ANALYSES } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DashboardService } from '../../services/dashboard.service';
import { AnalysesService } from '../../../analyses/service/analyses.service';

@Component({
  selector: 'app-view-dashboard',
  templateUrl: './view-dashboard.component.html',
  styleUrls: ['./view-dashboard.component.scss'],
})
export class ViewDashboardComponent implements OnInit {
  orgId = '';
  dashboardId = '';
  dashboard: any = null;
  visuals: any[] = [];
  showDeleteConfirm = false;
  deleteJustification = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private globalService: GlobalService,
    private dashboardService: DashboardService,
    private analysesService: AnalysesService,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.orgId = params['orgId'];
      this.dashboardId = params['id'];
      if (this.dashboardId) {
        this.loadDashboard();
      }
    });
  }

  loadDashboard(): void {
    this.dashboardService
      .getDashboard(this.orgId, this.dashboardId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.dashboard = response.data;
          this.loadVisuals();
        }
      });
  }

  loadVisuals(): void {
    if (!this.dashboard?.analysisId) return;
    this.analysesService
      .listVisuals(this.orgId, this.dashboard.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.visuals = response.data.visuals || [];
        }
      });
  }

  goBack(): void {
    this.router.navigate([DB_ROUTES.LIST]);
  }

  viewAnalysis(): void {
    this.router.navigate([
      ANALYSES.VIEW,
      this.orgId,
      this.dashboard.analysisId,
    ]);
  }

  onDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (this.deleteJustification.trim()) {
      this.dashboardService
        .deleteDashboard(
          this.orgId,
          this.dashboardId,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showDeleteConfirm = false;
            this.router.navigate([DB_ROUTES.LIST]);
          }
        });
    }
  }
}
