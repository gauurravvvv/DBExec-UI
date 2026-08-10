import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListSystemRoleComponent } from './list-system-role.component';

describe('ListSystemRoleComponent', () => {
  let component: ListSystemRoleComponent;
  let fixture: ComponentFixture<ListSystemRoleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ListSystemRoleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListSystemRoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
