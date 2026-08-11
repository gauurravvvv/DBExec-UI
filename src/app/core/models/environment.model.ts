export interface IEnvironment {
  production: boolean;
  defaultReportUrl?: string;
  defaultBaseUrl?: string;
  assetsUrl?: string;
  apiServer?: string;
  /**
   * The DBExec-AI BFF base URL, incl. its base path (e.g.
   * http://localhost:3001/ai/v1). The AI WebSocket + AI REST (confirm, config,
   * conversations) go here; everything else uses `apiServer`. When unset, the
   * AI features fall back to `apiServer` (the embedded engine on the main API).
   */
  aiServer?: string;
  appURL?: string;
  appVersion: string;
}
