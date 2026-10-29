/**
 * Cria (ou recria) os dados FICTÍCIOS de demonstração:
 *   - Empório Bela Vista: 3 usuários (dono, gerente, vendedor), 20 produtos,
 *     18 clientes e ~140 pedidos nos últimos 90 dias;
 *   - Papelaria Ponto Final: 1 usuário, para demonstrar o isolamento entre empresas.
 *
 * Nomes, e-mails e telefones são inventados (domínio reservado .example).
 * Os pedidos passam pelas mesmas funções transacionais do sistema.
 *
 * Uso: npm run db:seed   (requer SUPABASE_SECRET_KEY no .env)
 */
import { loadConfig, loadRootEnvFile } from '../src/config/env.js';
import { createAdminClient, type Db } from '../src/lib/supabase.js';

loadRootEnvFile();
const config = loadConfig();
if (!config.supabaseSecretKey) {
  console.error('Defina SUPABASE_SECRET_KEY no .env para rodar o seed.');
  process.exit(1);
}
const db: Db = createAdminClient(config.supabaseUrl, config.supabaseSecretKey);
const password = process.env.SEED_DEMO_PASSWORD || 'VendaHub@Demo2026';
const HISTORY_DAYS = 90;

type Role = 'owner' | 'manager' | 'seller';
interface DemoUser {
  email: string;
  name: string;
  role: Role;
}
interface DemoProduct {
  sku: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  min: number;
}
interface DemoCompany {
  name: string;
  users: DemoUser[];
  products: DemoProduct[];
  customers: Array<{ name: string; email: string | null; phone: string | null }>;
  orders: number;
  seed: number;
}

