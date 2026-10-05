-- Protecterra: quién puede entrar, reglas de operación (FIFO, bloqueos, anulaciones) y portal del vendedor.
-- Nada se borra: las ventas, cobros, compras y pagos se anulan y quedan en el registro.

alter table public.pt_sellers add column if not exists portal_enabled boolean not null default false;
alter table public.pt_sales add column if not exists voided_at timestamptz;
alter table public.pt_sales add column if not exists voided_reason text;
alter table public.pt_sales add column if not exists note text;
alter table public.pt_sale_payments add column if not exists voided_at timestamptz;
alter table public.pt_sale_payments add column if not exists voided_reason text;
alter table public.pt_sale_expenses add column if not exists voided_at timestamptz;
alter table public.pt_purchases add column if not exists voided_at timestamptz;
alter table public.pt_purchases add column if not exists voided_reason text;
alter table public.pt_purchase_payments add column if not exists voided_at timestamptz;
alter table public.pt_purchase_payments add column if not exists voided_reason text;
alter table public.pt_lots add column if not exists voided_at timestamptz;
alter table public.pt_other_commissions add column if not exists voided_at timestamptz;

-- Rol de quien está conectado: 'admin', 'vendedor' o nada.
create or replace function pt_private.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when u.email_confirmed_at is null then null
    when exists (select 1 from public.pt_settings s
                 where s.key = 'admin_emails' and s.value ? lower(u.email)) then 'admin'
    when exists (select 1 from public.pt_sellers se
                 where lower(se.email) = lower(u.email) and se.portal_enabled and se.active) then 'vendedor'
  end
  from auth.users u where u.id = auth.uid()
$$;

create or replace function pt_private.app_seller_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select se.id from auth.users u
  join public.pt_sellers se on lower(se.email) = lower(u.email) and se.portal_enabled and se.active
  where u.id = auth.uid() and u.email_confirmed_at is not null
  limit 1
$$;

create or replace function pt_private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if pt_private.app_role() is distinct from 'admin' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end $$;

create or replace function pt_private.audit(p_action text, p_entity text, p_id uuid, p_detail jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.pt_audit_log (user_id, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_id, p_detail)
$$;

grant usage on schema pt_private to authenticated;
revoke all on all functions in schema pt_private from public, anon;
grant execute on function pt_private.app_role() to authenticated;

-- Acceso: solo el administrador lee y escribe las tablas. El vendedor nunca las toca directo.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'pt\_%' loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'pt_admin_all') then
      execute format('create policy pt_admin_all on public.%I for all to authenticated using ((select pt_private.app_role()) = ''admin'') with check ((select pt_private.app_role()) = ''admin'')', t);
    end if;
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Catálogos que el administrador edita directo; lo demás pasa por las funciones de abajo.
grant insert, update on public.pt_products, public.pt_customers, public.pt_sellers, public.pt_suppliers,
  public.pt_settings, public.pt_cash_counts, public.pt_other_commissions, public.pt_other_commission_people to authenticated;
grant update (due_date, note, invoice_file, receipt_file, customer_id) on public.pt_sales to authenticated;
grant update (due_date, invoice_file, receipt_file, invoice_number) on public.pt_purchases to authenticated;

-- Vistas (mismas columnas de antes, ahora sin lo anulado).
create or replace view public.pt_v_lots with (security_invoker = true) as
select l.id, l.knack_id, l.lot_number, l.product_id, l.purchase_id, l.qty, l.unit_cost, l.created_at,
       p.name as product_name, p.category as product_category,
       pu.purchase_date,
       coalesce(s.sold, 0) as qty_sold,
       l.qty - coalesce(s.sold, 0) as qty_available,
       l.qty * l.unit_cost as total_cost
from public.pt_lots l
join public.pt_products p on p.id = l.product_id
left join public.pt_purchases pu on pu.id = l.purchase_id
left join (select sl.lot_id, sum(sl.qty) sold
           from public.pt_sale_lines sl join public.pt_sales sa on sa.id = sl.sale_id
           where sa.voided_at is null group by sl.lot_id) s on s.lot_id = l.id
