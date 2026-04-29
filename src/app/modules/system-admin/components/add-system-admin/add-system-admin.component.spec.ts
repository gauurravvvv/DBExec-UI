import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddSystemAdminComponent } from './add-system-admin.component';

describe('AddSystemAdminComponent', () => {
  let component: AddSystemAdminComponent;
  let fixture: ComponentFixture<AddSystemAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AddSystemAdminComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AddSystemAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