const emporio: DemoCompany = {
  name: 'Empório Bela Vista',
  orders: 140,
  seed: 0.42,
  users: [
    { email: 'dono@emporio.example', name: 'Marina Albuquerque', role: 'owner' },
    { email: 'gerente@emporio.example', name: 'Lúcia Martins', role: 'manager' },
    { email: 'vendas@emporio.example', name: 'Caio Ribeiro', role: 'seller' },
  ],
  products: [
    {
      sku: 'CAF-250',
      name: 'Café especial torra média 250 g',
      description: 'Grãos 100% arábica do Sul de Minas.',
      price: 32.9,
      cost: 18.5,
      stock: 60,
      min: 12,
    },
    {
      sku: 'AZE-500',
      name: 'Azeite extravirgem 500 ml',
      description: 'Acidez máxima de 0,3%.',
      price: 54.9,
      cost: 33.0,
      stock: 40,
      min: 10,
    },
    {
      sku: 'QJO-CAN',
      name: 'Queijo canastra meia-cura 500 g',
      description: 'Maturação mínima de 22 dias.',
      price: 68.0,
      cost: 42.0,
      stock: 25,
      min: 8,
    },
    {
      sku: 'DDL-400',
      name: 'Doce de leite artesanal 400 g',
      description: 'Receita tradicional em tacho de cobre.',
      price: 24.9,
      cost: 11.2,
      stock: 45,
      min: 10,
    },
    {
      sku: 'MEL-300',
      name: 'Mel silvestre 300 g',
      description: 'Mel puro de florada silvestre.',
      price: 29.9,
      cost: 15.0,
      stock: 35,
      min: 8,
    },
    {
      sku: 'GRA-500',
      name: 'Granola artesanal 500 g',
      description: 'Com castanhas e frutas desidratadas.',
      price: 27.5,
      cost: 13.8,
      stock: 50,
      min: 10,
    },
    {
      sku: 'VIN-MAL',
      name: 'Vinho tinto Malbec 750 ml',
      description: 'Mendoza, safra recente.',
      price: 89.9,
      cost: 52.0,
      stock: 30,
      min: 6,
    },
    {
      sku: 'CER-IPA',
      name: 'Cerveja artesanal IPA 500 ml',
      description: 'Amargor intenso, notas cítricas.',
      price: 21.9,
      cost: 11.5,
      stock: 80,
      min: 24,
    },
    {
      sku: 'CHO-70',
      name: 'Chocolate 70% cacau 100 g',
      description: 'Cacau fino do sul da Bahia.',
      price: 18.9,
      cost: 8.9,
      stock: 70,
      min: 15,
    },
    {
      sku: 'BIS-200',
      name: 'Biscoito amanteigado 200 g',
      description: 'Feito com manteiga de primeira.',
      price: 16.5,
      cost: 7.2,
      stock: 55,
      min: 12,
    },
    {
      sku: 'GEL-FRV',
      name: 'Geleia de frutas vermelhas 300 g',
      description: 'Sem conservantes.',
      price: 26.9,
      cost: 12.4,
      stock: 28,
      min: 8,
    },
    {
      sku: 'MAS-500',
      name: 'Massa grano duro 500 g',
      description: 'Trefilada em bronze.',
      price: 19.9,
      cost: 9.5,
      stock: 65,
      min: 15,
    },
    {
      sku: 'MOL-TOM',
      name: 'Molho de tomate artesanal 500 g',
      description: 'Tomates italianos e manjericão.',
      price: 22.9,
      cost: 10.1,
      stock: 42,
      min: 10,
    },
    {
      sku: 'CAS-PAR',
      name: 'Castanha-do-pará 200 g',
      description: 'Selecionada e embalada a vácuo.',
      price: 34.9,
      cost: 21.0,
      stock: 22,
      min: 8,
    },
    {
      sku: 'CHA-VER',
      name: 'Chá verde 20 sachês',
      description: 'Folhas inteiras em sachê piramidal.',
      price: 23.5,
      cost: 10.8,
      stock: 30,
      min: 8,
    },
    {
      sku: 'KOM-330',
      name: 'Kombucha gengibre 330 ml',
      description: 'Fermentação natural.',
      price: 15.9,
      cost: 7.0,
      stock: 9,
      min: 12,
    },
    {
      sku: 'SAL-ROS',
      name: 'Sal rosa do Himalaia 500 g',
      description: 'Moagem grossa.',
      price: 17.9,
      cost: 6.5,
      stock: 38,
      min: 8,
    },
    {
      sku: 'PAO-FER',
      name: 'Pão de fermentação natural',
      description: 'Assado no dia, 800 g.',
      price: 28.0,
      cost: 9.8,
      stock: 6,
      min: 10,
    },
    {
      sku: 'KIT-FRI',
      name: 'Kit tábua de frios',
      description: 'Salame, copa, queijos e acompanhamentos.',
      price: 119.9,
      cost: 72.0,
      stock: 12,
      min: 4,
    },
    {
      sku: 'CES-PRE',
      name: 'Cesta presente pequena',
      description: 'Seleção da casa em cesta de vime.',
      price: 159.9,
      cost: 95.0,
      stock: 8,
      min: 3,
    },
  ],
  customers: [
    { name: 'Ana Carolina Duarte', email: 'ana.duarte@cliente.example', phone: '(11) 90000-0101' },
    { name: 'Bruno Tavares', email: 'bruno.tavares@cliente.example', phone: '(11) 90000-0102' },
    { name: 'Camila Fontes', email: 'camila.fontes@cliente.example', phone: null },
    { name: 'Diego Moraes', email: null, phone: '(11) 90000-0104' },
    { name: 'Eduarda Lins', email: 'eduarda.lins@cliente.example', phone: '(11) 90000-0105' },
    { name: 'Felipe Arantes', email: 'felipe.arantes@cliente.example', phone: '(11) 90000-0106' },
    { name: 'Gabriela Nunes', email: 'gabriela.nunes@cliente.example', phone: null },
    { name: 'Henrique Prado', email: null, phone: '(11) 90000-0108' },
    { name: 'Isabela Rocha', email: 'isabela.rocha@cliente.example', phone: '(11) 90000-0109' },
    { name: 'João Pedro Saraiva', email: 'joao.saraiva@cliente.example', phone: '(11) 90000-0110' },
    { name: 'Larissa Teles', email: 'larissa.teles@cliente.example', phone: '(11) 90000-0111' },
    { name: 'Marcos Vieira', email: null, phone: '(11) 90000-0112' },
    { name: 'Natália Brandão', email: 'natalia.brandao@cliente.example', phone: '(11) 90000-0113' },
    { name: 'Otávio Queiroz', email: 'otavio.queiroz@cliente.example', phone: null },
    { name: 'Paula Siqueira', email: 'paula.siqueira@cliente.example', phone: '(11) 90000-0115' },
    { name: 'Rafael Mendonça', email: 'rafael.mendonca@cliente.example', phone: '(11) 90000-0116' },
    { name: 'Sofia Andrade', email: 'sofia.andrade@cliente.example', phone: '(11) 90000-0117' },
    { name: 'Thiago Barros', email: null, phone: '(11) 90000-0118' },
  ],
};

const papelaria: DemoCompany = {
  name: 'Papelaria Ponto Final',
  orders: 30,
  seed: 0.17,
  users: [{ email: 'dona@papelaria.example', name: 'Renata Okada', role: 'owner' }],
  products: [
    {
      sku: 'CAD-10M',
      name: 'Caderno 10 matérias',
      description: 'Capa dura, 200 folhas.',
      price: 39.9,
      cost: 21.0,
      stock: 40,
      min: 10,
    },
    {
      sku: 'CAN-AZU',
      name: 'Caneta esferográfica azul (cx. 12)',
      description: 'Ponta média 1,0 mm.',
      price: 24.9,
      cost: 11.0,
      stock: 30,
      min: 8,
    },
    {
      sku: 'LAP-HB',
      name: 'Lápis grafite HB (cx. 12)',
      description: 'Madeira reflorestada.',
      price: 14.9,
      cost: 6.2,
      stock: 25,
      min: 6,
    },
    {
      sku: 'MAR-TXT',
      name: 'Marca-texto pastel (6 un.)',
      description: 'Cores suaves.',
      price: 29.9,
      cost: 14.5,
      stock: 18,
      min: 6,
    },
    {
      sku: 'PAP-A4',
      name: 'Papel A4 75 g (500 folhas)',
      description: 'Alvura 99%.',
      price: 32.9,
      cost: 22.0,
      stock: 50,
      min: 15,
    },
    {
      sku: 'AGE-26',
      name: 'Agenda 2026',
      description: 'Uma página por dia.',
      price: 49.9,
      cost: 26.0,
      stock: 15,
      min: 5,
    },
    {
      sku: 'COL-BAS',
      name: 'Cola bastão 40 g',
      description: 'Lavável.',
      price: 9.9,
      cost: 3.8,
      stock: 35,
      min: 10,
    },
    {
      sku: 'EST-ESC',
      name: 'Estojo escolar',
      description: 'Dois compartimentos.',
      price: 34.9,
      cost: 16.0,
      stock: 12,
      min: 4,
    },
  ],
  customers: [
    {
      name: 'Colégio Horizonte (fictício)',
      email: 'compras@colegio.example',
      phone: '(11) 90000-0201',
    },
    { name: 'Mariana Lopes', email: 'mariana.lopes@cliente.example', phone: null },
    {
      name: 'Escritório Ribeiro & Sá (fictício)',
      email: 'adm@escritorio.example',
      phone: '(11) 90000-0203',
    },
    { name: 'Vitor Hugo Lemos', email: null, phone: '(11) 90000-0204' },
  ],
};

