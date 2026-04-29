import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UnsavedChangesService {
  private confirmSubject = new Subject<boolean>();
  showDialog = signal(false);

  confirm(): Promise<boolean> {
    this.showDialog.set(true);
    return new Promise<boolean>(resolve => {
      const sub = this.confirmSubject.subscribe(result => {
        sub.unsubscribe();
        this.showDialog.set(false);
        resolve(result);
      });
    });
  }

  respond(leave: boolean): void {
    this.confirmSubject.next(leave);
  }
}
