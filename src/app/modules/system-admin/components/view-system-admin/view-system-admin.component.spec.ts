import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewSystemAdminComponent } from './view-system-admin.component';

describe('ViewSystemAdminComponent', () => {
  let component: ViewSystemAdminComponent;
  let fixture: ComponentFixture<ViewSystemAdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewSystemAdminComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewSystemAdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
