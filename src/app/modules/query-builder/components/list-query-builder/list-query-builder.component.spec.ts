import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListQueryBuilderComponent } from './list-query-builder.component';

describe('ListQueryBuilderComponent', () => {
  let component: ListQueryBuilderComponent;
  let fixture: ComponentFixture<ListQueryBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ListQueryBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListQueryBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
