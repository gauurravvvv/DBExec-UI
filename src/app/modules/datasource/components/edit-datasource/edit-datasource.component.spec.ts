import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditDatasourceComponent } from './edit-datasource.component';

describe('EditDatasourceComponent', () => {
  let component: EditDatasourceComponent;
  let fixture: ComponentFixture<EditDatasourceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EditDatasourceComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditDatasourceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
