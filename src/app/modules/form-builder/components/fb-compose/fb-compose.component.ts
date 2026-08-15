import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Runtime composer shell — stubbed in Phase 4; Phase 7 fleshes it out
 * (hydrate the published version → tab/section render → tree → SQL run).
 */
@Component({
  selector: 'app-fb-compose',
  templateUrl: './fb-compose.component.html',
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FbComposeComponent {}
