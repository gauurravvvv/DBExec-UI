import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { QUERY_RUNNER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  SavedQueriesService,
  SavedQuery,
} from '../../services/saved-queries.service';

/**
 * ViewSavedQueryComponent — read-only rendering of one saved query. Same
 * back-header form chrome as the add/edit screens, with all fields shown
 * as static rows and two actions: "Open in Executor" (loads the SQL into
 * a standalone executor tab) and "Edit" (jumps to the edit form).
 */
@Component({
  selector: 'app-view-saved-query',
  templateUrl: './view-saved-query.component.html',
  styleUrls: ['./view-saved-query.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSavedQueryComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  loading = true;
  query: SavedQuery | null = null;

  constructor(
    private service: SavedQueriesService,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id) {
      this.goBack();
      return;
    }
    this.service
      .getSavedQuery(id)
      .then(res => {
        if (res?.status && res.data) {
          this.query = res.data;
        } else {
          this.globalService.handleSuccessService(res);
          this.goBack();
        }
      })
      .catch(() => this.goBack())
      .finally(() => {
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  openInExecutor(): void {
    if (!this.query) return;
    // In-shell route so the new tab carries the sidebar + topbar (theme
    // picker reachable).
    const url = QUERY_RUNNER.EXEC_SHELL_SAVED(
      this.query.connectionId,
      this.query.id,
    );
    window.open(url, '_blank');
  }

  onEdit(): void {
    if (!this.query) return;
    this.router.navigate([QUERY_RUNNER.savedQueryEdit(this.query.id)]);
  }

  goBack(): void {
    this.router.navigate([QUERY_RUNNER.SAVED_QUERIES_LIST]);
  }
}
