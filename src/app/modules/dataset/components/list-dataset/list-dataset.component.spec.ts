import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListDatasetComponent } from './list-dataset.component';

describe('ListDatasetComponent', () => {
  let component: ListDatasetComponent;
  let fixture: ComponentFixture<ListDatasetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListDatasetComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListDatasetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
