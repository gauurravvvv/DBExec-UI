import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewDatasourceComponent } from './view-datasource.component';

describe('ViewDatasourceComponent', () => {
  let component: ViewDatasourceComponent;
  let fixture: ComponentFixture<ViewDatasourceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewDatasourceComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ViewDatasourceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
