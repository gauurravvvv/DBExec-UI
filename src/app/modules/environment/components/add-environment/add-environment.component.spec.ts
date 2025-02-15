import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddEnvironmentComponent } from './add-environment.component';

describe('AddEnvironmentComponent', () => {
  let component: AddEnvironmentComponent;
  let fixture: ComponentFixture<AddEnvironmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AddEnvironmentComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddEnvironmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
