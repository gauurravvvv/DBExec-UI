import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'filterSchemas', pure: true })
export class FilterSchemasPipe implements PipeTransform {
  transform(schemas: any[] | undefined, search: string): any[] {
    if (!schemas || !search) return schemas || [];
    const term = search.toLowerCase();
    return schemas.filter(schema => {
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
