import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewDatabaseComponent } from './view-database.component';

describe('ViewDatabaseComponent', () => {
  let component: ViewDatabaseComponent;
  let fixture: ComponentFixture<ViewDatabaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewDatabaseComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewDatabaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
