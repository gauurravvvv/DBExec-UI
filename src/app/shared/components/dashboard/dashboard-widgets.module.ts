import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared.module';
import { SharedChartsModule } from '../../modules/shared-charts.module';
import { ChipComponent } from '../chip/chip.component';
import { ActivityItemComponent } from './activity-item/activity-item.component';
import { EmptyStateComponent } from './empty-state/empty-state.component';
import { StatTileComponent } from './stat-tile/stat-tile.component';
import { TrendChartComponent } from './trend-chart/trend-chart.component';
import { WidgetCardComponent } from './widget-card/widget-card.component';

/**
 * DashboardWidgetsModule — the shared widget kit for the landing
 * dashboards (org + system-admin). One home for the reusable pieces so
 * both dashboards render as one consistent system.
 *
 * Imports:
 *   - SharedModule       → the `relativeTime` pipe + `translate` pipe
 *                          (both re-exported there) for our templates.
 *   - SharedChartsModule → the `echarts` attribute directive, without
 *                          re-registering the echarts loader.
 *
 * SharedModule imports neither this module nor SharedChartsModule, so
 * there is no import cycle.
 */
@NgModule({
  declarations: [
    WidgetCardComponent,
    StatTileComponent,
    TrendChartComponent,
    ActivityItemComponent,
    EmptyStateComponent,
  ],
  imports: [CommonModule, SharedModule, SharedChartsModule, ChipComponent],
  exports: [
    WidgetCardComponent,
    StatTileComponent,
    TrendChartComponent,
    ActivityItemComponent,
    EmptyStateComponent,
    // Re-export the standalone chip so consumers of this module (home)
    // can use <app-chip> — SharedModule imports but does not export it.
    ChipComponent,
  ],
})
export class DashboardWidgetsModule {}
