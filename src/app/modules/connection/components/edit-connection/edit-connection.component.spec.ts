import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateConnectionComponent } from './update-connection.component';

describe('UpdateConnectionComponent', () => {
  let component: UpdateConnectionComponent;
  let fixture: ComponentFixture<UpdateConnectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ UpdateConnectionComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpdateConnectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
