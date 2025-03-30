import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigPromptComponent } from './config-prompt.component';

describe('ConfigPromptComponent', () => {
  let component: ConfigPromptComponent;
  let fixture: ComponentFixture<ConfigPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ConfigPromptComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfigPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
