import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { DestroyRef } from '@angular/core';
import {
  operatorOptionsFallback,
  operatorOptionsFromCatalog,
} from './fb-operator-catalog';
import type { ReferenceRow } from 'src/app/core/services/reference-data.service';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { FormBuilderStore } from '../services/form-builder-store';
import { FbPropFieldComponent } from '../components/fb-properties-panel/fb-prop-field.component';
import type { ResolvedField } from '../services/fb-types';

/**
 * A trimmed but faithful slice of the seeded `filter_operator` reference-data
 * catalog — same codes/meta the BE emits from
 * seedReferenceData.ROWS. Includes the three connectors so the tests prove
 * they are excluded. `meta.dataTypes` and `meta.arity`/`meta.sqlTemplate` drive
 * the applicability rule; connectors carry `isConnector: true`.
 */
const FILTER_OPERATOR_CATALOG: ReferenceRow[] = [
  {
    code: 'eq',
    label: 'Equals',
    sequence: 1,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} = {p1}',
      dataTypes: ['text', 'number', 'date', 'datetime', 'bool', 'enum', 'uuid'],
    },
  },
  {
    code: 'neq',
    label: 'Not equal to',
    sequence: 2,
    meta: {
      arity: 'one',
      sqlTemplate: '({expr} IS DISTINCT FROM {p1})',
      dataTypes: ['*'],
    },
  },
  {
    code: 'gt',
    label: 'Greater than',
    sequence: 3,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} > {p1}',
      dataTypes: ['number', 'date', 'datetime'],
    },
  },
  {
    code: 'gte',
    label: 'Greater than or equal',
    sequence: 4,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} >= {p1}',
      dataTypes: ['number', 'date', 'datetime'],
    },
  },
  {
    code: 'lt',
    label: 'Less than',
    sequence: 5,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} < {p1}',
      dataTypes: ['number', 'date', 'datetime'],
    },
  },
  {
    code: 'lte',
    label: 'Less than or equal',
    sequence: 6,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} <= {p1}',
      dataTypes: ['number', 'date', 'datetime'],
    },
  },
  {
    code: 'between',
    label: 'Between',
    sequence: 7,
    meta: {
      arity: 'two',
      sqlTemplate: '{expr} BETWEEN {p1} AND {p2}',
      dataTypes: ['number', 'date', 'datetime'],
    },
  },
  {
    code: 'not_between',
    label: 'Not between',
    sequence: 8,
    meta: {
      arity: 'two',
      sqlTemplate: '{expr} NOT BETWEEN {p1} AND {p2}',
      dataTypes: ['number', 'date', 'datetime'],
    },
  },
  {
    code: 'contains',
    label: 'Contains',
    sequence: 9,
    meta: {
      arity: 'one',
      sqlTemplate: "{expr} ILIKE {p1} ESCAPE '\\'",
      dataTypes: ['text'],
    },
  },
  {
    code: 'does_not_contain',
    label: 'Does not contain',
    sequence: 10,
    meta: {
      arity: 'one',
      sqlTemplate: "({expr} IS NULL OR {expr} NOT ILIKE {p1} ESCAPE '\\')",
      dataTypes: ['text'],
    },
  },
  {
    code: 'starts_with',
    label: 'Starts with',
    sequence: 11,
    meta: {
      arity: 'one',
      sqlTemplate: "{expr} ILIKE {p1} ESCAPE '\\'",
      dataTypes: ['text'],
    },
  },
  {
    code: 'ends_with',
    label: 'Ends with',
    sequence: 12,
    meta: {
      arity: 'one',
      sqlTemplate: "{expr} ILIKE {p1} ESCAPE '\\'",
      dataTypes: ['text'],
    },
  },
  {
    code: 'before',
    label: 'Before',
    sequence: 13,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} < {p1}',
      dataTypes: ['date', 'datetime'],
    },
  },
  {
    code: 'after',
    label: 'After',
    sequence: 14,
    meta: {
      arity: 'one',
      sqlTemplate: '{expr} > {p1}',
      dataTypes: ['date', 'datetime'],
    },
  },
  {
    code: 'in',
    label: 'Is any of',
    sequence: 15,
    meta: {
      arity: 'many',
      sqlTemplate: '{expr} = ANY({p1})',
      dataTypes: ['text', 'number', 'enum', 'uuid'],
    },
  },
  {
    code: 'not_in',
    label: 'Is none of',
    sequence: 16,
    meta: {
      arity: 'many',
      sqlTemplate: '({expr} IS NULL OR {expr} <> ALL({p1}))',
      dataTypes: ['text', 'number', 'enum', 'uuid'],
    },
  },
  {
    code: 'is_null',
    label: 'Is empty',
    sequence: 17,
    meta: { arity: 'none', sqlTemplate: '{expr} IS NULL', dataTypes: ['*'] },
  },
  {
    code: 'is_not_null',
    label: 'Is not empty',
    sequence: 18,
    meta: { arity: 'none', sqlTemplate: '{expr} IS NOT NULL', dataTypes: ['*'] },
  },
  {
    code: 'in_last_days',
    label: 'In the last N days',
    sequence: 19,
    meta: {
      arity: 'one',
      sqlTemplate: "{expr} >= now() - ({p1}::int * interval '1 day')",
      dataTypes: ['date', 'datetime'],
    },
  },
  // connectors — excluded from per-condition options by isConnector
  {
    code: 'and',
    label: 'All of (AND)',
    sequence: 20,
    meta: {
      arity: 'none',
      sqlTemplate: '({children} AND ...)',
      dataTypes: ['*'],
      isConnector: true,
    },
  },
  {
    code: 'or',
    label: 'Any of (OR)',
    sequence: 21,
    meta: {
      arity: 'none',
      sqlTemplate: '({children} OR ...)',
      dataTypes: ['*'],
      isConnector: true,
    },
  },
  {
    code: 'not',
    label: 'Not',
    sequence: 22,
    meta: {
      arity: 'none',
      sqlTemplate: '(NOT {children})',
      dataTypes: ['*'],
      isConnector: true,
    },
  },
];

