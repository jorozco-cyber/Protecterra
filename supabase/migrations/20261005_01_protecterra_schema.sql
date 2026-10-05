-- Protecterra: inventario, compras, ventas, cobros y comisiones.
-- Todas las tablas llevan prefijo pt_ y quedan cerradas (RLS sin políticas):
-- solo el servidor de la app las lee y escribe.

create schema if not exists pt_private;

create table if not exists public.pt_products (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  name text not null,
  category text,
  unit_price numeric(16,4),
  min_required numeric(16,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_customers (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  name text not null,
  trade_name text,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_sellers (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  name text not null,
  email text,
  commission_rate numeric(8,6) not null default 0 check (commission_rate >= 0 and commission_rate <= 1),
  cedula text,
  legal_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_purchases (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  purchase_date date not null,
  invoice_number text,
  supplier_id uuid references public.pt_suppliers(id),
  kind text not null default 'contado' check (kind in ('contado','credito')),
  initial_payment numeric(16,4) not null default 0 check (initial_payment >= 0),
  due_date date,
  invoice_file jsonb,
  receipt_file jsonb,
  created_at timestamptz not null default now()
);

create sequence if not exists public.pt_lot_number_seq;

create table if not exists public.pt_lots (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  lot_number integer not null unique default nextval('public.pt_lot_number_seq'),
  product_id uuid not null references public.pt_products(id),
  purchase_id uuid references public.pt_purchases(id),
  qty numeric(16,4) not null check (qty > 0),
  unit_cost numeric(16,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);
create index if not exists pt_lots_product_idx on public.pt_lots(product_id);
create index if not exists pt_lots_purchase_idx on public.pt_lots(purchase_id);

create table if not exists public.pt_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  purchase_id uuid not null references public.pt_purchases(id),
  paid_on date not null,
  description text,
  amount numeric(16,4) not null check (amount > 0),
  method text,
  file jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pt_purchase_payments_purchase_idx on public.pt_purchase_payments(purchase_id);

create table if not exists public.pt_sales (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  sale_date date not null,
  invoice_number integer,
  customer_id uuid not null references public.pt_customers(id),
  seller_id uuid references public.pt_sellers(id),
  kind text not null default 'contado' check (kind in ('contado','credito')),
  due_date date,
  commission_rate numeric(8,6) not null default 0 check (commission_rate >= 0 and commission_rate <= 1),
  commission_status text not null default 'pendiente' check (commission_status in ('pendiente','pagado')),
  superior_rate numeric(8,6) not null default 0,
  superior_status text,
  superior_seller text,
  invoice_file jsonb,
  receipt_file jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pt_sales_customer_idx on public.pt_sales(customer_id);
create index if not exists pt_sales_seller_idx on public.pt_sales(seller_id);
create index if not exists pt_sales_invoice_idx on public.pt_sales(invoice_number);

create table if not exists public.pt_sale_lines (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  sale_id uuid not null references public.pt_sales(id),
  product_id uuid not null references public.pt_products(id),
  lot_id uuid not null references public.pt_lots(id),
  qty numeric(16,4) not null check (qty > 0),
  unit_price numeric(16,4) not null check (unit_price >= 0),
  unit_cost numeric(16,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);
create index if not exists pt_sale_lines_sale_idx on public.pt_sale_lines(sale_id);
create index if not exists pt_sale_lines_lot_idx on public.pt_sale_lines(lot_id);
create index if not exists pt_sale_lines_product_idx on public.pt_sale_lines(product_id);

create table if not exists public.pt_sale_payments (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  sale_id uuid not null references public.pt_sales(id),
  paid_on date not null,
  receipt_number text,
  amount numeric(16,4) not null check (amount > 0),
  method text,
  file jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pt_sale_payments_sale_idx on public.pt_sale_payments(sale_id);

create table if not exists public.pt_sale_expenses (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  sale_id uuid not null references public.pt_sales(id),
  description text not null,
  amount numeric(16,4) not null,
  created_at timestamptz not null default now()
);
create index if not exists pt_sale_expenses_sale_idx on public.pt_sale_expenses(sale_id);

create table if not exists public.pt_commission_payments (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  seller_id uuid references public.pt_sellers(id),
  paid_on date,
  amount numeric(16,4) not null default 0,
  method text,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_commission_payment_sales (
  payment_id uuid not null references public.pt_commission_payments(id),
  sale_id uuid not null references public.pt_sales(id),
  primary key (payment_id, sale_id)
);

create table if not exists public.pt_other_commission_people (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_other_commissions (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  person_id uuid references public.pt_other_commission_people(id),
  month_label text,
  invoice_number text,
  agroquim_billing numeric(16,4) not null default 0,
  agroquim_rate numeric(8,6) not null default 0,
  other_billing numeric(16,4) not null default 0,
  other_rate numeric(8,6) not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente','pagado')),
  invoice_file jsonb,
  payment_file jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_cash_counts (
  id uuid primary key default gen_random_uuid(),
  counted_at timestamptz not null default now(),
  nio jsonb not null default '{}'::jsonb,
  usd jsonb not null default '{}'::jsonb,
  exchange_rate numeric(12,6) not null,
  note text
);

create table if not exists public.pt_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.pt_settings(key, value) values ('usd_exchange_rate', '36.6243'::jsonb)
on conflict (key) do nothing;

-- Datos que solo se conservan para consulta (siembra, tomate, comisiones de vendedor superior).
create table if not exists public.pt_history (
  id uuid primary key default gen_random_uuid(),
  knack_id text unique,
  kind text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pt_users (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('admin','vendedor')),
  seller_id uuid references public.pt_sellers(id),
  created_at timestamptz not null default now(),
  check (role = 'admin' or seller_id is not null)
);

create table if not exists public.pt_audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb
);

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'pt\_%' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Vistas de cálculo (mismas fórmulas que Knack).
create or replace view public.pt_v_lots with (security_invoker = true) as
select l.*, p.name as product_name, p.category as product_category,
       pu.purchase_date,
       coalesce(s.sold, 0) as qty_sold,
       l.qty - coalesce(s.sold, 0) as qty_available,
       l.qty * l.unit_cost as total_cost
from public.pt_lots l
join public.pt_products p on p.id = l.product_id
left join public.pt_purchases pu on pu.id = l.purchase_id
left join (select lot_id, sum(qty) sold from public.pt_sale_lines group by lot_id) s on s.lot_id = l.id;

create or replace view public.pt_v_products with (security_invoker = true) as
select p.*,
       coalesce(a.received, 0) as qty_received,
       coalesce(a.sold, 0) as qty_sold,
       coalesce(a.available, 0) as qty_available,
       coalesce(a.stock_value, 0) as stock_value,
       coalesce(a.available, 0) <= p.min_required as needs_reorder
from public.pt_products p
left join (
  select product_id, sum(qty) received, sum(qty_sold) sold, sum(qty_available) available,
         sum(qty_available * unit_cost) stock_value
  from public.pt_v_lots group by product_id
) a on a.product_id = p.id;

create or replace view public.pt_v_sales with (security_invoker = true) as
select s.*,
       c.name as customer_name, se.name as seller_name,
       t.total, t.cost, t.paid, t.expenses,
       t.total - t.paid as balance,
       case when t.total - t.paid <= 0.005 then 'pagado' else 'pendiente' end as payment_status,
       t.total - t.cost - t.expenses as gross_profit,
       (t.total - t.cost - t.expenses) * s.commission_rate as commission,
       (t.total - t.cost - t.expenses) * s.superior_rate as superior_commission,
       (t.total - t.cost - t.expenses) * (1 - s.commission_rate - s.superior_rate) as net_profit,
       case when t.total - t.paid > 0.005 and s.due_date is not null and s.due_date < current_date
            then current_date - s.due_date else 0 end as days_overdue
from public.pt_sales s
join public.pt_customers c on c.id = s.customer_id
left join public.pt_sellers se on se.id = s.seller_id
cross join lateral (
  select coalesce((select sum(qty * unit_price) from public.pt_sale_lines where sale_id = s.id), 0) as total,
         coalesce((select sum(qty * unit_cost) from public.pt_sale_lines where sale_id = s.id), 0) as cost,
         coalesce((select sum(amount) from public.pt_sale_payments where sale_id = s.id), 0) as paid,
         coalesce((select sum(amount) from public.pt_sale_expenses where sale_id = s.id), 0) as expenses
) t;

create or replace view public.pt_v_purchases with (security_invoker = true) as
select pu.*, su.name as supplier_name,
       t.total, t.units, pu.initial_payment + t.paid as paid,
       t.total - pu.initial_payment - t.paid as balance,
       case when t.total - pu.initial_payment - t.paid <= 0.005 then 'pagado' else 'pendiente' end as payment_status
from public.pt_purchases pu
left join public.pt_suppliers su on su.id = pu.supplier_id
cross join lateral (
  select coalesce((select sum(qty * unit_cost) from public.pt_lots where purchase_id = pu.id), 0) as total,
         coalesce((select sum(qty) from public.pt_lots where purchase_id = pu.id), 0) as units,
         coalesce((select sum(amount) from public.pt_purchase_payments where purchase_id = pu.id), 0) as paid
) t;

revoke all on public.pt_v_lots, public.pt_v_products, public.pt_v_sales, public.pt_v_purchases from anon, authenticated;