where l.voided_at is null;

create or replace view public.pt_v_sales with (security_invoker = true) as
select s.id, s.knack_id, s.sale_date, s.invoice_number, s.customer_id, s.seller_id, s.kind, s.due_date,
       s.commission_rate, s.commission_status, s.superior_rate, s.superior_status, s.superior_seller,
       s.invoice_file, s.receipt_file, s.created_at,
       c.name as customer_name, se.name as seller_name,
       t.total, t.cost, t.paid, t.expenses,
       t.total - t.paid as balance,
       case when t.total - t.paid <= 0.005 then 'pagado' else 'pendiente' end as payment_status,
       t.total - t.cost - t.expenses as gross_profit,
       (t.total - t.cost - t.expenses) * s.commission_rate as commission,
       (t.total - t.cost - t.expenses) * s.superior_rate as superior_commission,
       (t.total - t.cost - t.expenses) * (1 - s.commission_rate - s.superior_rate) as net_profit,
       case when t.total - t.paid > 0.005 and s.due_date is not null and s.due_date < current_date
            then current_date - s.due_date else 0 end as days_overdue,
       s.voided_at, s.voided_reason, s.note
from public.pt_sales s
join public.pt_customers c on c.id = s.customer_id
left join public.pt_sellers se on se.id = s.seller_id
cross join lateral (
  select coalesce((select sum(qty * unit_price) from public.pt_sale_lines where sale_id = s.id), 0) as total,
         coalesce((select sum(qty * unit_cost) from public.pt_sale_lines where sale_id = s.id), 0) as cost,
         coalesce((select sum(amount) from public.pt_sale_payments where sale_id = s.id and voided_at is null), 0) as paid,
         coalesce((select sum(amount) from public.pt_sale_expenses where sale_id = s.id and voided_at is null), 0) as expenses
) t;

create or replace view public.pt_v_purchases with (security_invoker = true) as
select pu.id, pu.knack_id, pu.purchase_date, pu.invoice_number, pu.supplier_id, pu.kind, pu.initial_payment,
       pu.due_date, pu.invoice_file, pu.receipt_file, pu.created_at,
       su.name as supplier_name,
       t.total, t.units, pu.initial_payment + t.paid as paid,
       t.total - pu.initial_payment - t.paid as balance,
       case when t.total - pu.initial_payment - t.paid <= 0.005 then 'pagado' else 'pendiente' end as payment_status,
       pu.voided_at, pu.voided_reason
from public.pt_purchases pu
left join public.pt_suppliers su on su.id = pu.supplier_id
cross join lateral (
  select coalesce((select sum(qty * unit_cost) from public.pt_lots where purchase_id = pu.id), 0) as total,
         coalesce((select sum(qty) from public.pt_lots where purchase_id = pu.id), 0) as units,
         coalesce((select sum(amount) from public.pt_purchase_payments where purchase_id = pu.id and voided_at is null), 0) as paid
) t;

grant select on public.pt_v_lots, public.pt_v_products, public.pt_v_sales, public.pt_v_purchases to authenticated;

-- Quién soy (para que la app sepa qué pantalla mostrar).
create or replace function public.pt_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'role', pt_private.app_role(),
    'seller_id', pt_private.app_seller_id(),
    'email', (select email from auth.users where id = auth.uid()))
$$;

-- Venta nueva. Toma los lotes más viejos primero (FIFO) y reparte entre lotes si hace falta.
create or replace function public.pt_create_sale(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sale uuid;
  v_date date := nullif(p->>'sale_date', '')::date;
  v_inv integer := nullif(p->>'invoice_number', '')::integer;
  v_customer uuid := nullif(p->>'customer_id', '')::uuid;
  v_seller uuid := nullif(p->>'seller_id', '')::uuid;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'contado');
  v_rate numeric := 0;
  v_line jsonb;
  v_exp jsonb;
  v_product uuid;
  v_name text;
  v_need numeric;
  v_take numeric;
  v_price numeric;
  v_below text := '';
  v_total numeric := 0;
  v_pay numeric := coalesce(nullif(p->>'paid_now', '')::numeric, 0);
  r record;
