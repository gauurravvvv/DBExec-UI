import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListDatasourceComponent } from './list-datasource.component';

describe('ListDatasourceComponent', () => {
  let component: ListDatasourceComponent;
  let fixture: ComponentFixture<ListDatasourceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ListDatasourceComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ListDatasourceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
