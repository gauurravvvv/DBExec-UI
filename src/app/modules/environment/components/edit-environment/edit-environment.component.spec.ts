import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditEnvironmentComponent } from './edit-environment.component';

describe('EditEnvironmentComponent', () => {
  let component: EditEnvironmentComponent;
  let fixture: ComponentFixture<EditEnvironmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditEnvironmentComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditEnvironmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
