/**
 * Monaco Theme Helper
 * Contains custom theme definitions for Monaco Editor with pleasant string colors
 */

declare const monaco: any;

export class MonacoThemeHelper {
  
  /**
   * Define custom Monaco themes with pleasant colors
   */
  static defineCustomThemes(): void {
    if (typeof monaco === 'undefined') return;

    // Custom light theme with pleasant string color
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'string.sql', foreground: '22863a', fontStyle: 'italic' }, // Pleasant green
        { token: 'string', foreground: '22863a', fontStyle: 'italic' },
        { token: 'keyword.sql', foreground: '005cc5', fontStyle: 'bold' },
        { token: 'number', foreground: '005cc5' },
        { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
        { token: 'operator.sql', foreground: '24292e' },
      ],
      colors: {
        'editor.foreground': '#24292e',
        'editor.background': '#ffffff',
        'editorCursor.foreground': '#044289',
        'editor.lineHighlightBackground': '#f6f8fa',
        'editorLineNumber.foreground': '#959da5',
        'editor.selectionBackground': '#c8e1ff',
        'editor.inactiveSelectionBackground': '#e8f2ff'
      }
    });

    // Custom dark theme with pleasant string color
    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'string.sql', foreground: '9ecbff', fontStyle: 'italic' }, // Pleasant light blue
        { token: 'string', foreground: '9ecbff', fontStyle: 'italic' },
        { token: 'keyword.sql', foreground: '79b8ff', fontStyle: 'bold' },
        { token: 'number', foreground: '79b8ff' },
        { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
        { token: 'operator.sql', foreground: 'e1e4e8' },
      ],
      colors: {
        'editor.foreground': '#e1e4e8',
        'editor.background': '#0d1117',
        'editorCursor.foreground': '#58a6ff',
        'editor.lineHighlightBackground': '#161b22',
        'editorLineNumber.foreground': '#6e7681',
        'editor.selectionBackground': '#1f4788',
        'editor.inactiveSelectionBackground': '#1c2938'
      }
    });
  }

  /**
   * Get theme name based on dark/light mode
   */
  static getThemeName(isDarkMode: boolean): string {
    return isDarkMode ? 'custom-dark' : 'custom-light';
  }
}
