/**
 * asset-icon.helper.ts — shared iconography + i18n labels for the four object
 * families the Asset Explorer (Track F) surfaces. Pure, dependency-free maps so
 * the explorer shell, the folder-location field, and any consuming module can
 * render a consistent glyph + type label without re-declaring them.
 *
 * `ExplorerObjectType` mirrors the folders/favourites `objectType` union
 * (dataset / analysis / dashboard / alert) so the explorer's inputs line up 1:1
 * with FoldersService / FavouritesService.
 */

/** The four asset families a folder tree / explorer can organise. */
export type ExplorerObjectType = 'dataset' | 'analysis' | 'dashboard' | 'alert';

/** PrimeIcon class per asset type — used for the list's leading type icon and
 *  any type badge. */
export const ASSET_ICON: Record<ExplorerObjectType, string> = {
  dataset: 'pi pi-database',
  analysis: 'pi pi-chart-line',
  dashboard: 'pi pi-th-large',
  alert: 'pi pi-bell',
};

/** The folder glyph (matches FoldersService.toTreeNodes' node icon). */
export const FOLDER_ICON = 'pi pi-folder';

/** i18n key per asset type — resolved by the caller via TranslateModule. */
export const ASSET_TYPE_LABEL: Record<ExplorerObjectType, string> = {
  dataset: 'EXPLORER.TYPE.DATASET',
  analysis: 'EXPLORER.TYPE.ANALYSIS',
  dashboard: 'EXPLORER.TYPE.DASHBOARD',
  alert: 'EXPLORER.TYPE.ALERT',
};
