import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListOrgAdminComponent } from './list-org-admin.component';

describe('ListOrgAdminComponent', () => {
  let component: ListOrgAdminComponent;
  let fixture: ComponentFixture<ListOrgAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListOrgAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListOrgAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
