import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'fileSize', pure: true })
export class FileSizePipe implements PipeTransform {
  transform(sizeMB: number | null | undefined): string {
    if (!sizeMB && sizeMB !== 0) return '0 MB';

    if (sizeMB >= 1024) {
      return `${(sizeMB / 1024).toFixed(2)} GB`;
    } else if (sizeMB < 1) {
      return `${(sizeMB * 1024).toFixed(2)} KB`;
    }
    return `${sizeMB.toFixed(2)} MB`;
  }
}
