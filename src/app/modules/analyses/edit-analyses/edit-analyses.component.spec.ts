import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditAnalysesComponent } from './edit-analyses.component';

describe('EditAnalysesComponent', () => {
  let component: EditAnalysesComponent;
  let fixture: ComponentFixture<EditAnalysesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditAnalysesComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditAnalysesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
