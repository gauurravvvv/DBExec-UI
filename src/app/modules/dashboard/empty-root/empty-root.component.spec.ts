import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmptyRootComponent } from './empty-root.component';

describe('EmptyRootComponent', () => {
  let component: EmptyRootComponent;
  let fixture: ComponentFixture<EmptyRootComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EmptyRootComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmptyRootComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
