import { Injectable, signal } from '@angular/core';
import * as echarts from 'echarts';
import { firstValueFrom } from 'rxjs';
import { HttpClientService } from '../../../core/services/http-client.service';
import { getRequiredMap } from '../helpers/geo-registry';

/**
 * GeoRegistryService — the DI + ECharts + HTTP layer of the Wave-4 geo
 * pipeline. Pairs with the pure `helpers/geo-registry.ts` (name/code join,
 * lat-lon validation, getRequiredMap) which holds all the framework-free logic.
 *
 * Responsibility: fetch a region set's GeoJSON from the BE ONCE, register it
 * with ECharts under the region-set name, and cache the registration so every
 * subsequent chart of that region set reuses it. Region sets are OPEN-ENDED —
 * any slug the BE has an asset for works (`world`, `us-states`, `india-states`,
 * a customer's own territory set); nothing here is hardcoded to a country set.
 *
 * ── Renderer contract ────────────────────────────────────────────────────
 * A chart renderer (which this wave does not own/edit) must, whenever the chart
 * type or config changes, gate rendering on the map being registered:
 *
 *     const mapName = geoRegistry.getRequiredMap(chartType, config);
 *     if (mapName) {
 *       await geoRegistry.ensureMapRegistered(mapName); // idempotent + cached
 *     }
 *     const option = buildChartOption(data, config, chartType);
 *     // render option — series `map`/geo now binds to real geometry
 *
 * `ensureMapRegistered` returns a Promise that resolves once the map is
 * registered (or immediately if already registered). It never rejects — on a
 * fetch/parse failure it resolves and the chart falls back to an empty map
 * rather than wedging the render gate (mirrors the existing world-map gate in
 * echart-visual.component.ts).
 */
@Injectable({ providedIn: 'root' })
export class GeoRegistryService {
  /**
   * In-flight / completed registrations keyed by region-set name. A shared
   * Promise per region set collapses concurrent callers onto one fetch and,
   * once resolved, acts as the "already registered" cache (re-await is free).
   */
  private readonly registrations = new Map<string, Promise<void>>();

  /** Region-set names successfully registered with ECharts (for quick checks). */
  private readonly registered = new Set<string>();

  /**
   * Region sets whose asset failed to load. Kept so callers can distinguish
   * "not fetched yet" from "fetched and failed" and surface a UI warning.
   */
  private readonly _failed = signal<Set<string>>(new Set());
  readonly failed = this._failed.asReadonly();

  constructor(private http: HttpClientService) {}

  /** Delegate to the pure helper so callers have one import surface. */
  getRequiredMap(
    chartType: string | null | undefined,
    config: any,
  ): string | null {
    return getRequiredMap(chartType, config);
  }

  /** True once a region set's GeoJSON has been registered with ECharts. */
  isRegistered(regionSet: string): boolean {
    return this.registered.has(regionSet);
  }

  /**
   * Ensure a region set's GeoJSON is fetched from the BE and registered with
   * ECharts under `regionSet`. Idempotent + cached: repeated calls (including
   * concurrent ones) share a single fetch. Never rejects.
   */
  ensureMapRegistered(regionSet: string): Promise<void> {
    if (!regionSet) return Promise.resolve();
    const existing = this.registrations.get(regionSet);
    if (existing) return existing;

    const p = this.fetchAndRegister(regionSet);
    this.registrations.set(regionSet, p);
    return p;
  }

  private async fetchAndRegister(regionSet: string): Promise<void> {
    try {
      // Relative URL — the http-request interceptor prepends environment
      // .apiServer and the x-auth-token header. Endpoint:
      // GET /analyses/geojson/:regionSet → { status, code, message, data }.
      const res: any = await firstValueFrom(
        this.http.apiGet(`/analyses/geojson/${encodeURIComponent(regionSet)}`),
      );
      const geojson = res?.data ?? res;
      if (!geojson || !geojson.features) {
        this.markFailed(regionSet);
        return;
      }
      echarts.registerMap(regionSet, geojson as any);
      this.registered.add(regionSet);
    } catch {
      // Don't wedge the render gate — the chart will draw an empty map. Drop
      // the cached rejection so a later attempt can retry the fetch.
      this.registrations.delete(regionSet);
      this.markFailed(regionSet);
    }
  }

  private markFailed(regionSet: string): void {
    const next = new Set(this._failed());
    next.add(regionSet);
    this._failed.set(next);
  }
}
