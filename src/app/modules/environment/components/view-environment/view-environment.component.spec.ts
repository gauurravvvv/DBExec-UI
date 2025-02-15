import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewEnvironmentComponent } from './view-environment.component';

describe('ViewEnvironmentComponent', () => {
  let component: ViewEnvironmentComponent;
  let fixture: ComponentFixture<ViewEnvironmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewEnvironmentComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewEnvironmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
