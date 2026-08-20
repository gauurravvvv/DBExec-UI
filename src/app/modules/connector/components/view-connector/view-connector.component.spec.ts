import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewConnectorComponent } from './view-connector.component';

describe('ViewConnectorComponent', () => {
  let component: ViewConnectorComponent;
  let fixture: ComponentFixture<ViewConnectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewConnectorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewConnectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
