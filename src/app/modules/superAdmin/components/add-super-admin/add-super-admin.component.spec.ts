import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddSuperAdminComponent } from './add-super-admin.component';

describe('AddSuperAdminComponent', () => {
  let component: AddSuperAdminComponent;
  let fixture: ComponentFixture<AddSuperAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AddSuperAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddSuperAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
