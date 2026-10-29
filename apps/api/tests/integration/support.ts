import { randomUUID } from 'node:crypto';
import { loadConfig, loadRootEnvFile, type AppConfig } from '../../src/config/env.js';
import {
  createAdminClient,
  createAuthClient,
  createUserClient,
  type Db,
} from '../../src/lib/supabase.js';

loadRootEnvFile();

let cached: AppConfig | null = null;
let reason = '';
try {
  cached = loadConfig();
  if (!cached.supabaseSecretKey) reason = 'SUPABASE_SECRET_KEY ausente no .env';
} catch (error) {
  reason = (error as Error).message.split('\n')[0] ?? 'configuração inválida';
}

/** Os testes de integração só rodam com um Supabase real configurado. */
export const integrationEnabled = Boolean(cached?.supabaseSecretKey);
export const skipReason = reason;

export function env(): AppConfig {
  if (!cached) throw new Error(reason);
  return cached;
}

export function admin(): Db {
  return createAdminClient(env().supabaseUrl, env().supabaseSecretKey!);
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
  db: Db;
}

export interface TestTenant {
  companyId: string;
  owner: TestUser;
  seller: TestUser;
  products: Record<string, { id: string; price: number }>;
  customerId: string;
}

const created = { users: [] as string[], companies: [] as string[] };
const PASSWORD = `Teste-${randomUUID()}`;

export async function createUser(label: string): Promise<TestUser> {
  const email = `it-${label}-${randomUUID().slice(0, 8)}@vendahub-test.example`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `Teste ${label}` },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  created.users.push(data.user.id);

  const auth = createAuthClient(env().supabaseUrl, env().supabasePublishableKey);
  const session = await auth.auth.signInWithPassword({ email, password: PASSWORD });
  if (session.error || !session.data.session) throw new Error(`signIn: ${session.error?.message}`);
  const token = session.data.session.access_token;
  return {
    id: data.user.id,
    email,
    token,
    db: createUserClient(env().supabaseUrl, env().supabasePublishableKey, token),
  };
}

/** Empresa isolada para um teste: dono, vendedor, 3 produtos e 1 cliente. */
export async function createTenant(label: string): Promise<TestTenant> {
  const db = admin();
  const owner = await createUser(`${label}-owner`);
  const seller = await createUser(`${label}-seller`);

  const company = await db
    .from('companies')
    .insert({ name: `Empresa teste ${label}` })
    .select('id')
    .single();
  if (company.error) throw new Error(company.error.message);
  const companyId = company.data.id;
  created.companies.push(companyId);

  const members = await db.from('company_members').insert([
    { company_id: companyId, user_id: owner.id, role: 'owner' },
    { company_id: companyId, user_id: seller.id, role: 'seller' },
  ]);
  if (members.error) throw new Error(members.error.message);

  const products = await db
    .from('products')
    .insert([
      {
        company_id: companyId,
        sku: 'A-1',
        name: 'Produto A',
        price: 10.5,
        cost: 4,
        stock_quantity: 10,
        min_stock: 2,
      },
      {
        company_id: companyId,
        sku: 'B-1',
        name: 'Produto B',
        price: 7.25,
        cost: 3,
        stock_quantity: 5,
        min_stock: 1,
      },
      {
        company_id: companyId,
        sku: 'C-1',
        name: 'Produto C',
        price: 99.9,
        cost: 50,
        stock_quantity: 1,
        min_stock: 0,
      },
    ])
    .select('id, sku, price');
  if (products.error) throw new Error(products.error.message);

  const customer = await db
    .from('customers')
    .insert({ company_id: companyId, name: 'Cliente Teste' })
    .select('id')
    .single();
  if (customer.error) throw new Error(customer.error.message);

  return {
    companyId,
    owner,
    seller,
    customerId: customer.data.id,
    products: Object.fromEntries(
      products.data.map((p) => [p.sku, { id: p.id, price: Number(p.price) }]),
    ),
  };
}

export async function stockOf(productId: string): Promise<number> {
  const { data, error } = await admin()
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single();
  if (error) throw new Error(error.message);
  return data.stock_quantity;
}

/** Remove tudo o que os testes criaram. */
export async function cleanup(): Promise<void> {
  const db = admin();
  if (created.companies.length) {
    const { error } = await db.from('companies').delete().in('id', created.companies);
    if (error) throw new Error(`Limpeza das empresas de teste falhou: ${error.message}`);
  }
  for (const id of created.users) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`Limpeza dos usuários de teste falhou: ${error.message}`);
  }
  created.companies.length = 0;
  created.users.length = 0;
}
