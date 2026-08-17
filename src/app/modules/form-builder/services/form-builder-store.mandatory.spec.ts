import { TestBed } from '@angular/core/testing';
import { FormBuilderStore } from './form-builder-store';
import { FbAdminService } from './fb-admin.service';
import { GlobalService } from 'src/app/core/services/global.service';
import { FbFormRule, ResolvedField, ResolvedTab } from './fb-types';
import { FormRuntimeStore, FormRuntimeSchema } from './form-runtime-store';

/**
 * C3 — "mandatory beats rule-hide". The server's enforceRules forces every
 * mandatory field visible AFTER folding the logic rules, so a `hide` rule can
 * never strip a required field out of the submit. Both FE stores must mirror
 * that in effectiveFlags, otherwise a mandatory field looks hidden in preview
 * but the server still demands it on execute (an un-fixable submit error).
 */

/** A ResolvedField factory with sane defaults; override what the test cares about. */
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
    type: 'text',
    dataType: 'string',
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

describe('FormBuilderStore.effectiveFlags — mandatory beats rule-hide (C3)', () => {
  let store: FormBuilderStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormBuilderStore,
        { provide: FbAdminService, useValue: {} },
        { provide: GlobalService, useValue: { showWarn: () => {}, showInfo: () => {} } },
      ],
    });
    store = TestBed.inject(FormBuilderStore);
  });

  it('keeps a mandatory field visible even when a firing hide rule targets it', () => {
    const tab: ResolvedTab = {
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
          columns: 1,
          collapsible: false,
          collapsedByDefault: false,
          sequence: 0,
          localeLabels: null,
          fields: [
            field({ formFieldId: 'ff_trigger', fieldKey: 'trigger', isMandatory: false }),
            field({ formFieldId: 'ff_status', fieldKey: 'status', isMandatory: true }),
          ],
        },
      ],
    };
    store.tabs.set([tab]);

    const hideRule: FbFormRule = {
      id: 'r1',
      formVersionId: 'v1',
      name: 'hide status when trigger = x',
      trigger: { kind: 'leaf', fieldKey: 'trigger', op: 'eq', value: 'x' },
      action: 'hide',
      targetFieldKeys: ['status'],
      setValueExpr: null,
      message: null,
      messageI18n: null,
      ruleOrder: 0,
      isEnabled: true,
    };
    store.setRules([hideRule]);

    // Make the hide rule actually fire.
    store.setPreviewValue('trigger', 'x');

    const flags = store.effectiveFlags();
    // Rule fired (proof the hide would otherwise apply)…
    expect(store.previewValues()['trigger']).toBe('x');
    // …yet the mandatory field is forced visible, matching the server.
    expect(flags['status'].visible).toBe(true);
    expect(flags['status'].required).toBe(true);
  });

  it('still hides a NON-mandatory field a firing hide rule targets', () => {
    const tab: ResolvedTab = {
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
          columns: 1,
          collapsible: false,
          collapsedByDefault: false,
          sequence: 0,
          localeLabels: null,
          fields: [
            field({ formFieldId: 'ff_trigger', fieldKey: 'trigger' }),
            field({ formFieldId: 'ff_opt', fieldKey: 'optional', isMandatory: false }),
          ],
        },
      ],
    };
    store.tabs.set([tab]);
    store.setRules([
      {
        id: 'r1',
        formVersionId: 'v1',
        name: 'hide optional',
        trigger: { kind: 'leaf', fieldKey: 'trigger', op: 'eq', value: 'x' },
        action: 'hide',
        targetFieldKeys: ['optional'],
        setValueExpr: null,
        message: null,
        messageI18n: null,
        ruleOrder: 0,
        isEnabled: true,
      },
    ]);
    store.setPreviewValue('trigger', 'x');

    expect(store.effectiveFlags()['optional'].visible).toBe(false);
  });
});

describe('FormRuntimeStore.effectiveFlags — mandatory beats rule-hide (C3)', () => {
  let store: FormRuntimeStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [FormRuntimeStore] });
    store = TestBed.inject(FormRuntimeStore);
  });

  function baseSchema(rules: FormRuntimeSchema['rules']): FormRuntimeSchema {
    return {
      form: {
        id: 'f1',
        name: 'Form',
        description: null,
        datasourceId: 'd1',
        defaultLimit: 1000,
        maxLimit: 50000,
        forceDistinct: false,
      },
      version: 1,
      logicalOperators: [{ code: 'and', label: 'And' }],
      tabs: [
        {
          id: 't1',
          name: 'Tab 1',
          icon: null,
          sequence: 0,
          sections: [
            {
              id: 's1',
              name: 'Section 1',
              columns: 1,
              sequence: 0,
              fields: [
                {
                  formFieldId: 'ff_trigger',
                  fieldKey: 'trigger',
                  promptId: 'p_trigger',
                  blockType: null,
                  label: 'Trigger',
                  help: null,
                  type: 'text',
                  dataType: 'string',
                  isMandatory: false,
                  isVisible: true,
                  isReadonly: false,
                  isLocked: false,
                  operators: [],
                  valueSource: null as never,
                  effectiveAccess: 'write',
                },
                {
                  formFieldId: 'ff_status',
                  fieldKey: 'status',
                  promptId: 'p_status',
                  blockType: null,
                  label: 'Status',
                  help: null,
                  type: 'text',
                  dataType: 'string',
                  isMandatory: true,
                  isVisible: true,
                  isReadonly: false,
                  isLocked: false,
                  operators: [],
                  valueSource: null as never,
                  effectiveAccess: 'write',
                },
              ],
            },
          ],
        },
      ],
      rules,
    };
  }

  it('keeps a mandatory field visible even when a firing hide rule targets it', () => {
    store.hydrateForm(
      baseSchema([
        {
          id: 'r1',
          name: 'hide status',
          trigger: { kind: 'leaf', fieldKey: 'trigger', op: 'eq', value: 'x' },
          action: 'hide',
          targetFieldKeys: ['status'],
          setValueExpr: null,
          sequence: 0,
        },
      ]),
    );
    // Drive the trigger value so the hide rule fires.
    store.values.set({ trigger: 'x' });

    const flags = store.effectiveFlags();
    expect(flags['status'].visible).toBe(true);
    expect(flags['status'].required).toBe(true);
  });
});
