import { TestBed } from '@angular/core/testing';
import { FormBuilderStore } from './form-builder-store';
import { FbAdminService } from './fb-admin.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { ResolvedField, ResolvedTab } from './fb-types';

/**
 * F2 — designer↔runtime contract. getFormVersion (the design read) now enriches
 * each field with the AUTHORED placement values the properties panel binds:
 * the raw allowedOperators (persisted set, not the resolved intersection), the
 * prompt {id,name,type,dataType} sub-object, and the per-locale override maps.
 *
 * This proves the store hydrates those fields verbatim so:
 *   - fb-prop-field binds `field.allowedOperators || []` → the multiselect shows
 *     the SAVED operator set on reload (the restriction is not lost);
 *   - the header falls back to `field.prompt?.name`.
 */
function field(partial: Partial<ResolvedField> & { formFieldId: string }): ResolvedField {
  return {
    promptId: partial.formFieldId,
    blockType: null,
    blockContent: null,
    sequence: 0,
    colSpan: 1,
    label: partial.formFieldId,
    help: null,
    placeholder: null,
    type: 'dropdown',
    dataType: 'text',
    isMandatory: false,
    isVisible: true,
    isReadonly: false,
    isLocked: false,
    defaultValue: null,
    allowedOperators: null,
    localeLabels: null,
    localeHelps: null,
    effectiveAccess: 'write',
    prompt: null,
    ...partial,
  };
}

function tabWith(fields: ResolvedField[]): ResolvedTab {
  return {
    id: 't1',
    name: 'Tab 1',
    icon: null,
    isActive: true,
    sequence: 0,
    localeLabels: null,
    sections: [
      {
        id: 's1',
        name: 'Section 1',
        columns: 2,
        collapsible: false,
        collapsedByDefault: false,
        sequence: 0,
        localeLabels: null,
        fields,
      },
    ],
  };
}

describe('FormBuilderStore.hydrate — designer field round-trip (F2)', () => {
  let store: FormBuilderStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormBuilderStore,
        { provide: FbAdminService, useValue: {} },
        {
          provide: GlobalService,
          useValue: { showWarn: () => {}, showInfo: () => {} },
        },
      ],
    });
    store = TestBed.inject(FormBuilderStore);
  });

  it('preserves the saved allowedOperators so the multiselect binds the restriction', () => {
    const restricted = field({
      formFieldId: 'ff1',
      fieldKey: 'country',
      allowedOperators: ['eq', 'ne'], // admin restricted the field
      prompt: { id: 'p1', name: 'Country', type: 'dropdown', dataType: 'text' },
    });
    store.hydrate({ version: 1, state: 'draft', tabs: [tabWith([restricted])] });

    store.selectField('ff1');
    const selected = store.selectedField();

    expect(selected).toBeTruthy();
    // fb-prop-field binds `[ngModel]="field.allowedOperators || []"`.
    expect(selected!.allowedOperators || []).toEqual(['eq', 'ne']);
  });

  it('a null allowedOperators hydrates as null (the editor renders "all")', () => {
    const unrestricted = field({ formFieldId: 'ff2', allowedOperators: null });
    store.hydrate({ version: 1, state: 'draft', tabs: [tabWith([unrestricted])] });

    store.selectField('ff2');
    expect(store.selectedField()!.allowedOperators).toBeNull();
    expect(store.selectedField()!.allowedOperators || []).toEqual([]);
  });

  it('carries the prompt sub-object so the header shows the prompt name', () => {
    const f = field({
      formFieldId: 'ff3',
      prompt: { id: 'p3', name: 'Country of residence', type: 'dropdown', dataType: 'text' },
    });
    store.hydrate({ version: 1, state: 'draft', tabs: [tabWith([f])] });

    store.selectField('ff3');
    // fb-prop-field header: `{{ field.prompt?.name || field.type }}`.
    expect(store.selectedField()!.prompt?.name).toBe('Country of residence');
  });

  it('round-trips the per-locale label/help override maps', () => {
    const f = field({
      formFieldId: 'ff4',
      localeLabels: { fr: 'Pays' },
      localeHelps: { fr: 'Choisissez un pays' },
    });
    store.hydrate({ version: 1, state: 'draft', tabs: [tabWith([f])] });

    store.selectField('ff4');
    const selected = store.selectedField()!;
    expect(selected.localeLabels).toEqual({ fr: 'Pays' });
    expect(selected.localeHelps).toEqual({ fr: 'Choisissez un pays' });
  });
});
