-- Pruebas de reglas de operación. Corre dentro de una transacción y no deja nada guardado.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email, email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000001','admin@test.local', now()),
 ('00000000-0000-0000-0000-000000000002','vendedor@test.local', now()),
 ('00000000-0000-0000-0000-000000000003','nadie@test.local', now());
insert into public.pt_settings(key,value) values ('admin_emails','["admin@test.local"]') on conflict (key) do update set value = excluded.value;
update public.pt_sellers set email='vendedor@test.local', portal_enabled=true where name like 'Aristeo%';

create temp table t(k text primary key, v text) on commit drop;
grant all on t to authenticated;
insert into t select 'totals0', (select round(sum(total),2)||'/'||round(sum(balance),2) from pt_v_sales where voided_at is null)||'/'||(select sum(qty_available) from pt_v_lots);

create or replace function pg_temp.fails(sql text, expect text) returns text language plpgsql as $$
begin
  execute sql;
  raise exception 'DEBIO FALLAR: %', sql;
exception when others then
  if sqlerrm like 'DEBIO FALLAR%' then raise; end if;
  if sqlerrm not ilike '%' || expect || '%' then raise exception 'Error inesperado: % (esperaba %)', sqlerrm, expect; end if;
  return 'ok: ' || sqlerrm;
end $$;

-- Producto de prueba con dos lotes: 5 a costo 100 (viejo) y 10 a costo 120 (nuevo)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into pt_products(id,name,unit_price) values ('10000000-0000-0000-0000-000000000001','PRUEBA FIFO',150);
select pt_create_purchase('{"purchase_date":"2026-09-01","supplier_name":"Proveedor Prueba","kind":"credito","lots":[{"product_id":"10000000-0000-0000-0000-000000000001","qty":5,"unit_cost":100}]}') as compra1 \gset
select pt_create_purchase('{"purchase_date":"2026-09-10","supplier_name":"Proveedor Prueba","kind":"contado","lots":[{"product_id":"10000000-0000-0000-0000-000000000001","qty":10,"unit_cost":120}]}') as compra2 \gset
select 'compra credito saldo', balance, payment_status from pt_v_purchases where id = :'compra1';
select 'compra contado saldo', balance, payment_status from pt_v_purchases where id = :'compra2';

-- FIFO: vender 8 debe tomar 5 del lote viejo y 3 del nuevo
select pt_create_sale(jsonb_build_object('sale_date','2026-09-15','invoice_number',990001,'customer_id',(select id from pt_customers limit 1),
  'seller_id',(select id from pt_sellers where name like 'Aristeo%'),'kind','credito',
  'lines',jsonb_build_array(jsonb_build_object('product_id','10000000-0000-0000-0000-000000000001','qty',8,'unit_price',150)),
  'expenses',jsonb_build_array(jsonb_build_object('description','flete','amount',40)))) as venta1 \gset
select 'FIFO lineas', qty, unit_cost from pt_sale_lines where sale_id = :'venta1' order by unit_cost;
select 'venta1', total, cost, expenses, gross_profit, commission_rate, commission, balance, due_date from pt_v_sales where id = :'venta1';
select 'stock tras venta', qty_available from pt_v_products where id='10000000-0000-0000-0000-000000000001';

-- Bloqueos
select pg_temp.fails($q$select pt_create_sale(jsonb_build_object('sale_date','2026-09-16','customer_id',(select id from pt_customers limit 1),'lines',jsonb_build_array(jsonb_build_object('product_id','10000000-0000-0000-0000-000000000001','qty',8,'unit_price',150))))$q$, 'suficiente inventario');
select pg_temp.fails($q$select pt_create_sale(jsonb_build_object('sale_date','2026-09-05','customer_id',(select id from pt_customers limit 1),'lines',jsonb_build_array(jsonb_build_object('product_id','10000000-0000-0000-0000-000000000001','qty',1,'unit_price',150))))$q$, 'suficiente inventario');
select pg_temp.fails($q$select pt_create_sale(jsonb_build_object('sale_date','2026-09-16','invoice_number',990001,'customer_id',(select id from pt_customers limit 1),'lines',jsonb_build_array(jsonb_build_object('product_id','10000000-0000-0000-0000-000000000001','qty',1,'unit_price',150))))$q$, 'Ya existe una venta');
select pg_temp.fails($q$select pt_create_sale(jsonb_build_object('sale_date','2026-09-16','customer_id',(select id from pt_customers limit 1),'lines',jsonb_build_array(jsonb_build_object('product_id','10000000-0000-0000-0000-000000000001','qty',1,'unit_price',110))))$q$, 'BAJO_COSTO');
select pt_create_sale(jsonb_build_object('sale_date','2026-09-16','customer_id',(select id from pt_customers limit 1),'allow_below_cost',true,'kind','contado','paid_now',110,'method','Efectivo','lines',jsonb_build_array(jsonb_build_object('product_id','10000000-0000-0000-0000-000000000001','qty',1,'unit_price',110)))) as venta2 \gset
select 'venta contado pagada', total, balance, payment_status from pt_v_sales where id = :'venta2';

