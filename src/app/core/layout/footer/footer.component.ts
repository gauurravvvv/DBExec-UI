import { ChangeDetectionStrategy, Component } from '@angular/core';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  /** Current year for the copyright line. */
  readonly year = new Date().getFullYear();

  /** App version pulled from environment at build time. */
  readonly version = environment.appVersion;
}
