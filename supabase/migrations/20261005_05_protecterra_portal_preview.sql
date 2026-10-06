-- Vista previa del portal del vendedor para el administrador.
-- El contenido del portal vive en una sola función; el vendedor ve el suyo y el administrador puede ver el de cualquiera.

create or replace function pt_private.seller_portal_data(v_seller uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
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
  )
$fn$;

create or replace function public.pt_seller_portal() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare v_seller uuid := pt_private.app_seller_id();
begin
  if pt_private.app_role() is distinct from 'vendedor' or v_seller is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return pt_private.seller_portal_data(v_seller);
end $fn$;

create or replace function public.pt_seller_portal_preview(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform pt_private.require_admin();
  if not exists (select 1 from public.pt_sellers where id = p_seller) then
    raise exception 'Vendedor inválido';
  end if;
  return pt_private.seller_portal_data(p_seller);
end $fn$;

revoke all on all functions in schema pt_private from public, anon;
revoke all on function public.pt_seller_portal_preview(uuid) from public, anon;
grant execute on function public.pt_seller_portal_preview(uuid) to authenticated;
