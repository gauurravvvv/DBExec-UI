import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { DEFAULT_PAGE } from 'src/app/constants';
import { USER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { UserService } from '../../services/user.service';

interface ValidRow {
  row: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  groupIds: string[];
  groupNames: string[];
  locale: string;
}

interface InvalidRow {
  row: number;
  email?: string;
  reason: string;
}

interface ValidateResponse {
  status: boolean;
  code: number;
  message: string;
  data: {
    summary: { total: number; valid: number; invalid: number };
    valid: ValidRow[];
    invalid: InvalidRow[];
  };
}

interface CommitResponse {
  status: boolean;
  code: number;
  message: string;
  data: {
    summary: { requested: number; successful: number; failed: number };
    successful: { row: number; email: string; username: string; userId: string }[];
    failed: { row: number; email: string; reason: string }[];
  };
}

type Stage = 'idle' | 'validating' | 'confirming' | 'committing' | 'done';

@Component({
  selector: 'app-bulk-add-user',
  templateUrl: './bulk-add-user.component.html',
  styleUrls: ['./bulk-add-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkAddUserComponent implements OnInit {
  /** Native <input type="file"> ref so we can clear it on org change. */
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  stage: Stage = 'idle';
  selectedOrgId: string | null = null;
  pickedFile: File | null = null;
  fileError = '';
  // True once the user has clicked Validate at least once — drives the
  // inline "Please select…" errors on the org dropdown and file picker so
  // they only appear AFTER the user attempts to submit (matches add-user
  // pattern where errors show after `.touched`).
  validationAttempted = false;

  /** Role-derived: System Admin sees the org dropdown; org-admin/org-user
   *  have their org locked from the JWT token (same logic as add-user). */
  showOrgDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SYSTEM_ADMIN;

  // Org dropdown server-mode plumbing (sys-admin only).
  preloadedOrgs: any[] | null = null;
  preloadedOrgsTotal: number | null = null;

  validateRes: ValidateResponse['data'] | null = null;
  commitRes: CommitResponse['data'] | null = null;

  constructor(
    private userService: UserService,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit(): void {
    if (this.showOrgDropdown) {
      // Sys-admin starts without an org selected; the dropdown panel will
      // fetch page 1 on first open. We also preload so the dropdown can
      // render its initial list without a roundtrip.
      this.preloadInitialOrg();
    } else {
      // Org-admin / org-user — their org comes from the JWT and is locked.
      this.selectedOrgId =
        this.globalService.getTokenDetails('organisationId') ?? null;
    }
  }

  /**
   * Fetcher for the server-mode org dropdown. Same shape as elsewhere — the
   * dropdown calls this on open, on filter, and on near-end scroll.
   */
  loadOrgsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any =
        await this.organisationService.listOrganisation(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.orgs ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Pre-loads page 1 of orgs so the dropdown panel and the pre-selected
   * label render without an extra round-trip on first open.
   */
  private async preloadInitialOrg(): Promise<void> {
    try {
      const res: any = await this.organisationService.listOrganisation({
        page: DEFAULT_PAGE,
        limit: 10,
      });
      if (this.globalService.handleSuccessService(res, false)) {
        const orgs = res?.data?.orgs ?? [];
        this.preloadedOrgs = orgs;
        this.preloadedOrgsTotal = res?.data?.count ?? orgs.length;
        this.cdr.markForCheck();
      }
    } catch {
      // Silent — the dropdown will fetch its own page on open as fallback.
    }
  }

  /**
   * Org changed in the dropdown. Reset every downstream piece of state —
   * file, errors, validation result — because emails/usernames/group names
   * mean different things in a different org. The user must re-pick the
   * file and re-validate.
   */
  onOrgChange(orgId: any): void {
    this.selectedOrgId = orgId ?? null;
    this.resetFileState();
  }

  private resetFileState(): void {
    this.pickedFile = null;
    this.fileError = '';
    this.validateRes = null;
    this.commitRes = null;
    this.stage = 'idle';
    this.validationAttempted = false;
    if (this.fileInput?.nativeElement) {
      // Reset the input so picking the same filename again still fires
      // (change) — browsers de-duplicate identical-name selections otherwise.
      this.fileInput.nativeElement.value = '';
    }
    this.cdr.markForCheck();
  }

  /**
   * Native file-input change handler. We accept .csv only, cap at 5MB on the
   * client too so the user doesn't waste an upload roundtrip on a giant file.
   */
  onFilePicked(event: Event): void {
    this.fileError = '';
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      this.pickedFile = null;
      return;
    }
    if (!/\.csv$/i.test(file.name)) {
      this.pickedFile = null;
      this.fileError = 'Please pick a .csv file';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.pickedFile = null;
      this.fileError = 'File is too large (max 5 MB)';
      return;
    }
    this.pickedFile = file;
  }

  /**
   * Stage 1 → 2. Upload the CSV for validation. If everything is valid, skip
   * the confirmation popup and auto-commit. Otherwise show the popup with the
   * invalid breakdown and let the admin decide.
   */
  async onValidateAndUpload(): Promise<void> {
    // Guard against double-fire while a previous click is still in flight.
    if (this.stage === 'validating' || this.stage === 'committing') return;
    this.validationAttempted = true;
    if (!this.pickedFile || !this.selectedOrgId) {
      this.cdr.markForCheck();
      return;
    }
    this.stage = 'validating';
    this.cdr.markForCheck();
    try {
      const res: ValidateResponse = await this.userService.bulkAddValidate(
        this.pickedFile,
        this.selectedOrgId,
      );
      if (!this.globalService.handleSuccessService(res, false)) {
        this.stage = 'idle';
        this.cdr.markForCheck();
        return;
      }
      this.validateRes = res.data;

      if (res.data.summary.invalid === 0 && res.data.summary.valid > 0) {
        // All valid → skip the confirmation popup, fire commit immediately.
        await this.runCommit();
      } else if (res.data.summary.valid === 0) {
        // Nothing valid — show the popup so the admin sees why every row
        // failed; Proceed is disabled.
        this.stage = 'confirming';
      } else {
        this.stage = 'confirming';
      }
    } catch (err) {
      this.stage = 'idle';
    }
    this.cdr.markForCheck();
  }

  /**
   * Stage 3. Fired by Proceed in the confirmation popup. Sends the valid[]
   * payload verbatim to /bulk-add/commit.
   */
  async onConfirmProceed(): Promise<void> {
    await this.runCommit();
  }

  private async runCommit(): Promise<void> {
    // Guard against double-fire if the user clicks Proceed twice quickly
    // before the stage flips.
    if (this.stage === 'committing' || this.stage === 'validating') return;
    if (!this.validateRes || this.validateRes.valid.length === 0) return;
    if (!this.selectedOrgId) return;
    this.stage = 'committing';
    this.cdr.markForCheck();
    try {
      const res: CommitResponse = await this.userService.bulkAddCommit(
        this.selectedOrgId,
        this.validateRes.valid,
      );
      if (this.globalService.handleSuccessService(res, false)) {
        this.commitRes = res.data;
        this.stage = 'done';
      } else {
        this.stage = 'confirming';
      }
    } catch {
      this.stage = 'confirming';
    }
    this.cdr.markForCheck();
  }

  /** Back / cancel — navigate to the user list. */
  onCancel(): void {
    this.router.navigate([USER.LIST]);
  }

  /** Same as cancel for now — distinct method so the UI can branch later
   *  (e.g. confirm-before-leave if work is unsaved). */
  onClose(): void {
    this.router.navigate([USER.LIST]);
  }

  /** Done stage → "Bulk add more" — reset everything except the org selection
   *  so the admin can immediately upload another file in the same scope. */
  onResetForAnother(): void {
    this.resetFileState();
  }

  /**
   * Download a sample CSV with the expected header row so the admin has a
   * starting template — generated client-side, no extra asset needed.
   */
  downloadTemplate(): void {
    const csv =
      'email,username,firstName,lastName,groupNames,locale\n' +
      'jane.doe@example.com,jane.doe,Jane,Doe,Marketing|Analytics,en\n' +
      'john.smith@example.com,j.smith,John,Smith,Engineering,\n';
    this.downloadCsvBlob(csv, 'bulk-users-template.csv');
  }

  /**
   * Download a CSV that contains the invalid rows from validation, so the
   * admin can fix them offline and re-upload only the bad rows.
   */
  downloadInvalid(): void {
    if (!this.validateRes?.invalid?.length) return;
    const header = 'row,email,reason\n';
    const rows = this.validateRes.invalid
      .map(r => `${r.row},${this.csvEscape(r.email ?? '')},${this.csvEscape(r.reason)}`)
      .join('\n');
    this.downloadCsvBlob(header + rows + '\n', 'bulk-users-invalid.csv');
  }

  private csvEscape(s: string): string {
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  private downloadCsvBlob(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
