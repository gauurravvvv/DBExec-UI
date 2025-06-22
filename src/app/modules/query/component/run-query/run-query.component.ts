import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion, CompletionContext, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

@Component({
  selector: 'app-run-query',
  templateUrl: './run-query.component.html',
  styleUrls: ['./run-query.component.scss']
})
export class RunQueryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editor', { static: true }) editorElement!: ElementRef;
  
  editor!: EditorView;
  isLoading = false;
  queryResult: QueryResult | null = null;
  errorMessage = '';
  isDarkMode = false;
  
  // Sample database schema for autocomplete
  private schema = {
    users: ['id', 'name', 'email', 'created_at', 'updated_at', 'role', 'is_active'],
    products: ['id', 'name', 'description', 'price', 'stock', 'category_id', 'created_at'],
    orders: ['id', 'user_id', 'product_id', 'quantity', 'total_price', 'order_date', 'status'],
    categories: ['id', 'name', 'description', 'parent_id'],
    employees: ['id', 'first_name', 'last_name', 'email', 'department', 'salary', 'hire_date'],
    departments: ['id', 'name', 'manager_id', 'budget']
  };

  ngOnInit() {
    // Check theme preference
    this.isDarkMode = document.body.classList.contains('dark-theme');
    
    // Listen for theme changes
    this.observeThemeChanges();
  }

  ngAfterViewInit() {
    this.initializeEditor();
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.destroy();
    }
    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }
  }

  private themeObserver?: MutationObserver;

  private observeThemeChanges() {
    // Create a MutationObserver to watch for class changes on body
    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const newIsDarkMode = document.body.classList.contains('dark-theme');
          if (newIsDarkMode !== this.isDarkMode) {
            this.isDarkMode = newIsDarkMode;
            // Reinitialize editor with new theme
            if (this.editor) {
              const currentContent = this.editor.state.doc.toString();
              this.editor.destroy();
              this.initializeEditor();
              // Restore content
              this.editor.dispatch({
                changes: { from: 0, to: this.editor.state.doc.length, insert: currentContent }
              });
            }
          }
        }
      });
    });

    // Start observing the body element for class changes
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  private initializeEditor() {
    // Custom light theme highlighting
    const lightHighlightStyle = HighlightStyle.define([
      {tag: tags.keyword, color: "#0000ff"},
      {tag: tags.operator, color: "#666666"},
      {tag: tags.string, color: "#a31515"},
      {tag: tags.number, color: "#098658"},
      {tag: tags.comment, color: "#008000"},
      {tag: tags.function(tags.variableName), color: "#795e26"},
      {tag: tags.typeName, color: "#267f99"},
      {tag: tags.className, color: "#267f99"},
      {tag: tags.name, color: "#001080"},
      {tag: tags.propertyName, color: "#001080"}
    ]);

    const customCompletions = (context: CompletionContext) => {
      const word = context.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !context.explicit)) {
        return null;
      }

      const options: any[] = [];

      // Add table names
      Object.keys(this.schema).forEach(table => {
        options.push({
          label: table,
          type: 'table',
          detail: 'table'
        });
      });

      // Check if we're after a dot (table.column pattern)
      const dotBefore = context.matchBefore(/(\w+)\./);
      if (dotBefore) {
        const tableName = dotBefore.text.slice(0, -1);
        const schema = this.schema;
        if (schema[tableName as keyof typeof schema]) {
          // Add column names for the specific table
          schema[tableName as keyof typeof schema].forEach(column => {
            options.push({
              label: column,
              type: 'column',
              detail: `${tableName}.${column}`
            });
          });
        }
      } else {
        // Add all column names with their table prefix
        Object.entries(this.schema).forEach(([table, columns]) => {
          columns.forEach(column => {
            options.push({
              label: `${table}.${column}`,
              type: 'column',
              detail: 'column'
            });
          });
        });
      }

      // Add SQL keywords
      const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 
                       'INNER JOIN', 'ON', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 
                       'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 
                       'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'AS', 'AND', 'OR', 
                       'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'DISTINCT', 'COUNT', 
                       'SUM', 'AVG', 'MAX', 'MIN'];
      
      keywords.forEach(keyword => {
        options.push({
          label: keyword,
          type: 'keyword',
          detail: 'SQL keyword'
        });
      });

      return {
        from: word.from,
        options: options,
        validFor: /^\w*$/
      };
    };

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      syntaxHighlighting(this.isDarkMode ? defaultHighlightStyle : lightHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap
      ]),
      sql({
        dialect: PostgreSQL,
        schema: this.schema
      }),
      autocompletion({
        override: [customCompletions],
        activateOnTyping: true
      }),
      EditorView.theme({
        '&': {
          fontSize: '14px',
          border: '1px solid var(--theme-grey-3)',
          borderRadius: '4px',
          backgroundColor: this.isDarkMode ? '#1e1e1e' : '#ffffff',
          color: this.isDarkMode ? 'rgba(255,255,255,0.87)' : 'var(--black-color)'
        },
        '&.cm-focused': {
          outline: 'none',
          borderColor: 'var(--main-color)'
        },
        '.cm-content': {
          padding: '12px',
          minHeight: '300px',
          fontFamily: 'Montserrat-Regular, monospace',
          caretColor: this.isDarkMode ? '#ffffff' : '#000000'
        },
        '.cm-gutters': {
          backgroundColor: this.isDarkMode ? '#2b2b2b' : 'var(--theme-grey-6)',
          borderRight: this.isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--theme-grey-4)',
          color: this.isDarkMode ? 'rgba(255,255,255,0.6)' : 'var(--theme-grey-1)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: this.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,120,211,0.1)'
        },
        '.cm-activeLine': {
          backgroundColor: this.isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,120,211,0.05)'
        },
        '.cm-tooltip-autocomplete': {
          backgroundColor: this.isDarkMode ? '#2b2b2b' : '#ffffff',
          border: '1px solid var(--theme-grey-3)',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        },
        '.cm-tooltip-autocomplete > ul': {
          fontFamily: 'Montserrat-Regular, monospace',
          fontSize: '13px'
        },
        '.cm-tooltip-autocomplete > ul > li': {
          padding: '4px 8px',
          color: this.isDarkMode ? 'rgba(255,255,255,0.87)' : 'var(--black-color)'
        },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
          backgroundColor: 'var(--main-color)',
          color: 'white'
        },
        '.cm-selectionBackground': {
          backgroundColor: this.isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,120,211,0.3)'
        },
        '.cm-cursor': {
          borderLeftColor: this.isDarkMode ? '#ffffff' : '#000000'
        }
      })
    ];

    // Add dark theme if needed
    if (this.isDarkMode) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: `-- Welcome to DBExec SQL Editor
-- Try typing a query, for example:

SELECT u.name, u.email, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.is_active = true
GROUP BY u.id, u.name, u.email
ORDER BY order_count DESC
LIMIT 10;`,
      extensions
    });

    this.editor = new EditorView({
      state,
      parent: this.editorElement.nativeElement
    });
  }

  executeQuery() {
    const query = this.editor.state.doc.toString().trim();
    
    if (!query) {
      this.errorMessage = 'Please enter a SQL query';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.queryResult = null;

    // Simulate query execution
    setTimeout(() => {
      this.isLoading = false;
      
      // Mock successful result
      this.queryResult = {
        columns: ['id', 'name', 'email', 'order_count'],
        rows: [
          { id: 1, name: 'John Doe', email: 'john@example.com', order_count: 5 },
          { id: 2, name: 'Jane Smith', email: 'jane@example.com', order_count: 3 },
          { id: 3, name: 'Bob Johnson', email: 'bob@example.com', order_count: 7 }
        ],
        rowCount: 3,
        executionTime: 45
      };
    }, 1000);
  }

  clearEditor() {
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: '' }
    });
    this.queryResult = null;
    this.errorMessage = '';
  }

  formatQuery() {
    // Simple SQL formatter - in production, use a proper SQL formatter
    const query = this.editor.state.doc.toString();
    const formatted = query
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*\(\s*/g, ' (')
      .replace(/\s*\)\s*/g, ') ')
      .replace(/(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|ON|GROUP BY|HAVING|ORDER BY|LIMIT)/gi, '\n$1')
      .trim();
    
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: formatted }
    });
  }

  exportResults() {
    if (!this.queryResult) return;

    const csv = [
      this.queryResult.columns.join(','),
      ...this.queryResult.rows.map(row => 
        this.queryResult!.columns.map(col => row[col]).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${new Date().getTime()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  getTableNames(): string[] {
    return Object.keys(this.schema);
  }
}
