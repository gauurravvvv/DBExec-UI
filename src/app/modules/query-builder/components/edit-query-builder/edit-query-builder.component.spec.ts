import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditQueryBuilderComponent } from './edit-query-builder.component';

describe('EditQueryBuilderComponent', () => {
  let component: EditQueryBuilderComponent;
  let fixture: ComponentFixture<EditQueryBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EditQueryBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditQueryBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
