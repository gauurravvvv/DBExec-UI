import {ChangeDetectionStrategy, Component, OnInit, OnDestroy} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { ANALYSES } from 'src/app/constants/routes';
import { DASHBOARD as DB_ROUTES } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { AnalysesService } from '../../service/analyses.service';
import { DashboardService } from '../../../dashboard/services/dashboard.service';

@Component({
  selector: 'app-view-analyses',
  templateUrl: './view-analyses.component.html',
  styleUrls: ['./view-analyses.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewAnalysesComponent implements OnInit {
  private destroy$ = new Subject<void>();

  analysisId: string = '';
  orgId: string = '';
  analysisDetails: any = null;
  datasetDetails: any = null;
  analysisFields: any[] = [];
  visuals: any[] = [];
  showDeleteConfirm = false;
  deleteJustification = '';

  // Publish dialog
  showPublishDialog = false;
  publishForm = { name: '', description: '' };

  // Custom field dialog
  showAddCustomFieldDialog = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private dashboardService: DashboardService,
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.orgId = params['orgId'];
      this.analysisId = params['id'];
      if (this.analysisId) {
        this.loadAnalysis();
      }
    });
  }

  loadAnalysis(): void {
    this.analysesService
      .viewAnalyses(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisDetails = response.data;
          if (response.data.datasetId) {
            this.loadDatasetInfo(response.data.datasetId);
          }
          this.loadAnalysisFields();
          this.loadVisuals();
        }
      });
  }

  loadDatasetInfo(datasetId: string): void {
    this.datasetService.getDataset(this.orgId, datasetId).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasetDetails = response.data;
      }
    });
  }

  loadAnalysisFields(): void {
    this.analysesService
      .getAnalysisFields(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisFields = response.data?.analysisFields || [];
        }
      });
  }

  loadVisuals(): void {
    this.analysesService
      .listVisuals(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.visuals = response.data.visuals || [];
        }
      });
  }

  getDataTypeIcon(dataType: string): string {
    if (!dataType) return 'pi-tag';
    const type = dataType.toLowerCase();
    if (
      type.includes('int') ||
      type.includes('numeric') ||
      type.includes('decimal') ||
      type.includes('float') ||
      type.includes('double') ||
      type.includes('real') ||
      type.includes('serial') ||
      type.includes('money')
    )
      return 'pi-hashtag';
    if (
      type.includes('char') ||
      type.includes('text') ||
      type.includes('string') ||
      type.includes('citext') ||
      type.includes('name')
    )
      return 'pi-align-left';
    if (type.includes('bool')) return 'pi-check-square';
    if (
      type.includes('timestamp') ||
      type.includes('date') ||
      type.includes('time') ||
      type.includes('interval')
    )
      return 'pi-calendar';
    if (type.includes('uuid')) return 'pi-key';
    if (type.includes('json')) return 'pi-code';
    if (type.includes('array') || type.includes('[]')) return 'pi-list';
    if (type.includes('bytea') || type.includes('blob')) return 'pi-file';
    if (
      type.includes('inet') ||
      type.includes('cidr') ||
      type.includes('macaddr')
    )
      return 'pi-globe';
    if (type.includes('enum') || type.includes('user-defined'))
      return 'pi-sliders-h';
    return 'pi-tag';
  }

  goBack(): void {
    this.router.navigate([ANALYSES.LIST]);
  }

  onEdit(): void {
    this.router.navigate([ANALYSES.EDIT, this.orgId, this.analysisId]);
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
      this.analysesService
        .deleteAnalyses(
          this.orgId,
          this.analysisId,
          this.deleteJustification.trim(),
        )
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showDeleteConfirm = false;
            this.deleteJustification = '';
            this.router.navigate([ANALYSES.LIST]);
          }
        });
    }
  }

  openPublishDialog(): void {
    this.publishForm = { name: '', description: '' };
    this.showPublishDialog = true;
  }

  cancelPublish(): void {
    this.showPublishDialog = false;
    this.publishForm = { name: '', description: '' };
  }

  proceedPublish(): void {
    if (!this.publishForm.name?.trim()) return;

    const payload = {
      orgId: this.analysisDetails.organisationId,
      name: this.publishForm.name.trim(),
      description: this.publishForm.description?.trim() || '',
      analysisId: this.analysisDetails.id,
      analysisName: this.analysisDetails.name,
      datasetId: this.analysisDetails.datasetId,
      datasetName: this.analysisDetails.dataset?.name || '',
      datasourceId: this.analysisDetails.datasourceId,
      datasourceName: this.analysisDetails.datasource?.name || '',
    };

    this.dashboardService.addDashboard(payload).then(response => {
      if (this.globalService.handleSuccessService(response)) {
        this.showPublishDialog = false;
        this.publishForm = { name: '', description: '' };
        this.router.navigate([DB_ROUTES.VIEW, this.orgId, response.data.id]);
      }
    });
  }

  openAddCustomFieldDialog(): void {
    this.showAddCustomFieldDialog = true;
  }

  onAddCustomFieldDialogClose(data: any): void {
    this.showAddCustomFieldDialog = false;
    if (data?.field) {
      this.loadAnalysisFields();
    }
  }

  trackById(index: number, item: any): any {
    return item.id;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}