describe('operatorOptionsFromCatalog (live filter_operator catalog)', () => {
  it('bool → only eq/neq/is_null/is_not_null, real seed codes, no connectors, no ne', () => {
    const opts = operatorOptionsFromCatalog(FILTER_OPERATOR_CATALOG, 'bool');
    const codes = opts.map(o => o.code);

    // exact applicable set for bool (dataTypes '*' or 'bool')
    expect(codes).toEqual(['eq', 'neq', 'is_null', 'is_not_null']);

    // the bug: real seed code present, stale FE code absent
    expect(codes).toContain('neq');
    expect(codes).not.toContain('ne');

    // connectors excluded
    expect(codes).not.toContain('and');
    expect(codes).not.toContain('or');
    expect(codes).not.toContain('not');

    // labels come from the DB rows verbatim
    expect(opts.find(o => o.code === 'neq')?.label).toBe('Not equal to');
  });

  it('datetime → full applicable set incl. previously-missing ops, ordered by sequence', () => {
    const opts = operatorOptionsFromCatalog(FILTER_OPERATOR_CATALOG, 'datetime');
    const codes = opts.map(o => o.code);

    // BE rule: every predicate whose dataTypes includes '*' or 'datetime'
    expect(codes).toEqual([
      'eq',
      'neq',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
      'not_between',
      'before',
      'after',
      'is_null',
      'is_not_null',
      'in_last_days',
    ]);

    // real seed code, not the stale one
    expect(codes).toContain('neq');
    expect(codes).not.toContain('ne');

    // ops the old hardcoded FE map could never author are now offered
    expect(codes).toEqual(
      expect.arrayContaining([
        'not_between',
        'before',
        'after',
        'in_last_days',
      ]),
    );

    // text-only predicates excluded for datetime
    expect(codes).not.toContain('contains');
    expect(codes).not.toContain('starts_with');
    expect(codes).not.toContain('ends_with');
    expect(codes).not.toContain('does_not_contain');

    // connectors excluded
    expect(codes).not.toContain('and');
    expect(codes).not.toContain('or');
    expect(codes).not.toContain('not');

    // ordering follows the catalog sequence
    const seqOrder = FILTER_OPERATOR_CATALOG.filter(r =>
      codes.includes(r.code),
    ).map(r => r.code);
    expect(codes).toEqual(seqOrder);
  });

  it('text → includes the string predicates, excludes numeric-only + connectors', () => {
    const codes = operatorOptionsFromCatalog(
      FILTER_OPERATOR_CATALOG,
      'text',
    ).map(o => o.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'eq',
        'neq',
        'contains',
        'does_not_contain',
        'starts_with',
        'ends_with',
        'in',
        'not_in',
        'is_null',
        'is_not_null',
      ]),
    );
    expect(codes).not.toContain('ne');
    expect(codes).not.toContain('gt'); // numeric/date only
    expect(codes).not.toContain('and');
  });

  it('null dataType defaults to text (BE default), never returns "ne"', () => {
    const codes = operatorOptionsFromCatalog(FILTER_OPERATOR_CATALOG, null).map(
      o => o.code,
    );
    expect(codes).toContain('eq');
    expect(codes).toContain('neq');
    expect(codes).not.toContain('ne');
  });

  it('empty / missing catalog yields no options (component then falls back)', () => {
    expect(operatorOptionsFromCatalog([], 'bool')).toEqual([]);
    expect(operatorOptionsFromCatalog(null, 'bool')).toEqual([]);
    expect(operatorOptionsFromCatalog(undefined, 'bool')).toEqual([]);
  });
});

