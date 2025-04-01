import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListScreenComponent } from './list-screen.component';

describe('ListScreenComponent', () => {
  let component: ListScreenComponent;
  let fixture: ComponentFixture<ListScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListScreenComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
