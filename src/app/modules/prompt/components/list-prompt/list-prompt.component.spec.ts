import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListPromptComponent } from './list-prompt.component';

describe('ListPromptComponent', () => {
  let component: ListPromptComponent;
  let fixture: ComponentFixture<ListPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListPromptComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