describe('operatorOptionsFallback (catalog fetch failed)', () => {
  it('never emits the stale "ne"; uses real "neq" seed code', () => {
    for (const dt of ['text', 'number', 'date', 'datetime', 'bool', 'enum', 'uuid']) {
      const codes = operatorOptionsFallback(dt).map(o => o.code);
      expect(codes).not.toContain('ne');
      expect(codes).toContain('neq');
    }
  });

  it('bool fallback matches the live-catalog applicable set', () => {
    expect(operatorOptionsFallback('bool').map(o => o.code)).toEqual([
      'eq',
      'neq',
      'is_null',
      'is_not_null',
    ]);
  });
});

describe('FbPropFieldComponent — operator options wired to ReferenceDataService', () => {
  function makeField(dataType: string | null): ResolvedField {
    return {
      formFieldId: 'ff1',
      promptId: 'p1',
      blockType: null,
      blockContent: null,
      sequence: 0,
      colSpan: 1,
      label: 'Field',
      help: null,
      placeholder: null,
      type: 'text_input',
      dataType,
      isMandatory: false,
      isVisible: true,
      isReadonly: false,
      isLocked: false,
      defaultValue: null,
      allowedOperators: null,
      localeLabels: null,
      localeHelps: null,
      effectiveAccess: 'write',
      prompt: { id: 'p1', name: 'Field', type: 'text_input', dataType },
    };
  }

  function build(getFamily: jest.Mock): FbPropFieldComponent {
    const refStub = { getFamily } as unknown as ReferenceDataService;
    // The component only touches the store in colSpanOptions/patch, neither of
    // which these tests exercise — a bare stub avoids dragging in the store's
    // own deps (FbAdminService/GlobalService).
    const storeStub = {
      selectedSection: () => null,
      updatePlacement: () => {},
    } as unknown as FormBuilderStore;
    TestBed.configureTestingModule({
      providers: [
        FbPropFieldComponent,
        { provide: FormBuilderStore, useValue: storeStub },
        { provide: ReferenceDataService, useValue: refStub },
      ],
    });
    return TestBed.runInInjectionContext(() =>
      TestBed.inject(FbPropFieldComponent),
    );
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sources options from the fetched catalog (neq present, ne absent, connectors excluded)', () => {
    const getFamily = jest.fn().mockReturnValue(of(FILTER_OPERATOR_CATALOG));
    const cmp = build(getFamily);
    cmp.field = makeField('bool');
    cmp.ngOnInit();

    expect(getFamily).toHaveBeenCalledWith('filter_operator');
    const codes = cmp.operatorOptions().map(o => o.code);
    expect(codes).toEqual(['eq', 'neq', 'is_null', 'is_not_null']);
    expect(codes).toContain('neq');
    expect(codes).not.toContain('ne');
    expect(codes).not.toContain('and');
  });

  it('renders empty while the catalog is still loading', () => {
    // getFamily returns a stream that has not emitted yet
    const getFamily = jest.fn().mockReturnValue(of()); // completes with no value
    const cmp = build(getFamily);
    cmp.field = makeField('datetime');
    // don't call ngOnInit's subscription result — operatorRows stays null
    expect(cmp.operatorOptions()).toEqual([]);
  });

  it('falls back to the corrected static map if the catalog is empty', () => {
    const getFamily = jest.fn().mockReturnValue(of([]));
    const cmp = build(getFamily);
    cmp.field = makeField('bool');
    cmp.ngOnInit();
    const codes = cmp.operatorOptions().map(o => o.code);
    expect(codes).toEqual(['eq', 'neq', 'is_null', 'is_not_null']);
    expect(codes).not.toContain('ne');
  });
});
