/**
 * cp-source-step — pick the prompt's source schema + table (+ optional alias).
 * Reads/writes PromptConfigService.source. Schema/table lists come from the
 * DatasourceService for the prompt's datasource (svc.datasourceId).
 */
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  Input,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { PROMPT_DATA_TYPE_OPTIONS } from '../../../../constants/prompt.constant';
import { PromptConfigService } from '../../../../services/prompt-config.service';

interface Option {
  label: string;
  value: string;
}

@Component({
  selector: 'cp-source-step',
  templateUrl: './cp-source-step.component.html',
  styleUrls: ['../cp-step.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CpSourceStepComponent implements OnInit {
  @Input({ required: true }) svc!: PromptConfigService;
  private readonly datasources = inject(DatasourceService);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);

  readonly schemas = signal<Option[]>([]);
  readonly tables = signal<Option[]>([]);
  readonly loadingTables = signal(false);

  /** Suggested logical data types (dataType is free-form; drives operators). */
  readonly dataTypeOptions: Option[] = PROMPT_DATA_TYPE_OPTIONS.map(o => ({
    value: o.value,
    label: this.translate.instant(o.labelKey),
  }));

  private loadedForDsId = '';
  /** `${dsId}::${schema}` the tables list was last loaded for — dedupes the
   *  schema effect so it fetches once per (datasource, schema). */
  private loadedTablesKey = '';

  onDataType(dt: string): void {
    this.svc.setDataTypeOverride(dt);
  }

  ngOnInit(): void {
    // Effect 1 — load SCHEMAS when the datasourceId lands. The shell sets it
    // AFTER an async loadOne(), which resolves AFTER this child's ngOnInit, so
    // a one-shot read would see an empty id and skip the fetch. loadedForDsId
    // keeps it to one fetch per datasource.
    effect(
      () => {
        const dsId = this.svc.datasourceId();
        if (dsId && dsId !== this.loadedForDsId) {
          this.loadedForDsId = dsId;
          void this.loadSchemas(dsId);
        }
      },
      { injector: this.injector },
    );

    // Effect 2 — load TABLES when a schema is present (reopen/edit case). This
    // MUST be independent of the schemas fetch: on reopen the shell sets
    // source.schema via svc.load() which can resolve AFTER effect 1 already ran
    // (with an empty schema), so loading tables only inside loadSchemas() left
    // the table dropdown empty — the selected table couldn't render because it
    // wasn't in the options ("table data not patched"). Reacting to the schema
    // signal fetches tables regardless of ordering. Guarded per (ds, schema).
    //
    // loadTables() writes signals (loadingTables/tables) BEFORE its first await,
    // which would run inside this effect's reactive context and throw NG0600.
    // Defer it to a microtask so the writes happen outside the effect.
    effect(
      () => {
        const dsId = this.svc.datasourceId();
        const schema = this.svc.source().schema;
        if (!dsId || !schema) return;
        const key = `${dsId}::${schema}`;
        if (key !== this.loadedTablesKey) {
          this.loadedTablesKey = key;
          queueMicrotask(() => void this.loadTables(schema));
        }
      },
      { injector: this.injector },
    );
  }

  private async loadSchemas(dsId: string): Promise<void> {
    try {
      const res: any = await this.datasources.listDatasourceSchemas(
        { datasourceId: dsId },
        true,
      );
      const rows: any[] = res?.data ?? [];
      this.schemas.set(
        rows.map((r: any) => {
          const name =
            typeof r === 'string' ? r : r.schema_name ?? r.schemaName ?? r.name;
          return { label: name, value: name };
        }),
      );
    } catch {
      this.schemas.set([]);
    }
    // Tables are loaded by the schema effect (effect 2), so they populate on
    // reopen no matter whether the schema was set before or after this fetch.
  }

  async onSchema(schema: string): Promise<void> {
    // dropdown fires onChangeEvent — cascade reset dependent fields.
    this.svc.patchSource({ schema, table: '', alias: '' });
    // Load tables here for immediate feedback, and stamp the effect-2 guard key
    // so the schema effect doesn't fire a duplicate fetch for the same schema.
    const dsId = this.svc.datasourceId();
    this.loadedTablesKey = `${dsId}::${schema}`;
    await this.loadTables(schema);
  }

  onTable(table: string): void {
    this.svc.patchSource({ table, alias: table?.slice(0, 3) ?? '' });
  }

  onAlias(alias: string): void {
    this.svc.patchSource({ alias });
  }

  private async loadTables(schema: string): Promise<void> {
    const dsId = this.svc.datasourceId();
    if (!dsId || !schema) {
      this.tables.set([]);
      return;
    }
    this.loadingTables.set(true);
    try {
      const res: any = await this.datasources.listSchemaTables(
        { datasourceId: dsId, schemaName: schema },
        true,
      );
      const rows: any[] = res?.data ?? [];
      this.tables.set(
        rows.map((r: any) => {
          const name = r.table_name ?? r.tableName ?? r.name ?? String(r);
          return { label: name, value: name };
        }),
      );
    } catch {
      this.tables.set([]);
    } finally {
      this.loadingTables.set(false);
    }
  }
}
