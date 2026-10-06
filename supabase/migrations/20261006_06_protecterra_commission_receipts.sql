-- Recibos de comisión con firma: el administrador arma el recibo con las facturas recuperadas,
-- el vendedor lo firma desde un enlace privado y después se registra el pago.

create table if not exists public.pt_commission_receipts (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  seller_id uuid not null references public.pt_sellers(id),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status text not null default 'enviado' check (status in ('enviado', 'firmado', 'pagado', 'anulado')),
  items jsonb not null,
  total_sales numeric(16,2) not null,
  total_commission numeric(16,2) not null,
  seller_name text not null,
  issuer_name text not null,
  issuer_signature jsonb,
  signer_name text,
  signature jsonb,
  signed_at timestamptz,
  signed_ip text,
  signed_agent text,
  payment_id uuid references public.pt_commission_payments(id),
  email_sent_at timestamptz,
  file jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  voided_at timestamptz,
  voided_reason text
);
create index if not exists pt_commission_receipts_seller_idx on public.pt_commission_receipts(seller_id);

alter table public.pt_commission_receipts enable row level security;
create policy pt_admin_all on public.pt_commission_receipts for all to authenticated
  using ((select pt_private.app_role()) = 'admin') with check ((select pt_private.app_role()) = 'admin');
revoke all on public.pt_commission_receipts from anon, authenticated;
grant select on public.pt_commission_receipts to authenticated;
grant update (file, email_sent_at) on public.pt_commission_receipts to authenticated;

