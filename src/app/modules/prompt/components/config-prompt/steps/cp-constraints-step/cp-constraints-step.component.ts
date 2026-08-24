/**
 * cp-constraints-step — input bounds for FREE-INPUT widgets (text / number /
 * rangeslider / calendar / daterange). Which fields show is driven by the
 * prompt's dataType family. Reads/writes PromptConfigService.inputConstraints.
 * Choice widgets never render this (they use a value list instead).
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  computed,
} from '@angular/core';
import { PromptConfigService } from '../../../../services/prompt-config.service';

@Component({
  selector: 'cp-constraints-step',
  templateUrl: './cp-constraints-step.component.html',
  styleUrls: ['../cp-step.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpConstraintsStepComponent {
  @Input({ required: true }) svc!: PromptConfigService;

  /** Which family of constraint fields to show, from the logical dataType. */
  readonly family = computed<'text' | 'number' | 'date' | 'none'>(() => {
    const dt = this.svc.dataType() || 'text';
    if (dt === 'number') return 'number';
    if (dt === 'date' || dt === 'datetime') return 'date';
    if (dt === 'text' || dt === 'enum' || dt === 'uuid') return 'text';
    return 'none'; // bool has no bounds
  });

  onMinLen(v: number | null): void {
    this.svc.patchConstraints({ minLen: v });
  }
  onMaxLen(v: number | null): void {
    this.svc.patchConstraints({ maxLen: v });
  }
  onPattern(v: string): void {
    this.svc.patchConstraints({ pattern: v || null });
  }
  onMin(v: number | null): void {
    this.svc.patchConstraints({ min: v });
  }
  onMax(v: number | null): void {
    this.svc.patchConstraints({ max: v });
  }
  onStep(v: number | null): void {
    this.svc.patchConstraints({ step: v });
  }
  onEarliest(v: string): void {
    this.svc.patchConstraints({ earliest: v || null });
  }
  onLatest(v: string): void {
    this.svc.patchConstraints({ latest: v || null });
  }
}
