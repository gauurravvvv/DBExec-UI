/**
 * Form Builder rule/expression logic — the FE half of the byte-identical
 * BE↔FE engine pair. `ruleEngine` + `exprEngine` are copied verbatim from
 * `dbexec-api/src/shared/services/formRules/` inside the PARITY fences (pinned
 * by `rule-parity.spec.ts`); `ruleAst.adapter` is the non-fenced bridge between
 * the persisted trigger shape and the engine's Condition shape.
 */
export * from './ruleEngine';
export * from './exprEngine';
export * from './ruleAst.adapter';
