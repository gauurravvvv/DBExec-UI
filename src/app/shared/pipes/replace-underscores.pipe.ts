import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'replaceUnderscores', pure: true })
export class ReplaceUnderscoresPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return value?.replace(/_/g, ' ') || '-';
  }
}
