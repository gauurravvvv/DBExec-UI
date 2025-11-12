import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListConnectionComponent } from './list-connection.component';

describe('ListConnectionComponent', () => {
  let component: ListConnectionComponent;
  let fixture: ComponentFixture<ListConnectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListConnectionComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListConnectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
