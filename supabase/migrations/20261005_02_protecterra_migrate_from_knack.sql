-- Copia el historial de Knack (guardado en knack_backup) a las tablas de Protecterra.
-- Se puede volver a correr: actualiza lo que ya existe y agrega lo nuevo. Nunca borra.

create or replace function pt_private.k_num(j jsonb, f text) returns numeric
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(j->>(f || '_raw'), ''), '[^0-9.\-]', '', 'g'), '')::numeric
$$;

create or replace function pt_private.k_date(j jsonb, f text) returns date
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j->(f || '_raw')) = 'object'
              then to_date(j->(f || '_raw')->>'date', 'MM/DD/YYYY') end
$$;

create or replace function pt_private.k_file(j jsonb, f text) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j->(f || '_raw')) = 'object' then j->(f || '_raw') end
$$;

create or replace function pt_private.k_ref(j jsonb, f text) returns text
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(j->(f || '_raw')) = 'array' then j->(f || '_raw')->0->>'id' end
$$;

create or replace function pt_private.k_text(j jsonb, f text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(j->>(f || '_raw')), '')
$$;

create or replace function pt_private.migrate_from_knack() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  out jsonb := '{}'::jsonb;
  n integer;
begin
  -- Productos
  insert into public.pt_products (knack_id, name, category, unit_price, min_required, created_at)
  select r.record_id, coalesce(pt_private.k_text(r.data,'field_11'), '(sin nombre)'), pt_private.k_text(r.data,'field_32'),
         pt_private.k_num(r.data,'field_91'), coalesce(pt_private.k_num(r.data,'field_33'), 0),
         coalesce(pt_private.k_date(r.data,'field_212')::timestamptz, now())
  from knack_backup.records r where r.table_key = 'object_5'
  on conflict (knack_id) do update set name = excluded.name, category = excluded.category,
    unit_price = excluded.unit_price, min_required = excluded.min_required;
  get diagnostics n = row_count; out := out || jsonb_build_object('productos', n);

  -- Clientes
  insert into public.pt_customers (knack_id, name, trade_name, email, phone, address, notes)
  select r.record_id, coalesce(pt_private.k_text(r.data,'field_85'), '(sin nombre)'), pt_private.k_text(r.data,'field_86'),
         nullif(r.data->'field_227_raw'->>'email', ''), pt_private.k_text(r.data,'field_439'),
         pt_private.k_text(r.data,'field_440'), pt_private.k_text(r.data,'field_441')
  from knack_backup.records r where r.table_key = 'object_12'
  on conflict (knack_id) do update set name = excluded.name, trade_name = excluded.trade_name, email = excluded.email,
    phone = excluded.phone, address = excluded.address, notes = excluded.notes;
  get diagnostics n = row_count; out := out || jsonb_build_object('clientes', n);

  -- Vendedores
  insert into public.pt_sellers (knack_id, name, email, commission_rate, cedula, legal_name)
  select r.record_id, coalesce(pt_private.k_text(r.data,'field_38'), '(sin nombre)'), nullif(r.data->'field_39_raw'->>'email', ''),
         coalesce(pt_private.k_num(r.data,'field_297'), 0), pt_private.k_text(r.data,'field_351'), pt_private.k_text(r.data,'field_352')
  from knack_backup.records r where r.table_key = 'object_6'
  on conflict (knack_id) do update set name = excluded.name, email = excluded.email,
    commission_rate = excluded.commission_rate, cedula = excluded.cedula, legal_name = excluded.legal_name;
  get diagnostics n = row_count; out := out || jsonb_build_object('vendedores', n);

  -- Proveedores (en Knack eran una lista fija de nombres)
  insert into public.pt_suppliers (name)
  select distinct pt_private.k_text(r.data,'field_28')
  from knack_backup.records r where r.table_key = 'object_2' and pt_private.k_text(r.data,'field_28') is not null
  on conflict (name) do nothing;

  -- Compras
  insert into public.pt_purchases (knack_id, purchase_date, invoice_number, supplier_id, kind, initial_payment, due_date, invoice_file, receipt_file)
  select r.record_id, coalesce(pt_private.k_date(r.data,'field_30'), date '2025-01-01'), pt_private.k_text(r.data,'field_148'),
         (select s.id from public.pt_suppliers s where s.name = pt_private.k_text(r.data,'field_28')),
         case when lower(coalesce(pt_private.k_text(r.data,'field_218'), '')) = 'credito' then 'credito' else 'contado' end,
         coalesce(pt_private.k_num(r.data,'field_219'), 0), pt_private.k_date(r.data,'field_221'),
         pt_private.k_file(r.data,'field_209'), pt_private.k_file(r.data,'field_259')
  from knack_backup.records r where r.table_key = 'object_2'
  on conflict (knack_id) do update set purchase_date = excluded.purchase_date, invoice_number = excluded.invoice_number,
    supplier_id = excluded.supplier_id, kind = excluded.kind, initial_payment = excluded.initial_payment,
    due_date = excluded.due_date, invoice_file = excluded.invoice_file, receipt_file = excluded.receipt_file;
  get diagnostics n = row_count; out := out || jsonb_build_object('compras', n);

  -- Lotes (cada compra lista sus lotes)
  insert into public.pt_lots (knack_id, lot_number, product_id, purchase_id, qty, unit_cost)
  select r.record_id, pt_private.k_num(r.data,'field_266')::integer,
         (select p.id from public.pt_products p where p.knack_id = pt_private.k_ref(r.data,'field_142')),
         (select pu.id from public.pt_purchases pu
            join knack_backup.records c on c.table_key = 'object_2' and c.record_id = pu.knack_id
           where jsonb_typeof(c.data->'field_141_raw') = 'array'
             and exists (select 1 from jsonb_array_elements(c.data->'field_141_raw') e where e->>'id' = r.record_id)
           limit 1),
         pt_private.k_num(r.data,'field_143'), coalesce(pt_private.k_num(r.data,'field_144'), 0)
  from knack_backup.records r where r.table_key = 'object_18'
  on conflict (knack_id) do update set product_id = excluded.product_id, purchase_id = excluded.purchase_id,
    qty = excluded.qty, unit_cost = excluded.unit_cost;
  get diagnostics n = row_count; out := out || jsonb_build_object('lotes', n);
  perform setval('public.pt_lot_number_seq', greatest((select coalesce(max(lot_number), 0) from public.pt_lots), 1));

  -- Pagos a proveedores
  insert into public.pt_purchase_payments (knack_id, purchase_id, paid_on, description, amount, method, file)
  select r.record_id, (select pu.id from public.pt_purchases pu where pu.knack_id = pt_private.k_ref(r.data,'field_242')),
         coalesce(pt_private.k_date(r.data,'field_245'), date '2025-01-01'), pt_private.k_text(r.data,'field_239'),
         pt_private.k_num(r.data,'field_243'), pt_private.k_text(r.data,'field_246'), pt_private.k_file(r.data,'field_260')
  from knack_backup.records r where r.table_key = 'object_27'
  on conflict (knack_id) do update set purchase_id = excluded.purchase_id, paid_on = excluded.paid_on,
    description = excluded.description, amount = excluded.amount, method = excluded.method, file = excluded.file;
  get diagnostics n = row_count; out := out || jsonb_build_object('pagos_compras', n);

  -- Ventas. La comisión usa el porcentaje que Knack aplica hoy a cada venta.
  insert into public.pt_sales (knack_id, sale_date, invoice_number, customer_id, seller_id, kind, due_date,
                               commission_rate, commission_status, superior_rate, superior_status, superior_seller,
                               invoice_file, receipt_file)
  select r.record_id, coalesce(pt_private.k_date(r.data,'field_31'), date '2025-01-01'), pt_private.k_num(r.data,'field_40')::integer,
         (select c.id from public.pt_customers c where c.knack_id = pt_private.k_ref(r.data,'field_99')),
         (select s.id from public.pt_sellers s where s.knack_id = pt_private.k_ref(r.data,'field_45')),
         case when lower(coalesce(pt_private.k_text(r.data,'field_41'), '')) = 'credito' then 'credito' else 'contado' end,
         pt_private.k_date(r.data,'field_44'),
         coalesce(pt_private.k_num(r.data,'field_299'), 0),
         case when lower(coalesce(pt_private.k_text(r.data,'field_47'), '')) = 'pagado' then 'pagado' else 'pendiente' end,
         coalesce(pt_private.k_num(r.data,'field_298'), 0),
         lower(pt_private.k_text(r.data,'field_304')),
         nullif(btrim(r.data->'field_301_raw'->0->>'identifier'), ''),
         pt_private.k_file(r.data,'field_155'), pt_private.k_file(r.data,'field_210')
  from knack_backup.records r where r.table_key = 'object_3'
  on conflict (knack_id) do update set sale_date = excluded.sale_date, invoice_number = excluded.invoice_number,
    customer_id = excluded.customer_id, seller_id = excluded.seller_id, kind = excluded.kind, due_date = excluded.due_date,
    commission_rate = excluded.commission_rate, commission_status = excluded.commission_status,
    superior_rate = excluded.superior_rate, superior_status = excluded.superior_status,
    superior_seller = excluded.superior_seller, invoice_file = excluded.invoice_file, receipt_file = excluded.receipt_file;
  get diagnostics n = row_count; out := out || jsonb_build_object('ventas', n);

  -- Líneas de venta (cada venta lista sus líneas)
  insert into public.pt_sale_lines (knack_id, sale_id, product_id, lot_id, qty, unit_price, unit_cost)
  select r.record_id,
         (select s.id from public.pt_sales s
            join knack_backup.records v on v.table_key = 'object_3' and v.record_id = s.knack_id
           where jsonb_typeof(v.data->'field_93_raw') = 'array'
             and exists (select 1 from jsonb_array_elements(v.data->'field_93_raw') e where e->>'id' = r.record_id)
           limit 1),
         (select p.id from public.pt_products p where p.knack_id = pt_private.k_ref(r.data,'field_94')),
         (select l.id from public.pt_lots l where l.knack_id = pt_private.k_ref(r.data,'field_267')),
         pt_private.k_num(r.data,'field_284'), coalesce(pt_private.k_num(r.data,'field_120'), 0), coalesce(pt_private.k_num(r.data,'field_124'), 0)
  from knack_backup.records r where r.table_key = 'object_14'
  on conflict (knack_id) do update set sale_id = excluded.sale_id, product_id = excluded.product_id, lot_id = excluded.lot_id,
    qty = excluded.qty, unit_price = excluded.unit_price, unit_cost = excluded.unit_cost;
  get diagnostics n = row_count; out := out || jsonb_build_object('lineas_venta', n);

  -- Cobros
  insert into public.pt_sale_payments (knack_id, sale_id, paid_on, receipt_number, amount, method, file)
  select r.record_id,
         (select s.id from public.pt_sales s where s.knack_id = coalesce(pt_private.k_ref(r.data,'field_103'), pt_private.k_ref(r.data,'field_250'))),
         coalesce(pt_private.k_date(r.data,'field_101'), date '2025-01-01'), pt_private.k_text(r.data,'field_100'),
         pt_private.k_num(r.data,'field_102'), pt_private.k_text(r.data,'field_253'), pt_private.k_file(r.data,'field_293')
  from knack_backup.records r where r.table_key = 'object_15'
  on conflict (knack_id) do update set sale_id = excluded.sale_id, paid_on = excluded.paid_on,
    receipt_number = excluded.receipt_number, amount = excluded.amount, method = excluded.method, file = excluded.file;
  get diagnostics n = row_count; out := out || jsonb_build_object('cobros', n);

  -- Gastos de venta
  insert into public.pt_sale_expenses (knack_id, sale_id, description, amount)
  select r.record_id,
         (select s.id from public.pt_sales s where s.knack_id = coalesce(pt_private.k_ref(r.data,'field_232'), pt_private.k_ref(r.data,'field_254'), pt_private.k_ref(r.data,'field_255'))),
         coalesce(pt_private.k_text(r.data,'field_229'), '(sin descripción)'), coalesce(pt_private.k_num(r.data,'field_231'), 0)
  from knack_backup.records r where r.table_key = 'object_25'
  on conflict (knack_id) do update set sale_id = excluded.sale_id, description = excluded.description, amount = excluded.amount;
  get diagnostics n = row_count; out := out || jsonb_build_object('gastos_venta', n);

  -- Pagos de comisiones al vendedor
  insert into public.pt_commission_payments (knack_id, seller_id, paid_on, amount, method)
  select r.record_id, (select s.id from public.pt_sellers s where s.knack_id = pt_private.k_ref(r.data,'field_105')),
         pt_private.k_date(r.data,'field_110'), coalesce(pt_private.k_num(r.data,'field_107'), 0), pt_private.k_text(r.data,'field_109')
  from knack_backup.records r where r.table_key = 'object_16'
  on conflict (knack_id) do update set seller_id = excluded.seller_id, paid_on = excluded.paid_on,
    amount = excluded.amount, method = excluded.method;
  get diagnostics n = row_count; out := out || jsonb_build_object('pagos_comision', n);

  insert into public.pt_commission_payment_sales (payment_id, sale_id)
  select cp.id, s.id
  from knack_backup.records r
  join public.pt_commission_payments cp on cp.knack_id = r.record_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.data->'field_106_raw') = 'array' then r.data->'field_106_raw' else '[]'::jsonb end) e
  join public.pt_sales s on s.knack_id = e->>'id'
  where r.table_key = 'object_16'
  on conflict do nothing;

  -- Otras comisiones
  insert into public.pt_other_commission_people (knack_id, name, email)
  select r.record_id, coalesce(pt_private.k_text(r.data,'field_412'), '(sin nombre)'), nullif(r.data->'field_432_raw'->>'email', '')
  from knack_backup.records r where r.table_key = 'object_36'
  on conflict (knack_id) do update set name = excluded.name, email = excluded.email;

  insert into public.pt_other_commissions (knack_id, person_id, month_label, invoice_number, agroquim_billing, agroquim_rate,
                                           other_billing, other_rate, status, invoice_file, payment_file)
  select r.record_id, (select p.id from public.pt_other_commission_people p where p.knack_id = pt_private.k_ref(r.data,'field_415')),
         pt_private.k_text(r.data,'field_404'), pt_private.k_text(r.data,'field_416'),
         coalesce(pt_private.k_num(r.data,'field_405'), 0), coalesce(pt_private.k_num(r.data,'field_406'), 0),
         coalesce(pt_private.k_num(r.data,'field_408'), 0), coalesce(pt_private.k_num(r.data,'field_409'), 0),
         case when lower(coalesce(pt_private.k_text(r.data,'field_418'), '')) = 'pagado' then 'pagado' else 'pendiente' end,
         pt_private.k_file(r.data,'field_417'), pt_private.k_file(r.data,'field_434')
  from knack_backup.records r where r.table_key = 'object_35'
  on conflict (knack_id) do update set person_id = excluded.person_id, month_label = excluded.month_label,
    invoice_number = excluded.invoice_number, agroquim_billing = excluded.agroquim_billing, agroquim_rate = excluded.agroquim_rate,
    other_billing = excluded.other_billing, other_rate = excluded.other_rate, status = excluded.status,
    invoice_file = excluded.invoice_file, payment_file = excluded.payment_file;
  get diagnostics n = row_count; out := out || jsonb_build_object('otras_comisiones', n);

  -- Solo consulta: siembra, tomate y comisiones de vendedor superior
  insert into public.pt_history (knack_id, kind, data)
  select r.record_id,
         case r.table_key when 'object_26' then 'siembra' when 'object_33' then 'venta_tomate'
                          when 'object_30' then 'comision_superior' when 'object_34' then 'pago_comision_superior'
                          when 'object_28' then 'vendedor_superior' end,
         r.data
  from knack_backup.records r where r.table_key in ('object_26','object_33','object_30','object_34','object_28')
  on conflict (knack_id) do update set kind = excluded.kind, data = excluded.data;
  get diagnostics n = row_count; out := out || jsonb_build_object('historial', n);

  return out;
end;
$$;

revoke all on function pt_private.migrate_from_knack() from public, anon, authenticated;
