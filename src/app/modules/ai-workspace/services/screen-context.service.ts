import { Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * The current screen, sent to the AI on every message. Only the open
 * asset's identity is shared — never its contents. The supervisor routes
 * on `screen`; specialists ground on the asset + connection.
 */
export interface ScreenContext {
  route: string;
  screen: string;
  asset?: { type: string; id: string | number; name?: string };
  connectionId?: string;
  datasource?: string;
}

/**
 * Maps a router URL to a stable screen key. Longest, most specific
 * prefixes first. Feature screens may additionally call setAsset() in
 * ngOnInit to attach the open asset; screens that don't just contribute
 * route + screen.
 */
const ROUTE_SCREEN: Array<[RegExp, string]> = [
  [/^\/app\/analyses\/(edit|view)\/[^/]+/, 'analysis-edit'],
  [/^\/app\/analyses/, 'analysis-list'],
  [/^\/app\/dashboards\/[^/]+/, 'dashboard-view'],
  [/^\/app\/dashboards/, 'dashboard-list'],
  [/^\/app\/datasets\/[^/]+/, 'dataset-edit'],
  [/^\/app\/datasets/, 'dataset-list'],
  [/^\/app\/query-runner\/exec/, 'query-exec'],
  [/^\/app\/query-runner/, 'query-runner'],
  [/^\/app\/users/, 'users-list'],
  [/^\/app\/roles/, 'roles-list'],
  [/^\/app\/groups/, 'groups-list'],
  [/^\/app\/datasources/, 'datasource-list'],
  [/^\/app\/db-roles|^\/app\/db-privileges/, 'db-access'],
  [/^\/app\/alerts/, 'alerts'],
  [/^\/app\/rls-rules/, 'rls-list'],
  [/^\/app\/ai-workspace/, 'ai-workspace'],
  [/^\/app\/home/, 'home'],
];

function screenForUrl(url: string): string {
  const path = url.split('?')[0];
  for (const [re, key] of ROUTE_SCREEN) {
    if (re.test(path)) return key;
  }
  return 'app';
}

/**
 * Root singleton. Tracks the current route (auto) plus an optional open
 * asset + active connection that feature screens set. `snapshot()`
 * returns the ScreenContext to attach to an AI message.
 */
@Injectable({ providedIn: 'root' })
export class ScreenContextService {
  private _route = signal<string>('');
  private _screen = signal<string>('app');
  private _asset = signal<ScreenContext['asset'] | undefined>(undefined);
  private _connectionId = signal<string | undefined>(undefined);
  private _datasource = signal<string | undefined>(undefined);

  readonly screen = this._screen.asReadonly();

  constructor(private router: Router) {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const url = e.urlAfterRedirects || e.url;
        this._route.set(url);
        this._screen.set(screenForUrl(url));
        // A navigation invalidates the previously-open asset.
        this._asset.set(undefined);
      });
  }

  /** A feature screen calls this in ngOnInit to attach its open asset. */
  setAsset(asset: ScreenContext['asset'] | undefined): void {
    this._asset.set(asset);
  }

  /** The active query connection, when a screen has one. */
  setConnection(connectionId?: string, datasource?: string): void {
    this._connectionId.set(connectionId);
    this._datasource.set(datasource);
  }

  /** Build the ScreenContext to send with an AI message. */
  snapshot(): ScreenContext {
    return {
      route: this._route(),
      screen: this._screen(),
      asset: this._asset(),
      connectionId: this._connectionId(),
      datasource: this._datasource(),
    };
  }
}
