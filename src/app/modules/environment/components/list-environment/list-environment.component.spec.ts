import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListEnvironmentComponent } from './list-environment.component';

describe('ListEnvironmentComponent', () => {
  let component: ListEnvironmentComponent;
  let fixture: ComponentFixture<ListEnvironmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListEnvironmentComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListEnvironmentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
