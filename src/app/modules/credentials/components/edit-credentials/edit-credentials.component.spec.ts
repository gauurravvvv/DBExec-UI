import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditCredentialsComponent } from './edit-credentials.component';

describe('EditCredentialsComponent', () => {
  let component: EditCredentialsComponent;
  let fixture: ComponentFixture<EditCredentialsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditCredentialsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditCredentialsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
