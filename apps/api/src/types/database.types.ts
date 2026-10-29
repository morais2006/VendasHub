export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          order_seq: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          order_seq?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          order_seq?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          company_id: string;
          created_at: string;
          role: Database['public']['Enums']['member_role'];
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          role?: Database['public']['Enums']['member_role'];
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          role?: Database['public']['Enums']['member_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'company_members_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'company_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          company_id: string;
          id: string;
          line_total: number | null;
          order_id: string;
          product_id: string;
          product_name: string;
          product_sku: string;
          quantity: number;
          unit_cost: number;
          unit_price: number;
        };
        Insert: {
          company_id: string;
          id?: string;
          line_total?: number | null;
          order_id: string;
          product_id: string;
          product_name: string;
          product_sku: string;
          quantity: number;
          unit_cost: number;
          unit_price: number;
        };
        Update: {
          company_id?: string;
          id?: string;
          line_total?: number | null;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          product_sku?: string;
          quantity?: number;
          unit_cost?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_company_id_fkey';
            columns: ['order_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id', 'company_id'];
          },
          {
            foreignKeyName: 'order_items_product_id_company_id_fkey';
            columns: ['product_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id', 'company_id'];
          },
        ];
      };
      orders: {
        Row: {
          cancel_reason: string | null;
          canceled_at: string | null;
          canceled_by: string | null;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          customer_id: string | null;
          discount: number;
          id: string;
          idempotency_key: string;
          notes: string | null;
          number: number;
          paid_at: string | null;
          status: Database['public']['Enums']['order_status'];
          subtotal: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          cancel_reason?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          id?: string;
          idempotency_key: string;
          notes?: string | null;
          number: number;
          paid_at?: string | null;
          status?: Database['public']['Enums']['order_status'];
          subtotal: number;
          total: number;
          updated_at?: string;
        };
        Update: {
          cancel_reason?: string | null;
          canceled_at?: string | null;
          canceled_by?: string | null;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string | null;
          discount?: number;
          id?: string;
          idempotency_key?: string;
          notes?: string | null;
          number?: number;
          paid_at?: string | null;
          status?: Database['public']['Enums']['order_status'];
          subtotal?: number;
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_canceled_by_fkey';
            columns: ['canceled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_customer_id_company_id_fkey';
            columns: ['customer_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'customer_summaries';
            referencedColumns: ['id', 'company_id'];
          },
          {
            foreignKeyName: 'orders_customer_id_company_id_fkey';
            columns: ['customer_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'customers';
            referencedColumns: ['id', 'company_id'];
          },
        ];
      };
      products: {
        Row: {
          archived_at: string | null;
          company_id: string;
          cost: number;
          created_at: string;
          description: string | null;
          id: string;
          is_low_stock: boolean | null;
          min_stock: number;
          name: string;
          price: number;
          sku: string;
          stock_quantity: number;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          company_id: string;
          cost?: number;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_low_stock?: boolean | null;
          min_stock?: number;
          name: string;
          price: number;
          sku: string;
          stock_quantity?: number;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          cost?: number;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_low_stock?: boolean | null;
          min_stock?: number;
          name?: string;
          price?: number;
          sku?: string;
          stock_quantity?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          balance_after: number;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: number;
          order_id: string | null;
          product_id: string;
          quantity: number;
          reason: string | null;
          type: Database['public']['Enums']['stock_movement_type'];
        };
        Insert: {
          balance_after: number;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          order_id?: string | null;
          product_id: string;
          quantity: number;
          reason?: string | null;
          type: Database['public']['Enums']['stock_movement_type'];
        };
        Update: {
          balance_after?: number;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          order_id?: string | null;
          product_id?: string;
          quantity?: number;
          reason?: string | null;
          type?: Database['public']['Enums']['stock_movement_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_order_id_company_id_fkey';
            columns: ['order_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id', 'company_id'];
          },
          {
            foreignKeyName: 'stock_movements_product_id_company_id_fkey';
            columns: ['product_id', 'company_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id', 'company_id'];
          },
        ];
      };
    };
    Views: {
      customer_summaries: {
        Row: {
          archived_at: string | null;
          company_id: string | null;
          created_at: string | null;
          email: string | null;
          id: string | null;
          last_order_at: string | null;
          name: string | null;
          notes: string | null;
          orders_count: number | null;
          phone: string | null;
          total_spent: number | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customers_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      adjust_stock: {
        Args: {
          p_product_id: string;
          p_quantity: number;
          p_reason?: string;
          p_type: Database['public']['Enums']['stock_movement_type'];
        };
        Returns: Json;
      };
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string };
        Returns: Json;
      };
      create_company: { Args: { p_name: string }; Returns: string };
      create_order: {
        Args: {
          p_company_id: string;
          p_customer_id?: string;
          p_discount?: number;
          p_idempotency_key: string;
          p_items: Json;
          p_notes?: string;
          p_status?: Database['public']['Enums']['order_status'];
        };
        Returns: Json;
      };
      customer_insights: { Args: { p_customer_id: string }; Returns: Json };
      dashboard_summary: {
        Args: {
          p_company_id: string;
          p_from: string;
          p_to: string;
          p_tz?: string;
        };
        Returns: Json;
      };
      seed_demo_sales: {
        Args: {
          p_company_id: string;
          p_days: number;
          p_orders: number;
          p_seed?: number;
          p_tz?: string;
          p_user_ids: string[];
        };
        Returns: number;
      };
      set_order_status: {
        Args: {
          p_order_id: string;
          p_status: Database['public']['Enums']['order_status'];
        };
        Returns: Json;
      };
    };
    Enums: {
      member_role: 'owner' | 'manager' | 'seller';
      order_status: 'pending' | 'paid' | 'completed' | 'canceled';
      stock_movement_type: 'initial' | 'purchase' | 'adjustment' | 'sale' | 'cancellation';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      member_role: ['owner', 'manager', 'seller'],
      order_status: ['pending', 'paid', 'completed', 'canceled'],
      stock_movement_type: ['initial', 'purchase', 'adjustment', 'sale', 'cancellation'],
    },
  },
} as const;