begin
  perform pt_private.require_admin();
  if v_date is null then raise exception 'Falta la fecha de la venta'; end if;
  if v_date > current_date + 1 then raise exception 'La fecha de la venta no puede ser futura'; end if;
  if v_customer is null or not exists (select 1 from public.pt_customers where id = v_customer) then
    raise exception 'Selecciona un cliente';
  end if;
  if v_kind not in ('contado', 'credito') then raise exception 'Tipo de venta inválido'; end if;
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'Agrega al menos un producto';
  end if;
  if v_inv is not null and exists (select 1 from public.pt_sales where invoice_number = v_inv and voided_at is null) then
    raise exception 'Ya existe una venta con la factura %', v_inv;
  end if;
  if v_seller is not null then
    select commission_rate into v_rate from public.pt_sellers where id = v_seller;
    if not found then raise exception 'Vendedor inválido'; end if;
  end if;
  if nullif(p->>'commission_rate', '') is not null then v_rate := (p->>'commission_rate')::numeric; end if;

  insert into public.pt_sales (sale_date, invoice_number, customer_id, seller_id, kind, due_date, commission_rate, note)
  values (v_date, v_inv, v_customer, v_seller, v_kind,
          coalesce(nullif(p->>'due_date', '')::date, case when v_kind = 'credito' then v_date + 30 else v_date end),
          v_rate, nullif(btrim(p->>'note'), ''))
  returning id into v_sale;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_product := nullif(v_line->>'product_id', '')::uuid;
    v_need := nullif(v_line->>'qty', '')::numeric;
    v_price := nullif(v_line->>'unit_price', '')::numeric;
    select name into v_name from public.pt_products where id = v_product;
    if not found then raise exception 'Producto inválido'; end if;
    if v_need is null or v_need <= 0 then raise exception 'Cantidad inválida para %', v_name; end if;
    if v_price is null or v_price < 0 then raise exception 'Precio inválido para %', v_name; end if;

    for r in
      select l.id, l.unit_cost,
             l.qty - coalesce((select sum(sl.qty) from public.pt_sale_lines sl
                               join public.pt_sales sa on sa.id = sl.sale_id
                               where sl.lot_id = l.id and sa.voided_at is null), 0) as avail
      from public.pt_lots l
      left join public.pt_purchases pu on pu.id = l.purchase_id
      where l.product_id = v_product and l.voided_at is null
        and coalesce(pu.purchase_date, date '1900-01-01') <= v_date
      order by coalesce(pu.purchase_date, date '1900-01-01'), l.lot_number
      for update of l
    loop
      continue when r.avail <= 0;
      v_take := least(v_need, r.avail);
      insert into public.pt_sale_lines (sale_id, product_id, lot_id, qty, unit_price, unit_cost)
      values (v_sale, v_product, r.id, v_take, v_price, r.unit_cost);
      if v_price < r.unit_cost then v_below := v_below || v_name || '; '; end if;
      v_total := v_total + v_take * v_price;
      v_need := v_need - v_take;
      exit when v_need <= 0;
    end loop;

    if v_need > 0 then
      raise exception 'No hay suficiente inventario de % con fecha de compra hasta el %: faltan % unidades',
        v_name, to_char(v_date, 'DD/MM/YYYY'), trim(to_char(v_need, 'FM999999990.####'), '.');
    end if;
  end loop;

  if v_below <> '' and not coalesce((p->>'allow_below_cost')::boolean, false) then
    raise exception 'BAJO_COSTO: el precio está por debajo del costo en: %', v_below;
  end if;

  if jsonb_typeof(p->'expenses') = 'array' then
    for v_exp in select * from jsonb_array_elements(p->'expenses') loop
      if nullif(btrim(v_exp->>'description'), '') is not null and nullif(v_exp->>'amount', '') is not null then
        insert into public.pt_sale_expenses (sale_id, description, amount)
        values (v_sale, btrim(v_exp->>'description'), (v_exp->>'amount')::numeric);
      end if;
    end loop;
  end if;

  if v_pay > 0 then
    if v_pay > v_total + 0.005 then raise exception 'El pago inicial es mayor que el total de la venta'; end if;
    insert into public.pt_sale_payments (sale_id, paid_on, amount, method)
    values (v_sale, v_date, v_pay, nullif(btrim(p->>'method'), ''));
  end if;

  perform pt_private.audit('crear', 'venta', v_sale, jsonb_build_object('factura', v_inv, 'total', v_total));
  return v_sale;
