import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListCredentialsComponent } from './list-credentials.component';

describe('ListCredentialsComponent', () => {
  let component: ListCredentialsComponent;
  let fixture: ComponentFixture<ListCredentialsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListCredentialsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListCredentialsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
