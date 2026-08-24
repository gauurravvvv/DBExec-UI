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
  computed,
  inject,
  signal,
} from '@angular/core';
// (Injector no longer needed — operators is a computed, not an effect.)
import { Subject, takeUntil } from 'rxjs';
import {
  ReferenceDataService,
  ReferenceRow,
} from 'src/app/core/services/reference-data.service';
import { operatorOptionsFromCatalog } from 'src/app/modules/form-builder/helpers/fb-operator-catalog';
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
  private readonly destroy$ = new Subject<void>();

  /** Raw filter_operator catalog rows (persistent subscription — never the
   *  empty initial BehaviorSubject emission the old firstValueFrom grabbed). */
  private readonly catalogRows = signal<ReferenceRow[]>([]);

  /**
   * Operators applicable to the prompt's dataType, filtered via the SAME rule
   * the Form Builder + BE use (operatorOptionsFromCatalog). A `computed`
   * (NOT an effect — writing a signal inside an effect throws NG0600) so it
   * re-derives whenever the catalog loads OR the dataType changes.
   */
  readonly operators = computed<{ label: string; value: string }[]>(() => {
    const rows = this.catalogRows();
    // Empty/whitespace dataType → null so the catalog helper applies its
    // `text` default (nullish coalescing would keep an empty string and match
    // no operators). Unknown types also fall through to text.
    const raw = (this.svc.dataType() || '').trim();
    const dt = raw.length ? raw : null;
    return operatorOptionsFromCatalog(rows, dt).map(o => ({
      label: o.label,
      value: o.code,
    }));
  });

  ngOnInit(): void {
    // Persistent subscribe — the reference-data load resolves asynchronously,
    // and getFamily re-emits when it lands (the old firstValueFrom resolved on
    // the empty initial cache snapshot → the "operators don't load" bug).
    this.refData
      .getFamily('filter_operator')
      .pipe(takeUntil(this.destroy$))
      .subscribe(rows => this.catalogRows.set(rows ?? []));

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
    this.destroy$.next();
    this.destroy$.complete();
    this.persistRaw();
    this.sqlHandle?.dispose();
    this.sqlHandle = null;
  }
}