async function must<T>(
  label: string,
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data as NonNullable<T>;
}

async function findUserIdsByEmail(emails: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data.users)
      if (user.email && emails.includes(user.email)) found.set(user.email, user.id);
    if (data.users.length < 200) break;
  }
  return found;
}

/** Remove a demonstração anterior (empresas dos usuários demo e os próprios usuários). */
async function reset(emails: string[]) {
  const existing = await findUserIdsByEmail(emails);
  const userIds = [...existing.values()];
  if (userIds.length === 0) return;

  const memberships = await must(
    'consultar empresas demo',
    db.from('company_members').select('company_id').in('user_id', userIds),
  );
  const companyIds = [...new Set(memberships.map((m) => m.company_id))];
  if (companyIds.length > 0) {
    await must('remover empresas demo', db.from('companies').delete().in('id', companyIds));
  }
  for (const id of userIds) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) throw new Error(`remover usuário demo: ${error.message}`);
  }
  console.log(
    `  - demonstração anterior removida (${companyIds.length} empresa(s), ${userIds.length} usuário(s))`,
  );
}

async function createCompany(company: DemoCompany) {
  const userIds: string[] = [];
  const memberRows: Array<{ user_id: string; role: Role }> = [];
  for (const user of company.users) {
    const { data, error } = await db.auth.admin.createUser({
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: user.name },
    });
    if (error || !data.user) throw new Error(`criar usuário ${user.email}: ${error?.message}`);
    userIds.push(data.user.id);
    memberRows.push({ user_id: data.user.id, role: user.role });
  }

  const created = await must(
    `criar empresa ${company.name}`,
    db.from('companies').insert({ name: company.name }).select('id').single(),
  );
  const companyId = created.id;

  await must(
    'vincular membros',
    db.from('company_members').insert(memberRows.map((m) => ({ ...m, company_id: companyId }))),
  );
  await must(
    'cadastrar produtos',
    db.from('products').insert(
      company.products.map((p) => ({
        company_id: companyId,
        sku: p.sku,
        name: p.name,
        description: p.description,
        price: p.price,
        cost: p.cost,
        stock_quantity: p.stock,
        min_stock: p.min,
      })),
    ),
  );
  await must(
    'cadastrar clientes',
    db.from('customers').insert(company.customers.map((c) => ({ ...c, company_id: companyId }))),
  );

  // Cadastros anteriores ao histórico de vendas gerado (90 dias).
  const registeredAt = new Date(Date.now() - (HISTORY_DAYS + 5) * 86_400_000).toISOString();
  await must(
    'ajustar data de cadastro da empresa',
    db.from('companies').update({ created_at: registeredAt }).eq('id', companyId),
  );
  for (const table of ['products', 'customers'] as const) {
    await must(
      `ajustar data de cadastro (${table})`,
      db.from(table).update({ created_at: registeredAt }).eq('company_id', companyId),
    );
  }

  const orders = await must(
    'gerar histórico de vendas',
    db.rpc('seed_demo_sales', {
      p_company_id: companyId,
      p_user_ids: userIds,
      p_orders: company.orders,
      p_days: HISTORY_DAYS,
      p_seed: company.seed,
      p_tz: config.timezone,
    }),
  );
  console.log(
    `  - ${company.name}: ${company.products.length} produtos, ${company.customers.length} clientes, ${orders} pedidos`,
  );
}

console.log('\nVendaHub — dados de demonstração\n');
const companies = [emporio, papelaria];
await reset(companies.flatMap((c) => c.users.map((u) => u.email)));
for (const company of companies) await createCompany(company);

console.log('\nAcesso (senha de todos: valor de SEED_DEMO_PASSWORD no .env):');
for (const company of companies) {
  for (const user of company.users)
    console.log(`  ${company.name.padEnd(24)} ${user.role.padEnd(8)} ${user.email}`);
}
console.log('');
