import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewCredentialsComponent } from './view-credentials.component';

describe('ViewCredentialsComponent', () => {
  let component: ViewCredentialsComponent;
  let fixture: ComponentFixture<ViewCredentialsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewCredentialsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewCredentialsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
