import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditOrganisationComponent } from './edit-organisation.component';

describe('EditOrganisationComponent', () => {
  let component: EditOrganisationComponent;
  let fixture: ComponentFixture<EditOrganisationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ EditOrganisationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditOrganisationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
