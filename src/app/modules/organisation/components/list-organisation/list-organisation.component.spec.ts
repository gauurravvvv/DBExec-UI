import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListOrganisationComponent } from './list-organisation.component';

describe('ListOrganisationComponent', () => {
  let component: ListOrganisationComponent;
  let fixture: ComponentFixture<ListOrganisationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListOrganisationComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListOrganisationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
