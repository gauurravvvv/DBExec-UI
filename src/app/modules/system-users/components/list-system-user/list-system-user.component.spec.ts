import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListSystemUserComponent } from './list-system-user.component';

describe('ListSystemUserComponent', () => {
  let component: ListSystemUserComponent;
  let fixture: ComponentFixture<ListSystemUserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ListSystemUserComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListSystemUserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
