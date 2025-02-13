import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListSuperAdminComponent } from './list-super-admin.component';

describe('ListSuperAdminComponent', () => {
  let component: ListSuperAdminComponent;
  let fixture: ComponentFixture<ListSuperAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListSuperAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListSuperAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
