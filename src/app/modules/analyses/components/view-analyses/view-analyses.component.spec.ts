import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewAnalysesComponent } from './view-analyses.component';

describe('ViewAnalysesComponent', () => {
  let component: ViewAnalysesComponent;
  let fixture: ComponentFixture<ViewAnalysesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewAnalysesComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewAnalysesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
