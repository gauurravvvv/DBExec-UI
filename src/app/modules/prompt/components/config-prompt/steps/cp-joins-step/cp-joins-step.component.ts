/**
 * cp-joins-step — optional joins for the prompt source. Visual builder
 * (prompt-join-builder) by default; an Advanced toggle swaps to a raw Monaco
 * SQL join fragment. Reads/writes PromptConfigService.joins.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';
import {
  JoinEdge,
  PromptConfigService,
} from '../../../../services/prompt-config.service';

@Component({
  selector: 'cp-joins-step',
  templateUrl: './cp-joins-step.component.html',
  styleUrls: ['../cp-step.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpJoinsStepComponent implements OnDestroy {
  @Input({ required: true }) svc!: PromptConfigService;
  private readonly codeEditor = inject(CodeEditorService);

  @ViewChild('sqlHost') sqlHost?: ElementRef<HTMLElement>;
  private sqlHandle: EditorHandle | null = null;

  onEdges(edges: JoinEdge[]): void {
    this.svc.patchJoins({ edges });
  }

  async toggleAdvanced(useRaw: boolean): Promise<void> {
    this.svc.patchJoins({ useRaw });
    if (useRaw) {
      // give the *ngIf host a tick to render before mounting Monaco.
      setTimeout(() => this.mountSql(), 0);
    } else {
      this.persistRaw();
      this.sqlHandle?.dispose();
      this.sqlHandle = null;
    }
  }

  private async mountSql(): Promise<void> {
    if (!this.sqlHost || this.sqlHandle) return;
    this.sqlHandle = await this.codeEditor.create({
      host: this.sqlHost.nativeElement,
      flavour: 'sql',
      value: this.svc.joins().rawSql,
    });
    this.sqlHandle.onChange(v => this.svc.patchJoins({ rawSql: v }));
  }

  private persistRaw(): void {
    const rawSql = this.sqlHandle?.getValue?.() ?? this.svc.joins().rawSql;
    this.svc.patchJoins({ rawSql });
  }

  ngOnDestroy(): void {
    this.persistRaw();
    this.sqlHandle?.dispose();
    this.sqlHandle = null;
  }
}
