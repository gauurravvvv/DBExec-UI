import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'filterSchemas', pure: true })
export class FilterSchemasPipe implements PipeTransform {
  /**
   * Two filters applied in order:
   *
   *   `scopedSchema` — hard scope, set when the user picked a schema
   *      in the dataset-create popup. Hides every other schema in
   *      the tree. Cross-schema SQL still works in the editor; the
   *      tree just narrows so the user doesn't have to scroll past
   *      schemas they didn't ask for.
   *
   *   `search` — soft filter, driven by the sidebar search box.
   *      Matches the schema name or any table name within it.
   */
  transform(
    schemas: any[] | undefined,
    search: string,
    scopedSchema: string | null = null,
  ): any[] {
    if (!schemas) return [];
    const scoped = scopedSchema
      ? schemas.filter(s => s.name === scopedSchema)
      : schemas;
    if (!search) return scoped;
    const term = search.toLowerCase();
    return scoped.filter(schema => {
      const schemaNameMatches = schema.name.toLowerCase().includes(term);
      const hasMatchingTable = schema.tables?.some((t: any) =>
        t.name.toLowerCase().includes(term),
      );
      return schemaNameMatches || hasMatchingTable;
    });
  }
}

@Pipe({ name: 'filterTables', pure: true })
export class FilterTablesPipe implements PipeTransform {
  transform(tables: any[] | undefined, search: string): any[] {
    if (!tables || !search) return tables || [];
    const term = search.toLowerCase();
    return tables.filter(t => t.name.toLowerCase().includes(term));
  }
}