end $$;

create or replace function public.pt_void_sale(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.require_admin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  if exists (select 1 from public.pt_sale_payments where sale_id = p_id and voided_at is null) then
    raise exception 'Esta venta tiene cobros registrados. Anula primero los cobros.';
  end if;
  update public.pt_sales set voided_at = now(), voided_reason = btrim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'La venta no existe o ya estaba anulada'; end if;
  perform pt_private.audit('anular', 'venta', p_id, jsonb_build_object('motivo', btrim(p_reason)));
end $$;

create or replace function public.pt_add_sale_payment(p_sale uuid, p_date date, p_amount numeric, p_method text, p_receipt text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_balance numeric; v_id uuid;
begin
  perform pt_private.require_admin();
  select balance into v_balance from public.pt_v_sales where id = p_sale and voided_at is null;
  if not found then raise exception 'La venta no existe o está anulada'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_amount > v_balance + 0.005 then
    raise exception 'El monto es mayor que el saldo pendiente (%)', trim(to_char(v_balance, 'FM999G999G990D00'));
  end if;
  insert into public.pt_sale_payments (sale_id, paid_on, amount, method, receipt_number)
  values (p_sale, coalesce(p_date, current_date), p_amount, nullif(btrim(p_method), ''), nullif(btrim(p_receipt), ''))
  returning id into v_id;
  perform pt_private.audit('crear', 'cobro', v_id, jsonb_build_object('venta', p_sale, 'monto', p_amount));
  return v_id;
end $$;

create or replace function public.pt_void_sale_payment(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.require_admin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  update public.pt_sale_payments set voided_at = now(), voided_reason = btrim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'El cobro no existe o ya estaba anulado'; end if;
  perform pt_private.audit('anular', 'cobro', p_id, jsonb_build_object('motivo', btrim(p_reason)));
end $$;

create or replace function public.pt_add_sale_expense(p_sale uuid, p_description text, p_amount numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform pt_private.require_admin();
  if not exists (select 1 from public.pt_sales where id = p_sale and voided_at is null) then
    raise exception 'La venta no existe o está anulada';
  end if;
  if nullif(btrim(p_description), '') is null then raise exception 'Escribe la descripción del gasto'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  insert into public.pt_sale_expenses (sale_id, description, amount) values (p_sale, btrim(p_description), p_amount)
  returning id into v_id;
  perform pt_private.audit('crear', 'gasto_venta', v_id, jsonb_build_object('venta', p_sale, 'monto', p_amount));
  return v_id;
end $$;

create or replace function public.pt_void_sale_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.require_admin();
  update public.pt_sale_expenses set voided_at = now() where id = p_id and voided_at is null;
  if not found then raise exception 'El gasto no existe o ya estaba anulado'; end if;
  perform pt_private.audit('anular', 'gasto_venta', p_id, null);
end $$;

-- Compra nueva con sus lotes.
create or replace function public.pt_create_purchase(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_date date := nullif(p->>'purchase_date', '')::date;
  v_supplier uuid := nullif(p->>'supplier_id', '')::uuid;
  v_supplier_name text := nullif(btrim(p->>'supplier_name'), '');
  v_kind text := coalesce(nullif(p->>'kind', ''), 'contado');
  v_initial numeric := coalesce(nullif(p->>'initial_payment', '')::numeric, 0);
  v_total numeric := 0;
  v_lot jsonb;
  v_qty numeric;
  v_cost numeric;
begin
  perform pt_private.require_admin();
  if v_date is null then raise exception 'Falta la fecha de la compra'; end if;
  if v_date > current_date + 1 then raise exception 'La fecha de la compra no puede ser futura'; end if;
  if v_kind not in ('contado', 'credito') then raise exception 'Tipo de compra inválido'; end if;
  if jsonb_typeof(p->'lots') is distinct from 'array' or jsonb_array_length(p->'lots') = 0 then
    raise exception 'Agrega al menos un producto';
  end if;
  if v_supplier is null and v_supplier_name is not null then
    insert into public.pt_suppliers (name) values (v_supplier_name)
    on conflict (name) do update set name = excluded.name returning id into v_supplier;
  end if;
  if v_supplier is null then raise exception 'Selecciona un proveedor'; end if;

  insert into public.pt_purchases (purchase_date, invoice_number, supplier_id, kind, initial_payment, due_date)
  values (v_date, nullif(btrim(p->>'invoice_number'), ''), v_supplier, v_kind, 0,
          coalesce(nullif(p->>'due_date', '')::date, case when v_kind = 'credito' then v_date + 30 else v_date end))
  returning id into v_id;

  for v_lot in select * from jsonb_array_elements(p->'lots') loop
    v_qty := nullif(v_lot->>'qty', '')::numeric;
    v_cost := nullif(v_lot->>'unit_cost', '')::numeric;
    if not exists (select 1 from public.pt_products where id = nullif(v_lot->>'product_id', '')::uuid) then
      raise exception 'Producto inválido';
    end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad inválida'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'Costo inválido'; end if;
    insert into public.pt_lots (product_id, purchase_id, qty, unit_cost)
    values ((v_lot->>'product_id')::uuid, v_id, v_qty, v_cost);
    v_total := v_total + v_qty * v_cost;
  end loop;

  if v_kind = 'contado' and nullif(p->>'initial_payment', '') is null then v_initial := v_total; end if;
  if v_initial < 0 or v_initial > v_total + 0.005 then raise exception 'El abono inicial no puede ser mayor que el total'; end if;
  update public.pt_purchases set initial_payment = v_initial where id = v_id;

  perform pt_private.audit('crear', 'compra', v_id, jsonb_build_object('total', v_total));
  return v_id;
end $$;

create or replace function public.pt_void_purchase(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.require_admin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  if exists (select 1 from public.pt_v_lots where purchase_id = p_id and qty_sold > 0) then
    raise exception 'No se puede anular: ya se vendieron productos de esta compra';
  end if;
  if exists (select 1 from public.pt_purchase_payments where purchase_id = p_id and voided_at is null) then
    raise exception 'Esta compra tiene pagos registrados. Anula primero los pagos.';
  end if;
  update public.pt_purchases set voided_at = now(), voided_reason = btrim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'La compra no existe o ya estaba anulada'; end if;
  update public.pt_lots set voided_at = now() where purchase_id = p_id and voided_at is null;
  perform pt_private.audit('anular', 'compra', p_id, jsonb_build_object('motivo', btrim(p_reason)));
end $$;

create or replace function public.pt_add_purchase_payment(p_purchase uuid, p_date date, p_amount numeric, p_method text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_balance numeric; v_id uuid;
begin
  perform pt_private.require_admin();
  select balance into v_balance from public.pt_v_purchases where id = p_purchase and voided_at is null;
  if not found then raise exception 'La compra no existe o está anulada'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor que cero'; end if;
  if p_amount > v_balance + 0.005 then
    raise exception 'El monto es mayor que el saldo pendiente (%)', trim(to_char(v_balance, 'FM999G999G990D00'));
  end if;
  insert into public.pt_purchase_payments (purchase_id, paid_on, amount, method, description)
  values (p_purchase, coalesce(p_date, current_date), p_amount, nullif(btrim(p_method), ''), coalesce(nullif(btrim(p_description), ''), 'abono'))
  returning id into v_id;
  perform pt_private.audit('crear', 'pago_compra', v_id, jsonb_build_object('compra', p_purchase, 'monto', p_amount));
  return v_id;
end $$;

create or replace function public.pt_void_purchase_payment(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.require_admin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  update public.pt_purchase_payments set voided_at = now(), voided_reason = btrim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'El pago no existe o ya estaba anulado'; end if;
  perform pt_private.audit('anular', 'pago_compra', p_id, jsonb_build_object('motivo', btrim(p_reason)));
end $$;

-- Pago de comisiones: marca las ventas elegidas como pagadas y guarda el pago.
create or replace function public.pt_pay_commissions(p_seller uuid, p_sales uuid[], p_date date, p_method text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_amount numeric; v_count integer; v_id uuid;
begin
  perform pt_private.require_admin();
  select coalesce(sum(commission), 0), count(*) into v_amount, v_count
  from public.pt_v_sales
  where id = any(p_sales) and seller_id = p_seller and voided_at is null and commission_status = 'pendiente';
  if v_count = 0 or v_count <> coalesce(array_length(p_sales, 1), 0) then
    raise exception 'Alguna de las ventas elegidas no es de este vendedor o ya tiene la comisión pagada';
  end if;
  insert into public.pt_commission_payments (seller_id, paid_on, amount, method)
  values (p_seller, coalesce(p_date, current_date), round(v_amount, 2), nullif(btrim(p_method), ''))
  returning id into v_id;
  insert into public.pt_commission_payment_sales (payment_id, sale_id) select v_id, unnest(p_sales);
  update public.pt_sales set commission_status = 'pagado' where id = any(p_sales);
  perform pt_private.audit('crear', 'pago_comision', v_id, jsonb_build_object('monto', round(v_amount, 2), 'ventas', v_count));
  return round(v_amount, 2);
end $$;

-- Portal del vendedor: solo sus ventas, sin costos ni utilidades.
create or replace function public.pt_seller_portal() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_seller uuid := pt_private.app_seller_id();
begin
  if pt_private.app_role() is distinct from 'vendedor' or v_seller is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'seller', (select jsonb_build_object('name', name, 'commission_rate', commission_rate) from public.pt_sellers where id = v_seller),
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'invoice_number', v.invoice_number, 'sale_date', v.sale_date, 'due_date', v.due_date,
        'kind', v.kind, 'customer_id', v.customer_id, 'customer_name', v.customer_name,
        'total', round(v.total, 2), 'paid', round(v.paid, 2), 'balance', round(v.balance, 2),
        'payment_status', v.payment_status, 'days_overdue', v.days_overdue,
        'commission', round(v.commission, 2), 'commission_status', v.commission_status,
        'lines', (select coalesce(jsonb_agg(jsonb_build_object('product', x.product, 'qty', x.qty, 'unit_price', x.unit_price) order by x.product), '[]'::jsonb)
                  from (select p.name as product, sum(sl.qty) as qty, sl.unit_price
                        from public.pt_sale_lines sl join public.pt_products p on p.id = sl.product_id
                        where sl.sale_id = v.id group by p.name, sl.unit_price) x),
        'payments', (select coalesce(jsonb_agg(jsonb_build_object('paid_on', sp.paid_on, 'amount', sp.amount, 'method', sp.method) order by sp.paid_on), '[]'::jsonb)
                     from public.pt_sale_payments sp where sp.sale_id = v.id and sp.voided_at is null)
      ) order by v.sale_date desc, v.invoice_number desc)
      from public.pt_v_sales v where v.seller_id = v_seller and v.voided_at is null), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) order by c.name)
      from public.pt_customers c
      where exists (select 1 from public.pt_sales s where s.customer_id = c.id and s.seller_id = v_seller and s.voided_at is null)), '[]'::jsonb)
  );
end $$;

do $$
declare f text;
begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'pt\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
