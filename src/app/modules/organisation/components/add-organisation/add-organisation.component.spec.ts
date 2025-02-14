import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddOrganisationComponent } from './add-organisation.component';

describe('AddOrganisationComponent', () => {
  let component: AddOrganisationComponent;
  let fixture: ComponentFixture<AddOrganisationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AddOrganisationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddOrganisationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
