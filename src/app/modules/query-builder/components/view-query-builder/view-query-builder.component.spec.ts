import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewQueryBuilderComponent } from './view-query-builder.component';

describe('ViewQueryBuilderComponent', () => {
  let component: ViewQueryBuilderComponent;
  let fixture: ComponentFixture<ViewQueryBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewQueryBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewQueryBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
