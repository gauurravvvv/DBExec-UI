import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListDatabaseComponent } from './list-database.component';

describe('ListDatabaseComponent', () => {
  let component: ListDatabaseComponent;
  let fixture: ComponentFixture<ListDatabaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListDatabaseComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListDatabaseComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
