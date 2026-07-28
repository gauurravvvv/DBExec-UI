/**
 * Formula Editor Configuration
 * Contains Monaco Editor settings for custom formula language
 */
import { formulaEditorOptions } from '../../../shared/editor/monaco-options';

/**
 * Monaco Editor configuration options for formula editor
 */
/**
 * Monaco options for the formula editor.
 *
 * Re-exported from the app-wide definition so there is ONE options object. The
 * body moved to `shared/editor/monaco-options.ts`.
 */
export const FORMULA_EDITOR_OPTIONS = formulaEditorOptions();

/**
 * Editor loading configuration
 */
export const FORMULA_EDITOR_LOADING_CONFIG = {
  MAX_ATTEMPTS: 100,
  CHECK_INTERVAL_MS: 50,
  TIMEOUT_MS: 10000,
};
