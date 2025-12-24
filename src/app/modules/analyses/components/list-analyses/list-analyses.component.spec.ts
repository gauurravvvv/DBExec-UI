import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListAnalysesComponent } from './list-analyses.component';

describe('ListAnalysesComponent', () => {
  let component: ListAnalysesComponent;
  let fixture: ComponentFixture<ListAnalysesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListAnalysesComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListAnalysesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
