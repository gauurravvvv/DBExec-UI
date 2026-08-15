import { applyReorder } from './form-builder-store';

describe('applyReorder', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('reorders a list to match the ordered id array', () => {
    const out = applyReorder(['c', 'a', 'b'], list);
    expect(out.map(x => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('returns a new array (does not mutate the input)', () => {
    const out = applyReorder(['b', 'a', 'c'], list);
    expect(out).not.toBe(list);
    expect(list.map(x => x.id)).toEqual(['a', 'b', 'c']); // input untouched
  });

  it('drops ids not present and keeps only known items', () => {
    const out = applyReorder(['b', 'zzz', 'a'], list);
    expect(out.map(x => x.id)).toEqual(['b', 'a']);
  });
});
