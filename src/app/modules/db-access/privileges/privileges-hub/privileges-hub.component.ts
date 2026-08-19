import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppTab } from 'src/app/shared/components/tabs/tabs.component';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { PrivilegesAccessComponent } from '../privileges-access/privileges-access.component';
import { ListDbTemplatesComponent } from '../templates/list-db-templates/list-db-templates.component';

/**
 * PrivilegesHubComponent — the Privileges & Access tabbed hub, mirroring the
 * App/System Settings hub idiom exactly.
 *
 * It owns the page chrome once: the "Privileges & Access" title, ONE shared
 * datasource picker (bound to the root DbAccessContextService), the
 * capability hints (pick-a-datasource / probing / unsupported / badges), and
 * the shared `<app-tabs>` strip. Each tab body renders inline via
 * `[ngSwitch]="activeTab"` and is an EMBEDDED child component — the children
 * hide their own header/title/datasource-picker (the hub carries them) and
 * read the selected datasource from the shared context.
 *
 * The active tab is mirrored to `?tab=` for deep links (same as the Settings
 * hubs). The standalone child routes (`sessions`, `templates`, …) remain in
 * the module so direct navigation / templates sub-pages still resolve; the
 * hub is just the default landing.
 */
@Component({
  selector: 'app-privileges-hub',
  templateUrl: './privileges-hub.component.html',
  styleUrls: ['./privileges-hub.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivilegesHubComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private ctx = inject(DbAccessContextService);

  /** The Compose tab's embedded child — used to drive its Apply action from
   *  the hub header (kept wired to the child so the preview→execute flow is
   *  unchanged). Present only while the Compose tab is instantiated. */
  @ViewChild(PrivilegesAccessComponent)
  private composeRef?: PrivilegesAccessComponent;

  /** The Templates tab's embedded list — used to drive its "New template"
   *  action from the hub header (parity with Compose's Apply). Present only
   *  while the Templates tab is instantiated. */
  @ViewChild(ListDbTemplatesComponent)
  private templatesRef?: ListDbTemplatesComponent;

  /** Tab strip model (also the source of order + the query-param slug). */
  readonly tabs: AppTab[] = [
    { value: 'compose', label: 'DB_ACCESS.TAB_COMPOSE', icon: 'pi pi-pencil' },
    {
      value: 'effective',
      label: 'DB_ACCESS.TAB_EFFECTIVE_PRIVS',
      icon: 'pi pi-shield',
    },
    { value: 'sessions', label: 'DB_ACCESS.ACTIVE_SESSIONS', icon: 'pi pi-bolt' },
    {
      value: 'templates',
      label: 'DB_ACCESS.TEMPLATES_TITLE',
      icon: 'pi pi-bookmark',
    },
  ];

  /** Active tab value (default: first tab). */
  activeTab = 'compose';

  /** Shared datasource + capability state (all read from the root context, so
   *  the ONE hub picker feeds every tab body). */
  datasourceId = '';
  capability = this.ctx.capability;
  capabilityLoading = this.ctx.capabilityLoading;
  unsupported = this.ctx.unsupported;

  get canManage(): boolean {
    return this.ctx.canManage;
  }

  ngOnInit(): void {
    // Hydrate from the shared context (a datasource may already be selected
    // from another db-access section this session).
    this.datasourceId = this.ctx.datasourceId() || '';

    const slug = this.route.snapshot.queryParamMap.get('tab');
    if (slug && this.tabs.some(t => t.value === slug)) this.activeTab = slug;
  }

  onTabChange(value: string): void {
    this.activeTab = value;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.cdr.markForCheck();
  }

  /** Emitted by the ONE shared datasource picker in the hub header. Mirrors
   *  the child pickers' behaviour (context already set + probed by the picker);
   *  we only track the id locally to gate the header hints/badges. Every tab
   *  body reacts on its own via DbAccessContextService.datasourceChanged$. */
  onDatasourceChange(id: string): void {
    this.datasourceId = id || '';
    this.cdr.markForCheck();
  }

  /** Compose tab: is Apply currently allowed? (delegates to the child). */
  get canApply(): boolean {
    return !!this.composeRef?.allRulesValid && !this.composeRef?.saving();
  }

  /** Compose tab: is a change-set apply in flight? (drives the spinner). */
  get applySaving(): boolean {
    return !!this.composeRef?.saving();
  }

  /** Fire the Compose child's preview→execute pipeline (unchanged). */
  applyChanges(): void {
    this.composeRef?.applyChanges();
  }

  /** Templates tab: open the New-template screen (delegates to the child). */
  addTemplate(): void {
    this.templatesRef?.onAdd();
  }
}
