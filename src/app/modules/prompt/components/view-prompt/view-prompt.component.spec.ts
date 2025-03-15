import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewPromptComponent } from './view-prompt.component';

describe('ViewPromptComponent', () => {
  let component: ViewPromptComponent;
  let fixture: ComponentFixture<ViewPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ViewPromptComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
