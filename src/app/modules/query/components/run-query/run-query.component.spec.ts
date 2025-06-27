import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RunQueryComponent } from './run-query.component';

describe('RunQueryComponent', () => {
  let component: RunQueryComponent;
  let fixture: ComponentFixture<RunQueryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RunQueryComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RunQueryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
