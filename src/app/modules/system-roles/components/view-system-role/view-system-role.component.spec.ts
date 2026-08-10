import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewSystemRoleComponent } from './view-system-role.component';

describe('ViewSystemRoleComponent', () => {
  let component: ViewSystemRoleComponent;
  let fixture: ComponentFixture<ViewSystemRoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewSystemRoleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewSystemRoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
