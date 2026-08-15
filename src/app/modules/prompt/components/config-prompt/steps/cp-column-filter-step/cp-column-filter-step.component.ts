/**
 * cp-column-filter-step — pick the SELECT expression + a structured filter
 * (column + operator from the filter_operator catalog), or toggle Advanced to
 * write a raw WHERE fragment in Monaco. Reads/writes
 * PromptConfigService.columnFilter.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import {
  CodeEditorService,
  EditorHandle,
} from 'src/app/shared/editor/code-editor.service';
import { PromptConfigService } from '../../../../services/prompt-config.service';

@Component({
  selector: 'cp-column-filter-step',
  templateUrl: './cp-column-filter-step.component.html',
  styleUrls: ['../cp-step.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpColumnFilterStepComponent implements OnInit, OnDestroy {
  @Input({ required: true }) svc!: PromptConfigService;
  private readonly refData = inject(ReferenceDataService);
  private readonly codeEditor = inject(CodeEditorService);

  @ViewChild('sqlHost') sqlHost?: ElementRef<HTMLElement>;
  private sqlHandle: EditorHandle | null = null;

  readonly operators = signal<{ label: string; value: string }[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const ops = await firstValueFrom(
        this.refData.getOptions('filter_operator'),
      );
      this.operators.set(ops ?? []);
    } catch {
      this.operators.set([]);
    }
    // Advanced-on edit case: mount Monaco after view init.
    if (this.svc.columnFilter().useRaw) {
      setTimeout(() => this.mountSql(), 0);
    }
  }

  onSelectExpr(v: string): void {
    this.svc.patchColumnFilter({ selectExpr: v });
  }
  onFilterColumn(v: string): void {
    this.svc.patchColumnFilter({ filterColumn: v });
  }
  onOperator(v: string): void {
    this.svc.patchColumnFilter({ operator: v });
  }

  async toggleAdvanced(useRaw: boolean): Promise<void> {
    this.svc.patchColumnFilter({ useRaw });
    if (useRaw) setTimeout(() => this.mountSql(), 0);
    else {
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
      value: this.svc.columnFilter().rawFilterSql,
    });
    this.sqlHandle.onChange(v =>
      this.svc.patchColumnFilter({ rawFilterSql: v }),
    );
  }
  private persistRaw(): void {
    const rawFilterSql =
      this.sqlHandle?.getValue?.() ?? this.svc.columnFilter().rawFilterSql;
    this.svc.patchColumnFilter({ rawFilterSql });
  }

  ngOnDestroy(): void {
    this.persistRaw();
    this.sqlHandle?.dispose();
    this.sqlHandle = null;
  }
}
