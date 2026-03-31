import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddQueryBuilderComponent } from './add-query-builder.component';

describe('AddQueryBuilderComponent', () => {
  let component: AddQueryBuilderComponent;
  let fixture: ComponentFixture<AddQueryBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AddQueryBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AddQueryBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
