import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditOrgAdminComponent } from './edit-org-admin.component';

describe('EditOrgAdminComponent', () => {
  let component: EditOrgAdminComponent;
  let fixture: ComponentFixture<EditOrgAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditOrgAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditOrgAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
