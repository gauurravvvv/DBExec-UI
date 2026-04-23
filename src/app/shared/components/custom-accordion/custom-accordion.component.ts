import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-custom-accordion',
  templateUrl: './custom-accordion.component.html',
  styleUrls: ['./custom-accordion.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomAccordionComponent {
  @Input() header = '';
  @Input() icon = '';
  @Input() expanded = false;
}
