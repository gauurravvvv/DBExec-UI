import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewSuperAdminComponent } from './view-super-admin.component';

describe('ViewSuperAdminComponent', () => {
  let component: ViewSuperAdminComponent;
  let fixture: ComponentFixture<ViewSuperAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewSuperAdminComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewSuperAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
