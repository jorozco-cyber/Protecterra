-- Los recibos de comisión ya no se abren solo con el enlace: hay que iniciar sesión.
-- Lo ve el administrador o el vendedor dueño del recibo; solo ese vendedor puede firmarlo.

create or replace function pt_private.receipt_access(p_seller uuid, p_sign boolean) returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para ver este documento' using errcode = 'P0001';
  end if;
  if pt_private.app_seller_id() is not distinct from p_seller then return; end if;
  if not p_sign and pt_private.app_role() = 'admin' then return; end if;
  -- A otra cuenta no se le da ninguna pista de que el documento existe.
  raise exception 'Este documento no está disponible' using errcode = 'P0001';
end $fn$;

create or replace function public.pt_commission_receipt_public(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare r public.pt_commission_receipts;
begin
  select * into r from public.pt_commission_receipts where token = p_token and length(p_token) >= 32;
  if not found or r.status = 'anulado' then
    raise exception 'Este documento no está disponible' using errcode = 'P0001';
  end if;
  perform pt_private.receipt_access(r.seller_id, false);
  return jsonb_build_object(
    'number', r.number, 'status', r.status, 'created_at', r.created_at, 'token', r.token,
    'seller_name', r.seller_name, 'items', r.items,
    'total_sales', r.total_sales, 'total_commission', r.total_commission,
    'issuer_name', r.issuer_name, 'issuer_signature', r.issuer_signature,
    'signer_name', r.signer_name, 'signature', r.signature, 'signed_at', r.signed_at,
    'can_sign', pt_private.app_seller_id() is not distinct from r.seller_id);
end $fn$;

create or replace function public.pt_sign_commission_receipt(p_token text, p_name text, p_signature jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  r public.pt_commission_receipts;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  select * into r from public.pt_commission_receipts where token = p_token and length(p_token) >= 32 for update;
  if not found or r.status = 'anulado' then raise exception 'Este documento no está disponible'; end if;
  perform pt_private.receipt_access(r.seller_id, true);
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

revoke all on all functions in schema pt_private from public, anon;
revoke all on function public.pt_commission_receipt_public(text), public.pt_sign_commission_receipt(text, text, jsonb) from public, anon;
grant execute on function public.pt_commission_receipt_public(text), public.pt_sign_commission_receipt(text, text, jsonb) to authenticated;
