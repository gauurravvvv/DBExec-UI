import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListConnectorComponent } from './list-connector.component';

describe('ListConnectorComponent', () => {
  let component: ListConnectorComponent;
  let fixture: ComponentFixture<ListConnectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ListConnectorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListConnectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
