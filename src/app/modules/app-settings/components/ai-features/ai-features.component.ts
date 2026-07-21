import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * AI Features — placeholder tab in the System Settings hub. No wiring
 * yet; renders a centred "Coming soon" card so the tab reserves its
 * place in the hub and communicates that the capability is on the way.
 */
@Component({
  selector: 'app-ai-features',
  templateUrl: './ai-features.component.html',
  styleUrls: ['./ai-features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiFeaturesComponent {}
