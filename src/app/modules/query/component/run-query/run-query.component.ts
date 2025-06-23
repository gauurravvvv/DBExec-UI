import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { TreeNode } from 'primeng/api';

interface QueryResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  salary: number;
  hire_date: string;
  [key: string]: any;
}

interface EditorTab {
  id: string;
  title: string;
  content: string;
  editor?: any;
}

declare var monaco: any;

@Component({
  selector: 'app-run-query',
  templateUrl: './run-query.component.html',
  styleUrls: ['./run-query.component.scss'],
})
export class RunQueryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('monacoEditor', { static: false })
  monacoEditorElement!: ElementRef;

  // Schema tree data
  schemaTree: TreeNode[] = [];

  // Editor properties
  sqlQuery: string = '';
  isExecuting: boolean = false;
  private editor: any;

  // Tab management
  tabs: EditorTab[] = [];
  activeTabId: string = '';
  tabCounter: number = 1;

  // Results properties
  queryResults: QueryResult[] = [];
  resultColumns: string[] = [];
  executionTime: number = 0;

  // Schema for autocomplete
  private schema = {
    employees: [
      'id',
      'first_name',
      'last_name',
      'email',
      'department',
      'salary',
      'hire_date',
    ],
    departments: ['id', 'name', 'manager_id', 'budget'],
    projects: [
      'id',
      'name',
      'department_id',
      'start_date',
      'end_date',
      'status',
    ],
    employee_projects: ['employee_id', 'project_id', 'role', 'hours_allocated'],
  };

  ngOnInit(): void {
    this.initializeSchemaTree();
    this.loadDummyData();
    // Create initial tab
    this.addNewTab();
  }

  ngAfterViewInit(): void {
    // Wait for Monaco to be available
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max wait

    const checkMonaco = setInterval(() => {
      attempts++;

      if (typeof monaco !== 'undefined') {
        console.log('Monaco Editor loaded, initializing...');
        clearInterval(checkMonaco);
        setTimeout(() => {
          this.initializeEditor();
        }, 100); // Small delay to ensure DOM is ready
      } else if (attempts >= maxAttempts) {
        console.error('Monaco Editor failed to load after 5 seconds');
        clearInterval(checkMonaco);
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose();
    }
  }

  private initializeEditor(): void {
    if (!monaco) {
      console.error('Monaco is not defined');
      return;
    }

    if (!this.monacoEditorElement || !this.monacoEditorElement.nativeElement) {
      console.error('Editor element not found');
      return;
    }

    console.log('Initializing Monaco Editor...');

    // Check if dark theme is active
    const isDarkTheme = document.body.classList.contains('dark-theme');

    try {
      // Create editor
      this.editor = monaco.editor.create(
        this.monacoEditorElement.nativeElement,
        {
          value: this.sqlQuery,
          language: 'sql',
          theme: isDarkTheme ? 'vs-dark' : 'vs',
          automaticLayout: true,
          minimap: {
            enabled: true,
          },
          fontSize: 14,
          wordWrap: 'off',
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 3,
          renderLineHighlight: 'all',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: true,
          formatOnPaste: true,
          formatOnType: true,
          suggestOnTriggerCharacters: true,
          acceptSuggestionOnEnter: 'on',
          tabCompletion: 'on',
          wordBasedSuggestions: true,
          suggestSelection: 'first',
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
          parameterHints: {
            enabled: true,
          },
          contextmenu: true,
          mouseWheelZoom: false, // Disable zoom with mouse wheel
          bracketPairColorization: {
            enabled: true,
          },
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalHasArrows: false,
            horizontalHasArrows: false,
            verticalScrollbarSize: 4,
            horizontalScrollbarSize: 4,
            arrowSize: 10,
          },
        }
      );

      // Add custom keybindings
      this.editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
          this.executeQuery();
        }
      );
      
      // Disable zoom shortcuts
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, () => {
        // Do nothing - disable zoom in
      });
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, () => {
        // Do nothing - disable zoom out
      });
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0, () => {
        // Do nothing - disable reset zoom
      });
      
      // Add custom context menu actions
      this.editor.addAction({
        id: 'run-selected-query',
        label: 'Run Selected Query',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 0,
        run: () => {
          const selection = this.editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = this.editor.getModel().getValueInRange(selection);
            this.sqlQuery = selectedText;
            this.executeQuery();
          }
        }
      });
      
      this.editor.addAction({
        id: 'format-sql',
        label: 'Format SQL',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1,
        run: () => {
          this.editor.getAction('editor.action.formatDocument').run();
        }
      });
      
      this.editor.addAction({
        id: 'comment-line',
        label: 'Comment/Uncomment Line',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 2,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
        run: () => {
          this.editor.getAction('editor.action.commentLine').run();
        }
      });
      
      this.editor.addAction({
        id: 'copy-as-sql',
        label: 'Copy as SQL String',
        contextMenuGroupId: '9_cutcopypaste',
        contextMenuOrder: 3,
        run: () => {
          const selection = this.editor.getSelection();
          if (selection) {
            const text = this.editor.getModel().getValueInRange(selection);
            const sqlString = text.replace(/'/g, "''").replace(/\n/g, ' ');
            navigator.clipboard.writeText(`'${sqlString}'`);
          }
        }
      });

      // Update sqlQuery on content change
      this.editor.onDidChangeModelContent(() => {
        this.sqlQuery = this.editor.getValue();

        // Update active tab content
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (activeTab) {
          activeTab.content = this.sqlQuery;
        }
      });

      // Setup autocomplete
      this.setupAutoComplete();

      // Focus the editor
      this.editor.focus();

      console.log('Monaco Editor initialized successfully');
    } catch (error) {
      console.error('Error initializing Monaco Editor:', error);
    }
  }

  private setupAutoComplete(): void {
    if (!monaco) return;

    // Register completion provider for SQL
    monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];

        // Add SQL keywords
        const keywords = [
          'SELECT',
          'FROM',
          'WHERE',
          'JOIN',
          'LEFT JOIN',
          'RIGHT JOIN',
          'INNER JOIN',
          'ON',
          'GROUP BY',
          'HAVING',
          'ORDER BY',
          'LIMIT',
          'OFFSET',
          'UNION',
          'UNION ALL',
          'INSERT INTO',
          'VALUES',
          'UPDATE',
          'SET',
          'DELETE FROM',
          'CREATE TABLE',
          'ALTER TABLE',
          'DROP TABLE',
          'CREATE INDEX',
          'DROP INDEX',
          'AS',
          'AND',
          'OR',
          'NOT',
          'IN',
          'EXISTS',
          'BETWEEN',
          'LIKE',
          'IS NULL',
          'IS NOT NULL',
          'DISTINCT',
          'COUNT',
          'SUM',
          'AVG',
          'MAX',
          'MIN',
          'CASE',
          'WHEN',
          'THEN',
          'ELSE',
          'END',
          'CAST',
          'CONVERT',
          'COALESCE',
          'NULLIF',
        ];

        keywords.forEach(keyword => {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            range: range,
            detail: 'SQL Keyword',
          });
        });

        // Add table names
        Object.keys(this.schema).forEach(table => {
          suggestions.push({
            label: table,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: table,
            range: range,
            detail: 'Table',
            documentation: `Table: ${table}`,
          });
        });

        // Add column names with table prefix
        Object.entries(this.schema).forEach(([table, columns]) => {
          columns.forEach(column => {
            suggestions.push({
              label: `${table}.${column}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: `${table}.${column}`,
              range: range,
              detail: `Column in ${table}`,
              documentation: `Column: ${column} from table ${table}`,
            });
          });
        });

        // Add common functions
        const functions = [
          'COUNT(*)',
          'SUM()',
          'AVG()',
          'MAX()',
          'MIN()',
          'CONCAT()',
          'LENGTH()',
          'SUBSTRING()',
          'UPPER()',
          'LOWER()',
          'TRIM()',
          'DATE()',
          'NOW()',
          'CURRENT_DATE',
          'CURRENT_TIME',
          'CURRENT_TIMESTAMP',
        ];

        functions.forEach(func => {
          suggestions.push({
            label: func,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: func,
            range: range,
            detail: 'SQL Function',
          });
        });

        return { suggestions: suggestions };
      },
    });
  }

  initializeSchemaTree(): void {
    this.schemaTree = [
      {
        label: 'postgres_db',
        expandedIcon: 'pi pi-database',
        collapsedIcon: 'pi pi-database',
        expanded: true,
        children: [
          {
            label: 'public',
            expandedIcon: 'pi pi-folder-open',
            collapsedIcon: 'pi pi-folder',
            expanded: true,
            children: [
              {
                label: 'employees',
                icon: 'pi pi-table',
                data: { type: 'table' },
                children: [
                  { label: 'id', icon: 'pi pi-key', data: { type: 'INTEGER' } },
                  {
                    label: 'first_name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'last_name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'email',
                    icon: 'pi pi-at',
                    data: { type: 'VARCHAR(100)' },
                  },
                  {
                    label: 'department',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'salary',
                    icon: 'pi pi-dollar',
                    data: { type: 'DECIMAL(10,2)' },
                  },
                  {
                    label: 'hire_date',
                    icon: 'pi pi-calendar',
                    data: { type: 'DATE' },
                  },
                ],
              },
              {
                label: 'departments',
                icon: 'pi pi-table',
                data: { type: 'table' },
                children: [
                  { label: 'id', icon: 'pi pi-key', data: { type: 'INTEGER' } },
                  {
                    label: 'name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'manager_id',
                    icon: 'pi pi-user',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'budget',
                    icon: 'pi pi-dollar',
                    data: { type: 'DECIMAL(12,2)' },
                  },
                ],
              },
              {
                label: 'projects',
                icon: 'pi pi-table',
                data: { type: 'table' },
                children: [
                  { label: 'id', icon: 'pi pi-key', data: { type: 'INTEGER' } },
                  {
                    label: 'name',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(100)' },
                  },
                  {
                    label: 'department_id',
                    icon: 'pi pi-link',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'start_date',
                    icon: 'pi pi-calendar',
                    data: { type: 'DATE' },
                  },
                  {
                    label: 'end_date',
                    icon: 'pi pi-calendar',
                    data: { type: 'DATE' },
                  },
                  {
                    label: 'status',
                    icon: 'pi pi-info-circle',
                    data: { type: 'VARCHAR(20)' },
                  },
                ],
              },
              {
                label: 'employee_projects',
                icon: 'pi pi-table',
                data: { type: 'table' },
                children: [
                  {
                    label: 'employee_id',
                    icon: 'pi pi-link',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'project_id',
                    icon: 'pi pi-link',
                    data: { type: 'INTEGER' },
                  },
                  {
                    label: 'role',
                    icon: 'pi pi-align-left',
                    data: { type: 'VARCHAR(50)' },
                  },
                  {
                    label: 'hours_allocated',
                    icon: 'pi pi-clock',
                    data: { type: 'INTEGER' },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  loadDummyData(): void {
    // Pre-populate with sample query
    this.sqlQuery = `-- Sample query to get employees in Engineering department
SELECT 
    e.first_name,
    e.last_name,
    e.email,
    e.department,
    e.salary,
    e.hire_date
FROM employees e
WHERE e.department = 'Engineering'
    AND e.salary > 60000
ORDER BY e.hire_date DESC
LIMIT 10;`;

    // If we have tabs, set the content to the first tab
    if (this.tabs.length > 0) {
      this.tabs[0].content = this.sqlQuery;
    }

    // If editor is already initialized, update its value
    if (this.editor) {
      this.editor.setValue(this.sqlQuery);
    }
  }

  getNodeIcon(node: TreeNode): string {
    if (node.children && node.children.length > 0) {
      return node.expanded ? 'pi pi-folder-open' : 'pi pi-folder';
    }
    return node.icon || 'pi pi-file';
  }

  executeQuery(): void {
    const query = this.sqlQuery.trim();
    if (!query) return;

    this.isExecuting = true;

    // Simulate query execution
    setTimeout(() => {
      const startTime = Date.now();

      // Generate dummy results
      this.queryResults = this.generateDummyResults();
      this.resultColumns = Object.keys(this.queryResults[0] || {});

      this.executionTime = Date.now() - startTime;
      this.isExecuting = false;
    }, 1500);
  }

  clearEditor(): void {
    this.sqlQuery = '';
    if (this.editor) {
      this.editor.setValue('');
      this.editor.focus();
    }
    this.queryResults = [];
    this.resultColumns = [];
    this.executionTime = 0;
  }

  private generateDummyResults(): QueryResult[] {
    const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
    const firstNames = [
      'John',
      'Jane',
      'Michael',
      'Sarah',
      'David',
      'Emma',
      'Robert',
      'Lisa',
      'James',
      'Mary',
    ];
    const lastNames = [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Rodriguez',
      'Martinez',
    ];

    const results: QueryResult[] = [];
    const numResults = Math.floor(Math.random() * 20) + 10;

    for (let i = 1; i <= numResults; i++) {
      const firstName =
        firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

      results.push({
        id: i,
        first_name: firstName,
        last_name: lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
        department: departments[Math.floor(Math.random() * departments.length)],
        salary: Math.floor(Math.random() * 80000) + 50000,
        hire_date: this.generateRandomDate(),
      });
    }

    return results;
  }

  private generateRandomDate(): string {
    const start = new Date(2018, 0, 1);
    const end = new Date();
    const date = new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime())
    );
    return date.toISOString().split('T')[0];
  }

  // Tab management methods
  addNewTab(): void {
    const tabId = `tab-${this.tabCounter}`;
    const newTab: EditorTab = {
      id: tabId,
      title: `Query ${this.tabCounter}`,
      content: '',
    };

    this.tabs.push(newTab);
    this.activeTabId = tabId;
    this.tabCounter++;

    // Update the current editor content
    if (this.editor) {
      this.editor.setValue('');
    }
  }

  switchTab(tabId: string): void {
    // Save current tab content
    const currentTab = this.tabs.find(t => t.id === this.activeTabId);
    if (currentTab && this.editor) {
      currentTab.content = this.editor.getValue();
    }

    // Switch to new tab
    this.activeTabId = tabId;
    const newTab = this.tabs.find(t => t.id === tabId);

    if (newTab && this.editor) {
      this.editor.setValue(newTab.content || '');
    }
  }

  closeTab(tabId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    // Don't close if it's the last tab
    if (this.tabs.length === 1) {
      return;
    }

    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index !== -1) {
      this.tabs.splice(index, 1);

      // If closing active tab, switch to another
      if (this.activeTabId === tabId) {
        const newIndex = Math.min(index, this.tabs.length - 1);
        this.activeTabId = this.tabs[newIndex].id;

        if (this.editor) {
          this.editor.setValue(this.tabs[newIndex].content || '');
        }
      }
    }
  }
}
