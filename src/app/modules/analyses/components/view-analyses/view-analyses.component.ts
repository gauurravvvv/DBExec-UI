import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ANALYSES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { AnalysesService } from '../../services/analyses.service';

@Component({
  selector: 'app-view-analyses',
  templateUrl: './view-analyses.component.html',
  styleUrls: ['./view-analyses.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewAnalysesComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.analysesService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  analysisId: string = '';
  analysisDetails: any = null;
  datasetDetails: any = null;
  analysisFields: any[] = [];
  visuals: any[] = [];
  showDeleteConfirm = false;
  deleteJustification = '';

  // Custom field dialog
  showAddCustomFieldDialog = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
  ) {}

  get saving() {
    return this.analysesService.saving;
  }
  // Drives the skeleton card on initial GET + per-id delete spinner.
  loading = this.analysesService.loading;
  isDeleting = (id: string): boolean => this.analysesService.isDeleting(id);

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.analysisId = params['id'];
        if (this.analysisId) {
          this.loadAnalysis();
        }
      });
  }

  async loadAnalysis(): Promise<void> {
    try {
      // Signal-based loadOne drives the skeleton card via
      // analysesService.loading — no global blocker on this page.
      const response: any = await this.analysesService.loadOne(this.analysisId);
      if (this.globalService.handleSuccessService(response, false)) {
        this.analysisDetails = this.analysesService.current();
        if (this.analysisDetails?.datasetId) {
          this.loadDatasetInfo(this.analysisDetails.datasetId);
        }
        this.loadAnalysisFields();
        this.loadVisuals();
      }
      this.cdr.markForCheck();
    } catch {
      this.cdr.markForCheck();
    }
  }

  loadDatasetInfo(datasetId: string): void {
    this.datasetService
      .getDataset(datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadAnalysisFields(): void {
    this.analysesService
      .getAnalysisFields(this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisFields = response.data?.analysisFields || [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadVisuals(): void {
    this.analysesService
      .listVisuals(this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.visuals = response.data.visuals || [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
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
    this.router.navigate([ANALYSES.edit(this.analysisId)]);
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
        .deleteAnalyses(this.analysisId, this.deleteJustification.trim())
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.showDeleteConfirm = false;
            this.deleteJustification = '';
            this.router.navigate([ANALYSES.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
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
}
