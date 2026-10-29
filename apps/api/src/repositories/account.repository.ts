import { throwIfDbError } from '../lib/errors.js';
import type { Db } from '../lib/supabase.js';
import type { MemberRole } from '../plugins/request-context.js';

export interface Membership {
  company_id: string;
  company_name: string;
  role: MemberRole;
}

export class AccountRepository {
  constructor(private readonly db: Db) {}

  async role(userId: string, companyId: string): Promise<MemberRole | null> {
    const { data, error } = await this.db
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle();
    throwIfDbError(error);
    return data?.role ?? null;
  }

  async profile(userId: string) {
    const { data, error } = await this.db
      .from('profiles')
      .select('id, full_name')
      .eq('id', userId)
      .maybeSingle();
    throwIfDbError(error);
    return data;
  }

  async memberships(userId: string): Promise<Membership[]> {
    const { data, error } = await this.db
      .from('company_members')
      .select('company_id, role, company:companies(name)')
      .eq('user_id', userId)
      .order('created_at');
    throwIfDbError(error);
    return (data ?? []).map((row) => ({
      company_id: row.company_id,
      company_name: (row.company as { name: string } | null)?.name ?? '',
      role: row.role,
    }));
  }

  async createCompany(name: string): Promise<string> {
    const { data, error } = await this.db.rpc('create_company', { p_name: name });
    throwIfDbError(error);
    return data as string;
  }

  async updateProfileName(userId: string, fullName: string): Promise<void> {
    const { error } = await this.db
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', userId);
    throwIfDbError(error);
  }
}
