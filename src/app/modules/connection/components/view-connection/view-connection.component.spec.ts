import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewConnectionComponent } from './view-connection.component';

describe('ViewConnectionComponent', () => {
  let component: ViewConnectionComponent;
  let fixture: ComponentFixture<ViewConnectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewConnectionComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewConnectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
