/**
 * Dummy Data Helper
 * Contains static/mock data for testing and demonstration purposes
 */

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
}

export interface SchemaGroup {
  name: string;
  tables: TableSchema[];
}

export interface DatabaseSchema {
  name: string;
  schemas: SchemaGroup[];
}

export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime?: number;
  error?: string;
}

export class DummyDataHelper {
  
  /**
   * Get dummy database schemas with multiple databases, schemas, and tables
   */
  static getDummyDatabaseSchemas(): DatabaseSchema[] {
    return [
      // Database 1: E-Commerce Application
      {
        name: 'ecommerce_db',
        schemas: [
          {
            name: 'public',
            tables: [
              {
                name: 'users',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'username', type: 'VARCHAR(50)', nullable: false },
                  { name: 'email', type: 'VARCHAR(100)', nullable: false },
                  { name: 'first_name', type: 'VARCHAR(50)', nullable: true },
                  { name: 'last_name', type: 'VARCHAR(50)', nullable: true },
                  { name: 'password_hash', type: 'VARCHAR(255)', nullable: false },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false },
                  { name: 'last_login', type: 'TIMESTAMP', nullable: true },
                  { name: 'status', type: 'ENUM', nullable: false }
                ]
              },
              {
                name: 'products',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'product_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'description', type: 'TEXT', nullable: true },
                  { name: 'price', type: 'DECIMAL(10,2)', nullable: false },
                  { name: 'stock_quantity', type: 'INT', nullable: false },
                  { name: 'category_id', type: 'INT', nullable: true, isForeignKey: true, foreignKeyTable: 'categories', foreignKeyColumn: 'id' },
                  { name: 'supplier_id', type: 'INT', nullable: true, isForeignKey: true, foreignKeyTable: 'suppliers', foreignKeyColumn: 'id' },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false },
                  { name: 'updated_at', type: 'TIMESTAMP', nullable: true }
                ]
              },
              {
                name: 'orders',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'user_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'users', foreignKeyColumn: 'id' },
                  { name: 'order_date', type: 'TIMESTAMP', nullable: false },
                  { name: 'total_amount', type: 'DECIMAL(10,2)', nullable: false },
                  { name: 'status', type: 'VARCHAR(20)', nullable: false },
                  { name: 'shipping_address', type: 'TEXT', nullable: true },
                  { name: 'payment_method', type: 'VARCHAR(50)', nullable: true },
                  { name: 'tracking_number', type: 'VARCHAR(100)', nullable: true }
                ]
              },
              {
                name: 'order_items',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'order_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'orders', foreignKeyColumn: 'id' },
                  { name: 'product_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'products', foreignKeyColumn: 'id' },
                  { name: 'quantity', type: 'INT', nullable: false },
                  { name: 'unit_price', type: 'DECIMAL(10,2)', nullable: false },
                  { name: 'subtotal', type: 'DECIMAL(10,2)', nullable: false }
                ]
              },
              {
                name: 'categories',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'category_name', type: 'VARCHAR(50)', nullable: false },
                  { name: 'description', type: 'TEXT', nullable: true },
                  { name: 'parent_id', type: 'INT', nullable: true, isForeignKey: true, foreignKeyTable: 'categories', foreignKeyColumn: 'id' },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false }
                ]
              },
              {
                name: 'suppliers',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'supplier_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'contact_name', type: 'VARCHAR(100)', nullable: true },
                  { name: 'email', type: 'VARCHAR(100)', nullable: true },
                  { name: 'phone', type: 'VARCHAR(20)', nullable: true },
                  { name: 'address', type: 'TEXT', nullable: true },
                  { name: 'country', type: 'VARCHAR(50)', nullable: true }
                ]
              },
              {
                name: 'reviews',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'product_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'products', foreignKeyColumn: 'id' },
                  { name: 'user_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'users', foreignKeyColumn: 'id' },
                  { name: 'rating', type: 'INT', nullable: false },
                  { name: 'comment', type: 'TEXT', nullable: true },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false }
                ]
              },
              {
                name: 'payments',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'order_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'orders', foreignKeyColumn: 'id' },
                  { name: 'payment_date', type: 'TIMESTAMP', nullable: false },
                  { name: 'amount', type: 'DECIMAL(10,2)', nullable: false },
                  { name: 'payment_method', type: 'VARCHAR(50)', nullable: false },
                  { name: 'transaction_id', type: 'VARCHAR(100)', nullable: true },
                  { name: 'status', type: 'VARCHAR(20)', nullable: false }
                ]
              }
            ]
          },
          {
            name: 'analytics',
            tables: [
              {
                name: 'user_activity',
                columns: [
                  { name: 'id', type: 'BIGINT', nullable: false, isPrimaryKey: true },
                  { name: 'user_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'public.users', foreignKeyColumn: 'id' },
                  { name: 'event_type', type: 'VARCHAR(50)', nullable: false },
                  { name: 'event_data', type: 'JSON', nullable: true },
                  { name: 'timestamp', type: 'TIMESTAMP', nullable: false },
                  { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
                  { name: 'user_agent', type: 'TEXT', nullable: true }
                ]
              },
              {
                name: 'sales_reports',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'report_date', type: 'DATE', nullable: false },
                  { name: 'total_sales', type: 'DECIMAL(15,2)', nullable: false },
                  { name: 'total_orders', type: 'INT', nullable: false },
                  { name: 'avg_order_value', type: 'DECIMAL(10,2)', nullable: false },
                  { name: 'generated_at', type: 'TIMESTAMP', nullable: false }
                ]
              }
            ]
          }
        ]
      },
      // Database 2: Customer Relationship Management
      {
        name: 'crm_db',
        schemas: [
          {
            name: 'sales',
            tables: [
              {
                name: 'leads',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'company_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'contact_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'email', type: 'VARCHAR(100)', nullable: false },
                  { name: 'phone', type: 'VARCHAR(20)', nullable: true },
                  { name: 'status', type: 'ENUM', nullable: false },
                  { name: 'assigned_to', type: 'INT', nullable: true },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false },
                  { name: 'last_contacted', type: 'TIMESTAMP', nullable: true }
                ]
              },
              {
                name: 'opportunities',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'lead_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'leads', foreignKeyColumn: 'id' },
                  { name: 'opportunity_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'estimated_value', type: 'DECIMAL(15,2)', nullable: false },
                  { name: 'probability', type: 'INT', nullable: false },
                  { name: 'stage', type: 'VARCHAR(50)', nullable: false },
                  { name: 'expected_close_date', type: 'DATE', nullable: true },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false }
                ]
              },
              {
                name: 'deals',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'opportunity_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'opportunities', foreignKeyColumn: 'id' },
                  { name: 'deal_value', type: 'DECIMAL(15,2)', nullable: false },
                  { name: 'closed_date', type: 'DATE', nullable: false },
                  { name: 'contract_term', type: 'INT', nullable: true },
                  { name: 'payment_terms', type: 'VARCHAR(50)', nullable: true }
                ]
              }
            ]
          },
          {
            name: 'support',
            tables: [
              {
                name: 'tickets',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'customer_id', type: 'INT', nullable: false },
                  { name: 'subject', type: 'VARCHAR(200)', nullable: false },
                  { name: 'description', type: 'TEXT', nullable: false },
                  { name: 'priority', type: 'VARCHAR(20)', nullable: false },
                  { name: 'status', type: 'VARCHAR(20)', nullable: false },
                  { name: 'assigned_agent', type: 'INT', nullable: true },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false },
                  { name: 'resolved_at', type: 'TIMESTAMP', nullable: true }
                ]
              },
              {
                name: 'ticket_comments',
                columns: [
                  { name: 'id', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'ticket_id', type: 'INT', nullable: false, isForeignKey: true, foreignKeyTable: 'tickets', foreignKeyColumn: 'id' },
                  { name: 'author_id', type: 'INT', nullable: false },
                  { name: 'comment_text', type: 'TEXT', nullable: false },
                  { name: 'is_internal', type: 'BOOLEAN', nullable: false },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false }
                ]
              }
            ]
          }
        ]
      },
      // Database 3: Analytics & Reporting
      {
        name: 'analytics_warehouse',
        schemas: [
          {
            name: 'fact_tables',
            tables: [
              {
                name: 'fact_sales',
                columns: [
                  { name: 'sale_id', type: 'BIGINT', nullable: false, isPrimaryKey: true },
                  { name: 'date_key', type: 'INT', nullable: false },
                  { name: 'product_key', type: 'INT', nullable: false },
                  { name: 'customer_key', type: 'INT', nullable: false },
                  { name: 'quantity', type: 'INT', nullable: false },
                  { name: 'unit_price', type: 'DECIMAL(10,2)', nullable: false },
                  { name: 'total_amount', type: 'DECIMAL(15,2)', nullable: false },
                  { name: 'discount_amount', type: 'DECIMAL(10,2)', nullable: true }
                ]
              },
              {
                name: 'fact_website_traffic',
                columns: [
                  { name: 'id', type: 'BIGINT', nullable: false, isPrimaryKey: true },
                  { name: 'date_key', type: 'INT', nullable: false },
                  { name: 'page_views', type: 'INT', nullable: false },
                  { name: 'unique_visitors', type: 'INT', nullable: false },
                  { name: 'bounce_rate', type: 'DECIMAL(5,2)', nullable: false },
                  { name: 'avg_session_duration', type: 'INT', nullable: false }
                ]
              }
            ]
          },
          {
            name: 'dimension_tables',
            tables: [
              {
                name: 'dim_date',
                columns: [
                  { name: 'date_key', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'full_date', type: 'DATE', nullable: false },
                  { name: 'year', type: 'INT', nullable: false },
                  { name: 'quarter', type: 'INT', nullable: false },
                  { name: 'month', type: 'INT', nullable: false },
                  { name: 'day', type: 'INT', nullable: false },
                  { name: 'day_of_week', type: 'VARCHAR(10)', nullable: false },
                  { name: 'is_weekend', type: 'BOOLEAN', nullable: false }
                ]
              },
              {
                name: 'dim_product',
                columns: [
                  { name: 'product_key', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'product_id', type: 'INT', nullable: false },
                  { name: 'product_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'category', type: 'VARCHAR(50)', nullable: false },
                  { name: 'subcategory', type: 'VARCHAR(50)', nullable: true },
                  { name: 'brand', type: 'VARCHAR(50)', nullable: true }
                ]
              },
              {
                name: 'dim_customer',
                columns: [
                  { name: 'customer_key', type: 'INT', nullable: false, isPrimaryKey: true },
                  { name: 'customer_id', type: 'INT', nullable: false },
                  { name: 'customer_name', type: 'VARCHAR(100)', nullable: false },
                  { name: 'customer_type', type: 'VARCHAR(20)', nullable: false },
                  { name: 'region', type: 'VARCHAR(50)', nullable: true },
                  { name: 'country', type: 'VARCHAR(50)', nullable: false }
                ]
              }
            ]
          }
        ]
      }
    ];
  }

  /**
   * Get dummy query results with sample user data
   */
  static getDummyQueryResults(): QueryResult {
    return {
      columns: ['id', 'username', 'email', 'first_name', 'last_name', 'created_at', 'last_login', 'status'],
      rows: [
        [1, 'john_doe', 'john.doe@example.com', 'John', 'Doe', '2024-01-15 10:30:00', '2024-12-05 08:15:22', 'active'],
        [2, 'jane_smith', 'jane.smith@example.com', 'Jane', 'Smith', '2024-02-20 14:22:00', '2024-12-04 19:45:10', 'active'],
        [3, 'bob_johnson', 'bob.j@example.com', 'Bob', 'Johnson', '2024-03-10 09:15:00', '2024-12-03 12:30:45', 'active'],
        [4, 'alice_williams', 'alice.w@example.com', 'Alice', 'Williams', '2024-04-05 16:45:00', '2024-12-05 07:20:15', 'active'],
        [5, 'charlie_brown', 'charlie.b@example.com', 'Charlie', 'Brown', '2024-05-12 11:20:00', '2024-11-28 15:10:30', 'inactive'],
        [6, 'diana_prince', 'diana.p@example.com', 'Diana', 'Prince', '2024-06-18 13:50:00', '2024-12-05 09:05:00', 'active'],
        [7, 'evan_peters', 'evan.p@example.com', 'Evan', 'Peters', '2024-07-22 08:30:00', '2024-12-01 14:25:40', 'active'],
        [8, 'fiona_green', 'fiona.g@example.com', 'Fiona', 'Green', '2024-08-08 15:10:00', '2024-11-30 10:40:20', 'suspended'],
        [9, 'george_martin', 'george.m@example.com', 'George', 'Martin', '2024-09-14 12:40:00', '2024-12-04 16:55:30', 'active'],
        [10, 'hannah_lee', 'hannah.l@example.com', 'Hannah', 'Lee', '2024-10-20 10:05:00', '2024-12-05 08:30:45', 'active'],
        [11, 'ian_wilson', 'ian.w@example.com', 'Ian', 'Wilson', '2024-11-05 09:25:00', '2024-12-02 11:15:20', 'active'],
        [12, 'julia_davis', 'julia.d@example.com', 'Julia', 'Davis', '2024-11-18 14:55:00', '2024-12-05 07:45:10', 'active']
      ],
      rowCount: 12,
      executionTime: 0.045
    };
  }
}
