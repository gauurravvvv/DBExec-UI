import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigureQueryBuilderComponent } from './configure-query-builder.component';

describe('ConfigureQueryBuilderComponent', () => {
  let component: ConfigureQueryBuilderComponent;
  let fixture: ComponentFixture<ConfigureQueryBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConfigureQueryBuilderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigureQueryBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
