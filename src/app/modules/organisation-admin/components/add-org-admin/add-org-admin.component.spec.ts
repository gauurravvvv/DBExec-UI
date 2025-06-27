import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddOrgAdminComponent } from './add-org-admin.component';

describe('AddOrgAdminComponent', () => {
  let component: AddOrgAdminComponent;
  let fixture: ComponentFixture<AddOrgAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AddOrgAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddOrgAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
