import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewOrgAdminComponent } from './view-org-admin.component';

describe('ViewOrgAdminComponent', () => {
  let component: ViewOrgAdminComponent;
  let fixture: ComponentFixture<ViewOrgAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewOrgAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewOrgAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