-- Crea el recibo con una foto fija de las facturas elegidas (para que el documento no cambie después).
create or replace function public.pt_create_commission_receipt(p_seller uuid, p_sales uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_items jsonb; v_count integer; v_total numeric; v_commission numeric;
  v_seller text; v_issuer jsonb; v_row public.pt_commission_receipts;
begin
  perform pt_private.require_admin();
  select name into v_seller from public.pt_sellers where id = p_seller;
  if not found then raise exception 'Vendedor inválido'; end if;
  select value into v_issuer from public.pt_settings where key = 'issuer_signature';
  if v_issuer is null or coalesce(jsonb_array_length(v_issuer->'signature'->'strokes'), 0) = 0 then
    raise exception 'Primero guarda tu firma en Comisiones, botón "Mi firma"';
  end if;

  select count(*), coalesce(sum(round(v.total, 2)), 0), coalesce(sum(round(v.commission, 2)), 0),
         jsonb_agg(jsonb_build_object(
           'sale_id', v.id, 'invoice_number', v.invoice_number, 'customer_name', v.customer_name,
           'sale_date', v.sale_date,
           'recovered_on', (select max(sp.paid_on) from public.pt_sale_payments sp where sp.sale_id = v.id and sp.voided_at is null),
           'total', round(v.total, 2), 'commission', round(v.commission, 2)
         ) order by v.customer_name, v.invoice_number)
    into v_count, v_total, v_commission, v_items
  from public.pt_v_sales v
  where v.id = any(p_sales) and v.seller_id = p_seller and v.voided_at is null
    and v.commission_status = 'pendiente' and v.payment_status = 'pagado';
  if v_count = 0 or v_count <> coalesce(array_length(p_sales, 1), 0) then
    raise exception 'Solo se pueden incluir facturas de este vendedor que ya estén cobradas completas y con la comisión pendiente';
  end if;
  if exists (
    select 1 from public.pt_commission_receipts r, jsonb_array_elements(r.items) i
    where r.status in ('enviado', 'firmado') and (i->>'sale_id')::uuid = any(p_sales)
  ) then
    raise exception 'Alguna de estas facturas ya está en otro recibo pendiente. Anula ese recibo o quítala de la selección';
  end if;

  insert into public.pt_commission_receipts
    (seller_id, items, total_sales, total_commission, seller_name, issuer_name, issuer_signature, created_by)
  values (p_seller, v_items, v_total, v_commission, v_seller,
          coalesce(nullif(btrim(v_issuer->>'name'), ''), 'ProtecTerra'), v_issuer->'signature', auth.uid())
  returning * into v_row;
  perform pt_private.audit('crear', 'recibo_comision', v_row.id,
    jsonb_build_object('numero', v_row.number, 'monto', v_commission, 'facturas', v_count));
  return jsonb_build_object('id', v_row.id, 'number', v_row.number, 'token', v_row.token);
end $fn$;

-- Lo que ve quien abre el enlace para firmar. No expone nada más que el propio documento.
create or replace function public.pt_commission_receipt_public(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare r public.pt_commission_receipts;
begin
  select * into r from public.pt_commission_receipts where token = p_token and length(p_token) >= 32;
  if not found or r.status = 'anulado' then
    raise exception 'Este documento no está disponible' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'number', r.number, 'status', r.status, 'created_at', r.created_at, 'token', r.token,
    'seller_name', r.seller_name, 'items', r.items,
    'total_sales', r.total_sales, 'total_commission', r.total_commission,
    'issuer_name', r.issuer_name, 'issuer_signature', r.issuer_signature,
    'signer_name', r.signer_name, 'signature', r.signature, 'signed_at', r.signed_at);
end $fn$;

-- Firma del vendedor. Queda registrado quién, cuándo y desde dónde.
create or replace function public.pt_sign_commission_receipt(p_token text, p_name text, p_signature jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  r public.pt_commission_receipts;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  select * into r from public.pt_commission_receipts where token = p_token and length(p_token) >= 32 for update;
  if not found or r.status = 'anulado' then raise exception 'Este documento no está disponible'; end if;
  if r.status <> 'enviado' then raise exception 'Este documento ya fue firmado'; end if;
  if length(btrim(coalesce(p_name, ''))) < 3 or length(p_name) > 120 then
    raise exception 'Escribe tu nombre completo';
  end if;
  if jsonb_typeof(p_signature->'strokes') is distinct from 'array'
     or jsonb_array_length(p_signature->'strokes') = 0
     or length(p_signature::text) < 60 then
    raise exception 'Dibuja tu firma antes de continuar';
  end if;
  if length(p_signature::text) > 200000 then raise exception 'La firma es demasiado grande. Bórrala y vuelve a firmar'; end if;
  update public.pt_commission_receipts
     set status = 'firmado', signer_name = btrim(p_name), signature = p_signature, signed_at = now(),
         signed_ip = left(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), 60),
         signed_agent = left(coalesce(v_headers->>'user-agent', ''), 300)
   where id = r.id;
  insert into public.pt_audit_log (user_id, action, entity, entity_id, detail)
  values (auth.uid(), 'firmar', 'recibo_comision', r.id, jsonb_build_object('numero', r.number, 'firmante', btrim(p_name)));
  return public.pt_commission_receipt_public(p_token);
end $fn$;

create or replace function public.pt_void_commission_receipt(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform pt_private.require_admin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  update public.pt_commission_receipts
     set status = 'anulado', voided_at = now(), voided_reason = btrim(p_reason)
   where id = p_id and status in ('enviado', 'firmado');
  if not found then raise exception 'El recibo no existe, ya está pagado o ya estaba anulado'; end if;
  perform pt_private.audit('anular', 'recibo_comision', p_id, jsonb_build_object('motivo', btrim(p_reason)));
end $fn$;

-- Pago de un recibo ya firmado: registra el pago de comisión de sus facturas y deja el recibo como pagado.
create or replace function public.pt_pay_commission_receipt(p_id uuid, p_date date, p_method text) returns numeric
language plpgsql security definer set search_path = '' as $fn$
declare r public.pt_commission_receipts; v_sales uuid[]; v_amount numeric; v_payment uuid;
begin
  perform pt_private.require_admin();
  select * into r from public.pt_commission_receipts where id = p_id for update;
  if not found then raise exception 'Recibo inválido'; end if;
  if r.status <> 'firmado' then raise exception 'El recibo debe estar firmado por el vendedor antes de pagarlo'; end if;
  select array_agg((i->>'sale_id')::uuid) into v_sales from jsonb_array_elements(r.items) i;
  v_amount := public.pt_pay_commissions(r.seller_id, v_sales, p_date, p_method);
  select id into v_payment from public.pt_commission_payments
   where seller_id = r.seller_id order by created_at desc limit 1;
  update public.pt_commission_receipts set status = 'pagado', payment_id = v_payment where id = p_id;
  return v_amount;
end $fn$;

-- El portal del vendedor también trae sus recibos (para firmar o descargar).
create or replace function public.pt_seller_receipts(v_seller uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'number', r.number, 'token', r.token, 'status', r.status, 'created_at', r.created_at,
    'total_commission', r.total_commission, 'signed_at', r.signed_at,
    'invoices', jsonb_array_length(r.items)) order by r.created_at desc), '[]'::jsonb)
  from public.pt_commission_receipts r where r.seller_id = v_seller and r.status <> 'anulado'
$fn$;

create or replace function public.pt_seller_portal() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare v_seller uuid := pt_private.app_seller_id();
begin
  if pt_private.app_role() is distinct from 'vendedor' or v_seller is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return pt_private.seller_portal_data(v_seller) || jsonb_build_object('receipts', public.pt_seller_receipts(v_seller));
end $fn$;

create or replace function public.pt_seller_portal_preview(p_seller uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform pt_private.require_admin();
  if not exists (select 1 from public.pt_sellers where id = p_seller) then
    raise exception 'Vendedor inválido';
  end if;
  return pt_private.seller_portal_data(p_seller) || jsonb_build_object('receipts', public.pt_seller_receipts(p_seller));
end $fn$;

revoke all on function public.pt_create_commission_receipt(uuid, uuid[]), public.pt_void_commission_receipt(uuid, text),
  public.pt_pay_commission_receipt(uuid, date, text) from public, anon;
grant execute on function public.pt_create_commission_receipt(uuid, uuid[]), public.pt_void_commission_receipt(uuid, text),
  public.pt_pay_commission_receipt(uuid, date, text) to authenticated;
revoke all on function public.pt_seller_receipts(uuid) from public, anon, authenticated;
-- Abrir y firmar por enlace no requiere cuenta: el enlace largo y privado es la llave.
grant execute on function public.pt_commission_receipt_public(text), public.pt_sign_commission_receipt(text, text, jsonb) to anon, authenticated;
