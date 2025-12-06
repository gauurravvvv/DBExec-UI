/**
 * Editor Customization Helper
 * Handles Monaco Editor context menu customization and other editor configurations
 */

declare const monaco: any;

export class EditorCustomizationHelper {
  /**
   * Get the SQL statement at the cursor position
   * Extracts the statement between semicolons where the cursor is located
   * 
   * @param editor Monaco editor instance
   * @returns The SQL statement at cursor position, or entire content if no semicolons found
   */
  static getCurrentStatement(editor: any): string {
    if (!editor) return '';

    const model = editor.getModel();
    const position = editor.getPosition();
    const fullText = model.getValue();
    
    // Get cursor offset in the full text
    const cursorOffset = model.getOffsetAt(position);
    
    // Check if cursor is right after a semicolon
    const charBeforeCursor = cursorOffset > 0 ? fullText.charAt(cursorOffset - 1) : '';
    const isAfterSemicolon = charBeforeCursor === ';';
    
    let startOffset: number;
    let endOffset: number;
    
    if (isAfterSemicolon) {
      // Cursor is right after semicolon - get the statement that just ended
      // Find the semicolon before the one at cursor
      startOffset = fullText.lastIndexOf(';', cursorOffset - 2);
      startOffset = startOffset === -1 ? 0 : startOffset + 1;
      endOffset = cursorOffset;
    } else {
      // Cursor is in the middle of a statement
      // Find the start of current statement (last semicolon before cursor or start of text)
      startOffset = fullText.lastIndexOf(';', cursorOffset - 1);
      startOffset = startOffset === -1 ? 0 : startOffset + 1;
      
      // Find the end of current statement (next semicolon after cursor or end of text)
      endOffset = fullText.indexOf(';', cursorOffset);
      endOffset = endOffset === -1 ? fullText.length : endOffset + 1;
    }
    
    // Extract the statement
    const statement = fullText.substring(startOffset, endOffset).trim();
    
    // If no statement found or empty, return the entire text
    return statement || fullText.trim();
  }

  /**
   * Customize Monaco Editor context menu for SQL editing
   * Adds useful SQL-specific actions
   * 
   * @param editor Monaco editor instance
   * @param executeCompleteQueryCallback Callback function to execute the complete query
   * @param executeSelectedQueryCallback Callback function to execute selected query
   */
  static customizeEditorContextMenu(
    editor: any,
    executeCompleteQueryCallback: () => void,
    executeSelectedQueryCallback: (selectedText: string) => void
  ): void {
    if (!editor) return;

    // Run SQL (Smart: runs selected if text is selected, otherwise runs current statement)
    editor.addAction({
      id: 'sql.executeQuery',
      label: 'Run SQL',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: (ed: any) => {
        const selection = ed.getSelection();
        const hasSelection = selection && !selection.isEmpty();
        
        if (hasSelection) {
          // Execute selected text
          const selectedText = ed.getModel().getValueInRange(selection);
          if (selectedText.trim()) {
            executeSelectedQueryCallback(selectedText);
            return;
          }
        }
        
        // No selection, execute current statement at cursor
        const currentStatement = EditorCustomizationHelper.getCurrentStatement(ed);
        executeSelectedQueryCallback(currentStatement);
      }
    });

    // Run Complete SQL (always runs full query)
    editor.addAction({
      id: 'sql.executeCompleteQuery',
      label: 'Run Complete SQL',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: (ed: any) => {
        const completeQuery = ed.getValue();
        executeCompleteQueryCallback();
      }
    });

    // Run Selected SQL (only shows when text is selected)
    editor.addAction({
      id: 'sql.executeSelectedQuery',
      label: 'Run Selected SQL',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 3,
      precondition: 'editorHasSelection',
      run: (ed: any) => {
        const selection = ed.getSelection();
        if (selection) {
          const selectedText = ed.getModel().getValueInRange(selection);
          if (selectedText.trim()) {
            executeSelectedQueryCallback(selectedText);
          }
        }
      }
    });
  }

  /**
   * Setup keyboard event handlers for Monaco Editor
   * Handles arrow key navigation when suggestion widget is visible
   * 
   * @param editor Monaco editor instance
   */
  static setupKeyboardHandlers(editor: any): void {
    if (!editor) return;

    // Prevent arrow keys from moving cursor when suggestions are visible
    editor.onKeyDown((e: any) => {
      const suggestWidget = (editor as any)._contentWidgets['editor.widget.suggestWidget'];
      const isSuggestWidgetVisible = suggestWidget && suggestWidget.widget && suggestWidget.widget._isVisible;
      
      // If suggestions are visible and arrow keys are pressed, let Monaco handle it
      if (isSuggestWidgetVisible && (e.keyCode === monaco.KeyCode.UpArrow || e.keyCode === monaco.KeyCode.DownArrow)) {
        // Monaco will handle navigation, do nothing
        return;
      }
    });
  }

  /**
   * Setup content change listener for Monaco Editor
   * Updates the tab query when editor content changes
   * 
   * @param editor Monaco editor instance
   * @param onChangeCallback Callback function when content changes
   */
  static setupContentChangeListener(editor: any, onChangeCallback: (value: string) => void): void {
    if (!editor) return;

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      onChangeCallback(value);
    });
  }

  /**
   * Focus the editor after a short delay
   * 
   * @param editor Monaco editor instance
   * @param delay Delay in milliseconds (default: 100)
   */
  static focusEditor(editor: any, delay: number = 100): void {
    if (!editor) return;

    setTimeout(() => {
      if (editor) {
        editor.focus();
      }
    }, delay);
  }

  /**
   * Clear the container completely before creating new editor
   * Removes all child nodes to prevent Monaco context conflicts
   * 
   * @param container DOM container element
   */
  static clearEditorContainer(container: HTMLElement): void {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  /**
   * Dispose an editor instance safely
   * 
   * @param editor Monaco editor instance
   */
  static disposeEditor(editor: any): void {
    if (editor) {
      editor.dispose();
    }
  }
}
