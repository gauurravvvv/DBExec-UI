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
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from '../../services/organisation.service';

interface OrganisationConfig {
  maxDatasources: number;
  maxAdmins: number;
  maxUsers: number;
  maxEnvironment: number;
  maxCategories: number;
  maxGroups: number;
}

interface MasterDbConfig {
  hostname: string;
  port: number;
  dbName: string;
  username: string;
  dbType: string;
}

interface OrganisationData {
  id: string;
  name: string;
  status: number;
  createdOn: Date;
  config: OrganisationConfig;
  usersCount: number;
  adminsCount: number;
  groupsCount: number;
  datasourcesCount: number;
  connectionsCount: number;
  dbStatus: 'connected' | 'not_configured' | 'connection_failed';
  masterDbConfig: MasterDbConfig;
}

@Component({
  selector: 'app-view-organisation',
  templateUrl: './view-organisation.component.html',
  styleUrls: ['./view-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewOrganisationComponent implements OnInit, OnDestroy {
  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.organisationService.cancelReads();
  }

  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  organisationId!: string;
  // Read directly from the service signal so the page re-renders the
  // moment the org is loaded — no manual cdr.markForCheck() needed.
  organisationData: OrganisationData | null = null;
  // Drives the skeleton card while the initial GET is in flight. The
  // OrganisationService's `loading` signal lights up via load() and
  // clears in `finally`, so we just mirror it for the template.
  loading = this.organisationService.loading;
  avatarBackground: string = '#2196F3';
  organisationInitials: string = '';
  showDeleteConfirm: boolean = false;
  deleteJustification = '';
  // Per-action local flags so the buttons can show their own spinner
  // and disabled state while their call is in flight, without
  // affecting any other affordance on the page.
  isRefreshingMasterDb: boolean = false;
  isDeleting: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
  ) {}

  ngOnInit() {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.organisationId = params['id'];
        this.loadOrganisationData();
      });
  }

  async loadOrganisationData() {
    // Signal-based loadOne — flips service.loading() true → fetches with
    // skipLoader:true → flips loading() false. The skeleton card in the
    // template is gated on that signal, so the page renders the
    // placeholder immediately and swaps to the real layout when data
    // arrives without flashing a global blocker.
    await this.organisationService.loadOne(this.organisationId);
    const data = this.organisationService.current();
    if (data) {
      this.organisationData = data;
      this.setOrganisationInitials();
      this.cdr.markForCheck();
    }
  }

  setOrganisationInitials() {
    if (this.organisationData?.name) {
      const words = this.organisationData.name.split(' ');
      this.organisationInitials = words
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
    }
  }

  confirmDelete(id: string) {
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    if (!this.deleteJustification.trim()) return;
    // Use the signal-based delete so the page's "Delete" button can
    // mirror service.isDeleting(id) — drives a per-button spinner +
    // disabled state while the request is in flight.
    this.isDeleting = true;
    this.organisationService
      .delete(this.organisationId, this.deleteJustification.trim())
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.deleteJustification = '';
          this.router.navigate([ORGANISATION.LIST]);
        }
      })
      .finally(() => {
        this.isDeleting = false;
        this.cdr.markForCheck();
      });
  }

  refreshMasterDb() {
    this.isRefreshingMasterDb = true;
    this.organisationService
      .refreshMasterDb(this.organisationId)
      .then(response => {
        this.globalService.handleSuccessService(response);
        this.isRefreshingMasterDb = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.isRefreshingMasterDb = false;
        this.cdr.markForCheck();
      });
  }
}
