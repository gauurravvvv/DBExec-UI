import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UnsavedChangesService {
  private confirmSubject = new Subject<boolean>();
  showDialog = false;

  confirm(): Promise<boolean> {
    this.showDialog = true;
    return new Promise<boolean>(resolve => {
      const sub = this.confirmSubject.subscribe(result => {
        sub.unsubscribe();
        this.showDialog = false;
        resolve(result);
      });
    });
  }

  respond(leave: boolean): void {
    this.confirmSubject.next(leave);
  }
}
