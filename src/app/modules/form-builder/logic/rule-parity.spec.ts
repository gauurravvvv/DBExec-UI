/**
 * rule-parity.spec — the byte-parity pin for the ported engines.
 *
 * Reads the FE engine copies AND the sibling BE originals off disk and asserts
 * the region between `/* PARITY:START` and `/* PARITY:END` matches byte-for-byte.
 * If the BE repo is not checked out beside the FE (an FE-only build agent), the
 * cross-repo assertions skip, but the always-run self-check still proves the
 * fences are present in the FE copies.
 *
 * NOTE on the relative path: the two repos live side by side under a common
 * parent (`.../DBExec/dbexec-ui` and `.../DBExec/dbexec-api`). From this spec's
 * directory (`dbexec-ui/src/app/modules/form-builder/logic`) six `..` segments
 * reach `.../DBExec`, then down into `dbexec-api/...`. Adjust the segment count
 * if a checkout layout differs — the `existsSync` guard degrades to `.skip`
 * rather than failing spuriously.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const FE_DIR = __dirname; // .../dbexec-ui/src/app/modules/form-builder/logic
// sibling API repo: .../dbexec-api/src/shared/services/formRules
const API_DIR = join(
  FE_DIR,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'dbexec-api',
  'src',
  'shared',
  'services',
  'formRules',
);

function fenced(src: string): string {
  const m = src.match(/\/\* PARITY:START[^\n]*\n([\s\S]*?)\/\* PARITY:END \*\//);
  if (!m) throw new Error('PARITY fences not found');
  return m[1];
}

describe('rule/expr engine parity (BE <-> FE)', () => {
  const apiPresent = existsSync(join(API_DIR, 'ruleEngine.ts'));

  (apiPresent ? it : it.skip)('ruleEngine fenced regions are byte-identical', () => {
    const fe = readFileSync(join(FE_DIR, 'ruleEngine.ts'), 'utf8');
    const be = readFileSync(join(API_DIR, 'ruleEngine.ts'), 'utf8');
    expect(fenced(fe)).toBe(fenced(be));
  });

  (apiPresent ? it : it.skip)('exprEngine fenced regions are byte-identical', () => {
    const fe = readFileSync(join(FE_DIR, 'exprEngine.ts'), 'utf8');
    const be = readFileSync(join(API_DIR, 'exprEngine.ts'), 'utf8');
    expect(fenced(fe)).toBe(fenced(be));
  });

  it('parity fences exist in both FE files (self-check, always runs)', () => {
    expect(() =>
      fenced(readFileSync(join(FE_DIR, 'ruleEngine.ts'), 'utf8')),
    ).not.toThrow();
    expect(() =>
      fenced(readFileSync(join(FE_DIR, 'exprEngine.ts'), 'utf8')),
    ).not.toThrow();
  });
});