-- Cobros
select pg_temp.fails(format($q$select pt_add_sale_payment(%L, '2026-09-20', 5000, 'Efectivo', null)$q$, :'venta1'), 'mayor que el saldo');
select pt_add_sale_payment(:'venta1', '2026-09-20', 500, 'Transferencia', 'R-1') as cobro1 \gset
select 'tras cobro', paid, balance, payment_status from pt_v_sales where id = :'venta1';
select pg_temp.fails(format($q$select pt_void_sale(%L, 'error')$q$, :'venta1'), 'Anula primero los cobros');
select pg_temp.fails(format($q$select pt_void_sale_payment(%L, '')$q$, :'cobro1'), 'motivo');
select pt_void_sale_payment(:'cobro1', 'monto equivocado');
select pt_add_sale_payment(:'venta1', '2026-09-21', 1200, 'Efectivo', 'R-2');
select 'venta1 pagada', balance, payment_status from pt_v_sales where id = :'venta1';

-- Comisiones
select pt_pay_commissions((select id from pt_sellers where name like 'Aristeo%'), array[:'venta1']::uuid[], '2026-09-30', 'Transferencia') as comision_pagada;
select pg_temp.fails(format($q$select pt_pay_commissions((select id from pt_sellers where name like 'Aristeo%%'), array[%L]::uuid[], '2026-09-30', 'Transferencia')$q$, :'venta1'), 'ya tiene la comisión pagada');

-- Compras: pagos y anulación
select pg_temp.fails(format($q$select pt_add_purchase_payment(%L, '2026-09-20', 501, 'Efectivo', null)$q$, :'compra1'), 'mayor que el saldo');
select pt_add_purchase_payment(:'compra1', '2026-09-20', 500, 'Efectivo', null) as pago1 \gset
select 'compra1 pagada', balance, payment_status from pt_v_purchases where id = :'compra1';
select pg_temp.fails(format($q$select pt_void_purchase(%L, 'error')$q$, :'compra1'), 'ya se vendieron');

-- Anular la venta 2 devuelve el stock
select pt_void_sale_payment((select id from pt_sale_payments where sale_id = :'venta2'), 'prueba');
select pt_void_sale(:'venta2', 'prueba');
select 'stock tras anular venta2', qty_available from pt_v_products where id='10000000-0000-0000-0000-000000000001';

-- El vendedor no ve tablas ni costos; solo su portal
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
insert into t select 'vend_tablas', (select count(*) from pt_sales)::text || '/' || (select count(*) from pt_sale_lines) || '/' || (select count(*) from pt_v_sales) || '/' || (select count(*) from pt_lots) || '/' || (select count(*) from pt_customers);
insert into t select 'vend_me', pt_me()->>'role';
insert into t select 'vend_portal_ventas', jsonb_array_length(pt_seller_portal()->'sales')::text;
insert into t select 'vend_portal_costos', (pt_seller_portal()::text ~* 'cost|profit|utilidad')::text;
insert into t select 'vend_crear_venta', pg_temp.fails($q$select pt_create_sale('{}'::jsonb)$q$, 'No autorizado');
insert into t select 'vend_insert', pg_temp.fails($q$insert into pt_products(name) values ('x')$q$, 'row-level security');
-- Alguien con cuenta pero sin acceso
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
insert into t select 'nadie_tablas', (select count(*) from pt_sales)::text || '/' || (select count(*) from pt_v_products);
insert into t select 'nadie_me', coalesce(pt_me()->>'role','(sin rol)');
insert into t select 'nadie_portal', pg_temp.fails($q$select pt_seller_portal()$q$, 'No autorizado');
-- El administrador sí ve todo con su sesión normal
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into t select 'admin_tablas', (select count(*) from pt_sales)::text || '/' || (select count(*) from pt_v_sales) || '/' || (select count(*) from pt_v_lots);
update pt_products set min_required = 3 where id='10000000-0000-0000-0000-000000000001';
insert into t select 'admin_update', (select min_required::text from pt_products where id='10000000-0000-0000-0000-000000000001');
insert into t select 'admin_no_update_directo_ventas', pg_temp.fails($q$update pt_sales set commission_rate = 0$q$, 'permission denied');
reset role;
select * from t order by k;
select 'ventas de Aristeo', count(*) from pt_sales where seller_id = (select id from pt_sellers where name like 'Aristeo%') and voided_at is null;
select 'auditoria', action, entity, count(*) from pt_audit_log group by 1,2,3 order by 2,3;
rollback;
select 'totales intactos', (select round(sum(total),2)||'/'||round(sum(balance),2) from pt_v_sales where voided_at is null)||'/'||(select sum(qty_available) from pt_v_lots);
