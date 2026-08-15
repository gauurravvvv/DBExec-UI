import { BlockType } from '../services/fb-types';

const ICONS: Record<string, string> = {
  text: 'pi pi-align-left',
  string: 'pi pi-align-left',
  number: 'pi pi-hashtag',
  choice: 'pi pi-list',
  date: 'pi pi-calendar',
  boolean: 'pi pi-check-square',
  computed: 'pi pi-calculator',
  section_heading: 'pi pi-bookmark',
  static_text: 'pi pi-align-justify',
  divider: 'pi pi-minus',
  spacer: 'pi pi-arrows-v',
};

export function promptTypeIcon(type: string): string {
  return ICONS[type] ?? 'pi pi-circle';
}

const LAYOUT_TYPES = new Set<string>([
  'section_heading',
  'static_text',
  'divider',
  'spacer',
]);

export function isLayoutType(type: string): boolean {
  return LAYOUT_TYPES.has(type);
}

export const LAYOUT_TILES: {
  promptId: null;
  name: string;
  type: string;
  dataType: null;
  groupName: string;
  blockType: BlockType;
}[] = [
  {
    promptId: null,
    name: 'FORM_BUILDER.LAYOUT.HEADING',
    type: 'section_heading',
    dataType: null,
    groupName: 'FORM_BUILDER.LAYOUT.GROUP',
    blockType: 'section_heading',
  },
  {
    promptId: null,
    name: 'FORM_BUILDER.LAYOUT.TEXT',
    type: 'static_text',
    dataType: null,
    groupName: 'FORM_BUILDER.LAYOUT.GROUP',
    blockType: 'static_text',
  },
  {
    promptId: null,
    name: 'FORM_BUILDER.LAYOUT.DIVIDER',
    type: 'divider',
    dataType: null,
    groupName: 'FORM_BUILDER.LAYOUT.GROUP',
    blockType: 'divider',
  },
  {
    promptId: null,
    name: 'FORM_BUILDER.LAYOUT.SPACER',
    type: 'spacer',
    dataType: null,
    groupName: 'FORM_BUILDER.LAYOUT.GROUP',
    blockType: 'spacer',
  },
];
