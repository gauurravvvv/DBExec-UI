import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ConfigPromptComponent } from './config-prompt.component';
import { PromptService } from '../../services/prompt.service';
import { PromptConfigService } from '../../services/prompt-config.service';
import { GlobalService } from 'src/app/core/services/global.service';

describe('ConfigPromptComponent', () => {
  let component: ConfigPromptComponent;
  let fixture: ComponentFixture<ConfigPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ConfigPromptComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: PromptService,
          useValue: {
            loadOne: () => Promise.resolve(),
            current: () => null,
            getConfig: () => Promise.resolve({ data: {} }),
            configPrompt: () => Promise.resolve({ status: true }),
            cancelReads: () => {},
            saving: () => false,
          },
        },
        {
          provide: PromptConfigService,
          useValue: {
            datasourceId: { set: () => {} },
            load: () => Promise.resolve(),
            currentStep: () => 0,
            stepValid: () => [false, true, false, true],
            saving: () => false,
            canSave: () => false,
            goto: () => {},
            next: () => {},
            back: () => {},
            save: () => Promise.resolve({ status: true }),
          },
        },
        { provide: GlobalService, useValue: { handleAPIResponse: () => {}, showWarn: () => {} } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'test-id' } } },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfigPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
