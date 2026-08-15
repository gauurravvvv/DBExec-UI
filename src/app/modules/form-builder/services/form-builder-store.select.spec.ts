import { nextSelection } from './form-builder-store';

describe('nextSelection (toggle-to-deselect)', () => {
  it('selects when nothing is selected', () => {
    expect(nextSelection(null, 'field', 'f1')).toEqual({
      kind: 'field',
      id: 'f1',
    });
  });

  it('deselects when the SAME element is clicked again (the USG fix)', () => {
    expect(nextSelection({ kind: 'field', id: 'f1' }, 'field', 'f1')).toBeNull();
  });

  it('switches when a DIFFERENT element of the same kind is clicked', () => {
    expect(nextSelection({ kind: 'field', id: 'f1' }, 'field', 'f2')).toEqual({
      kind: 'field',
      id: 'f2',
    });
  });

  it('switches when a different KIND with the same id is clicked', () => {
    expect(nextSelection({ kind: 'section', id: 'x' }, 'tab', 'x')).toEqual({
      kind: 'tab',
      id: 'x',
    });
  });
});
