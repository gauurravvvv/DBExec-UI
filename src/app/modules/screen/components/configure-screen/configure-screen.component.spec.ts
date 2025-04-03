import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigureScreenComponent } from './configure-screen.component';

describe('ConfigureScreenComponent', () => {
  let component: ConfigureScreenComponent;
  let fixture: ComponentFixture<ConfigureScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ConfigureScreenComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfigureScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
