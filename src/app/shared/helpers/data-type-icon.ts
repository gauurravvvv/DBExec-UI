/**
 * One data-type vocabulary for the whole app.
 *
 * A column's type is shown in at least three places — the dataset details page,
 * the live field sidebar and the object explorers — and they had drifted: the
 * field sidebar rendered `pi-table` for EVERY field, so twenty-six columns of
 * integers, dates and text all carried the same glyph and the icon column said
 * nothing at all.
 *
 * Lifted verbatim from ViewDatasetComponent, which already had the complete
 * mapping. Pure string in, icon name out — no component state, so it is safe for
 * any surface to call.
 */

/**
 * A PrimeIcons class for a database type name.
 *
 * Matches on substrings rather than an exact list because the type arrives
 * straight from the driver: `character varying(20)`, `numeric(12,2)` and
 * `timestamp without time zone` all have to resolve.
 */
export function dataTypeIcon(dataType: string): string {
  if (!dataType) return 'pi-tag';
  const type = dataType.toLowerCase();
  if (
    type.includes('int') ||
    type.includes('numeric') ||
    type.includes('decimal') ||
    type.includes('float') ||
    type.includes('double') ||
    type.includes('real') ||
    type.includes('serial') ||
    type.includes('money')
  ) {
    return 'pi-hashtag';
  }
  if (
    type.includes('char') ||
    type.includes('text') ||
    type.includes('string') ||
    type.includes('citext') ||
    type.includes('name')
  ) {
    return 'pi-align-left';
  }
  if (type.includes('bool')) {
    return 'pi-check-square';
  }
  if (
    type.includes('timestamp') ||
    type.includes('date') ||
    type.includes('time') ||
    type.includes('interval')
  ) {
    return 'pi-calendar';
  }
  if (type.includes('uuid')) {
    return 'pi-key';
  }
  if (type.includes('json')) {
    return 'pi-code';
  }
  if (type.includes('array') || type.includes('[]')) {
    return 'pi-list';
  }
  if (type.includes('bytea') || type.includes('blob')) {
    return 'pi-file';
  }
  if (
    type.includes('inet') ||
    type.includes('cidr') ||
    type.includes('macaddr')
  ) {
    return 'pi-globe';
  }
  if (type.includes('enum') || type.includes('user-defined')) {
    return 'pi-sliders-h';
  }
  return 'pi-tag';
}
