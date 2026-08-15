/**
 * cp-values-step — thin host for the value-source editor (manual / sql /
 * upload) plus a read-only review summary of the SQL config assembled in the
 * prior steps. The value-source editor persists its own rows via the
 * value-source PUT / upload — not through the /config payload.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PromptConfigService } from '../../../../services/prompt-config.service';

@Component({
  selector: 'cp-values-step',
  templateUrl: './cp-values-step.component.html',
  styleUrls: ['../cp-step.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpValuesStepComponent {
  @Input({ required: true }) svc!: PromptConfigService;
  @Input({ required: true }) promptId!: string;
}
