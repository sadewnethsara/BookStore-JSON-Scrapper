/** Replace with `supabase gen types` output when you wire real tables. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      books: {
        Row: {
          id: string;
          title: string;
          isbn: string | null;
          subtitle: string | null;
          description: string | null;
          list_price: string;
          cost_price: string | null;
          author_id: string | null;
          publisher_id: string | null;
          published_on: string | null;
          product_kind: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
          source_sku: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          isbn?: string | null;
          subtitle?: string | null;
          description?: string | null;
          list_price?: string;
          cost_price?: string | null;
          author_id?: string | null;
          publisher_id?: string | null;
          published_on?: string | null;
          product_kind?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          source_sku?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          isbn?: string | null;
          subtitle?: string | null;
          description?: string | null;
          list_price?: string;
          cost_price?: string | null;
          author_id?: string | null;
          publisher_id?: string | null;
          published_on?: string | null;
          product_kind?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          source_sku?: string | null;
        };
        Relationships: [];
      };
      book_images: {
        Row: {
          id: string;
          book_id: string;
          storage_path: string | null;
          url: string | null;
          sort_order: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          book_id: string;
          storage_path?: string | null;
          url?: string | null;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          book_id?: string;
          storage_path?: string | null;
          url?: string | null;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      catalog_sources: {
        Row: {
          id: string;
          slug: string;
          label: string;
          source_kind: string;
          fetch_url: string | null;
          fetch_headers: Json;
          enabled: boolean;
          alert_min_abs_diff: number | null;
          alert_min_pct_diff: string | null;
          last_row_count: number | null;
          last_run_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          source_kind: string;
          fetch_url?: string | null;
          fetch_headers?: Json;
          enabled?: boolean;
          alert_min_abs_diff?: number | null;
          alert_min_pct_diff?: string | null;
          last_row_count?: number | null;
          last_run_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          label?: string;
          source_kind?: string;
          fetch_url?: string | null;
          fetch_headers?: Json;
          enabled?: boolean;
          alert_min_abs_diff?: number | null;
          alert_min_pct_diff?: string | null;
          last_row_count?: number | null;
          last_run_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_scrape_runs: {
        Row: {
          id: string;
          source_id: string;
          status: string;
          row_count: number;
          previous_row_count: number | null;
          diff_abs: number | null;
          diff_pct: string | null;
          alert_triggered: boolean;
          alert_reason: string | null;
          error_message: string | null;
          started_at: string;
          finished_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          status: string;
          row_count?: number;
          previous_row_count?: number | null;
          diff_abs?: number | null;
          diff_pct?: string | null;
          alert_triggered?: boolean;
          alert_reason?: string | null;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          status?: string;
          row_count?: number;
          previous_row_count?: number | null;
          diff_abs?: number | null;
          diff_pct?: string | null;
          alert_triggered?: boolean;
          alert_reason?: string | null;
          error_message?: string | null;
          started_at?: string;
          finished_at?: string;
        };
        Relationships: [];
      };
      catalog_diff_alerts: {
        Row: {
          id: string;
          source_id: string;
          run_id: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          run_id: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          run_id?: string;
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      catalog_ingest_jobs: {
        Row: {
          id: string;
          catalog_source: string;
          label: string | null;
          status: string;
          config: Json;
          rows_total_est: number | null;
          rows_scraped: number;
          parts_total: number;
          error_message: string | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          finished_at: string | null;
          last_heartbeat_at: string | null;
        };
        Insert: {
          id?: string;
          catalog_source: string;
          label?: string | null;
          status?: string;
          config?: Json;
          rows_total_est?: number | null;
          rows_scraped?: number;
          parts_total?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          last_heartbeat_at?: string | null;
        };
        Update: {
          id?: string;
          catalog_source?: string;
          label?: string | null;
          status?: string;
          config?: Json;
          rows_total_est?: number | null;
          rows_scraped?: number;
          parts_total?: number;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          last_heartbeat_at?: string | null;
        };
        Relationships: [];
      };
      catalog_ingest_job_parts: {
        Row: {
          id: string;
          job_id: string;
          part_index: number;
          status: string;
          row_count: number;
          payload_json: Json | null;
          storage_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          part_index: number;
          status?: string;
          row_count?: number;
          payload_json?: Json | null;
          storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          part_index?: number;
          status?: string;
          row_count?: number;
          payload_json?: Json | null;
          storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      catalog_data_quality_stats: {
        Args: Record<string, never>;
        Returns: Json;
      };
      promote_staging_to_catalog: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
  staging: {
    Tables: {
      books: {
        Row: {
          id: string;
          catalog_source: string;
          source_sku: string;
          payload: Json;
          curated_at: string;
        };
        Insert: {
          id?: string;
          catalog_source?: string;
          source_sku: string;
          payload: Json;
          curated_at?: string;
        };
        Update: {
          id?: string;
          catalog_source?: string;
          source_sku?: string;
          payload?: Json;
          curated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
