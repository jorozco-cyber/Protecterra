-- Firma de facturas por el cliente: el administrador envía un enlace privado con la factura,
-- el cliente la revisa en su teléfono, escribe su nombre y cédula y firma en el campo de la factura.
-- El cliente no tiene cuenta: el enlace largo y privado es la llave, vence a los 7 días y sirve una sola vez.
-- La versión firmada del PDF la arma y la guarda sola la app del administrador.
-- (Importagro tiene la misma estructura con prefijo ia_.)

create table if not exists public.pt_invoice_signatures (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.pt_sales(id),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status text not null default 'enviado' check (status in ('enviado', 'firmado', 'anulado')),
  -- Foto fija de la factura al momento de enviarla: lo que se firma no cambia después.
  invoice_number integer,
  customer_name text not null,
  sale_date date not null,
  kind text not null,
  due_date date,
  total numeric(16,2) not null,
  file jsonb not null,
  view_url text not null,
  -- Lugar del campo de firma: página (desde 1) y recuadro en fracciones de la página, desde arriba a la izquierda.
  placement jsonb not null,
  expires_at timestamptz not null default now() + interval '7 days',
  signer_name text,
  signer_id text,
  signature jsonb,
  signed_at timestamptz,
  signed_ip text,
  signed_agent text,
  signed_file jsonb,
  admin_seen_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  voided_at timestamptz,
  voided_reason text
);
create index if not exists pt_invoice_signatures_sale_idx on public.pt_invoice_signatures(sale_id);
-- Una factura no puede tener dos enlaces vivos ni dos firmas vigentes a la vez.
create unique index if not exists pt_invoice_signatures_one_live
  on public.pt_invoice_signatures(sale_id) where status in ('enviado', 'firmado');

alter table public.pt_invoice_signatures enable row level security;
drop policy if exists pt_admin_all on public.pt_invoice_signatures;
create policy pt_admin_all on public.pt_invoice_signatures for all to authenticated
  using ((select pt_private.app_role()) = 'admin') with check ((select pt_private.app_role()) = 'admin');
revoke all on public.pt_invoice_signatures from anon, authenticated;
grant select on public.pt_invoice_signatures to authenticated;
grant update (signed_file, admin_seen_at, email_sent_at) on public.pt_invoice_signatures to authenticated;

create or replace function pt_private.valid_placement(p jsonb) returns boolean
language sql immutable set search_path = '' as $fn$
  select jsonb_typeof(p) = 'object'
     and jsonb_typeof(p->'page') = 'number' and (p->>'page')::numeric between 1 and 50
     and jsonb_typeof(p->'x') = 'number' and jsonb_typeof(p->'y') = 'number'
     and jsonb_typeof(p->'w') = 'number' and jsonb_typeof(p->'h') = 'number'
     and (p->>'w')::numeric between 0.05 and 1 and (p->>'h')::numeric between 0.02 and 1
     and (p->>'x')::numeric between 0 and 1 and (p->>'y')::numeric between 0 and 1
     and (p->>'x')::numeric + (p->>'w')::numeric <= 1.001
     and (p->>'y')::numeric + (p->>'h')::numeric <= 1.001
$fn$;

-- Crea el enlace de firma de una factura. Si había uno pendiente, queda reemplazado.
-- También recuerda el lugar de la firma para las próximas facturas.
create or replace function public.pt_create_invoice_signature(p_sale uuid, p_placement jsonb, p_view_url text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v public.pt_v_sales; v_row public.pt_invoice_signatures;
begin
  perform pt_private.require_admin();
  select * into v from public.pt_v_sales where id = p_sale;
  if not found then raise exception 'Factura inválida'; end if;
  if v.voided_at is not null then raise exception 'La venta está anulada'; end if;
  if coalesce(v.invoice_file->>'path', '') = '' then
    raise exception 'Primero sube la factura digital de esta venta';
  end if;
  if not pt_private.valid_placement(p_placement) then
    raise exception 'Marca en la factura el lugar de la firma';
  end if;
  if p_view_url is null or p_view_url !~ '^https://[^/]+/storage/v1/object/sign/' then
    raise exception 'No se pudo preparar la factura para el cliente. Intenta de nuevo';
  end if;
  if exists (select 1 from public.pt_invoice_signatures where sale_id = p_sale and status = 'firmado') then
    raise exception 'Esta factura ya está firmada. Si necesitas otra firma, anula la anterior';
  end if;

  update public.pt_invoice_signatures
     set status = 'anulado', voided_at = now(), voided_reason = 'Reemplazado por un enlace nuevo'
   where sale_id = p_sale and status = 'enviado';

  insert into public.pt_invoice_signatures
    (sale_id, invoice_number, customer_name, sale_date, kind, due_date, total, file, view_url, placement, created_by)
  values (p_sale, v.invoice_number, v.customer_name, v.sale_date, v.kind, v.due_date, round(v.total, 2),
          jsonb_build_object('path', v.invoice_file->>'path', 'mime', coalesce(v.invoice_file->>'mime', 'application/pdf'),
                             'filename', coalesce(v.invoice_file->>'filename', 'factura.pdf')),
          p_view_url, p_placement, auth.uid())
  returning * into v_row;

  insert into public.pt_settings (key, value, updated_at)
  values ('invoice_signature_spot', p_placement, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  perform pt_private.audit('enviar_firma', 'factura', p_sale,
    jsonb_build_object('factura', v.invoice_number, 'cliente', v.customer_name));
  return jsonb_build_object('id', v_row.id, 'token', v_row.token, 'expires_at', v_row.expires_at);
end $fn$;

-- Lo que ve quien abre el enlace. Solo el propio documento, nada más de la empresa.
create or replace function public.pt_invoice_signature_public(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare r public.pt_invoice_signatures;
begin
  select * into r from public.pt_invoice_signatures where token = p_token and length(p_token) >= 32;
  if not found or r.status = 'anulado' then
    raise exception 'Este enlace ya no está disponible. Pida uno nuevo a ProtecTerra' using errcode = 'P0001';
  end if;
  if r.status = 'enviado' and r.expires_at < now() then
    raise exception 'Este enlace venció. Pida uno nuevo a ProtecTerra' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'company', 'ProtecTerra', 'currency', 'C$', 'token', r.token, 'status', r.status,
    'invoice_number', r.invoice_number, 'customer_name', r.customer_name, 'sale_date', r.sale_date,
    'kind', r.kind, 'due_date', r.due_date, 'total', r.total,
    'mime', r.file->>'mime', 'view_url', r.view_url, 'placement', r.placement, 'expires_at', r.expires_at,
    'signer_name', r.signer_name, 'signer_id', r.signer_id, 'signature', r.signature, 'signed_at', r.signed_at);
end $fn$;

-- Firma del cliente. Queda registrado quién (nombre y cédula), cuándo y desde qué dispositivo.
create or replace function public.pt_sign_invoice(p_token text, p_name text, p_id_number text, p_signature jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  r public.pt_invoice_signatures;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_id text := upper(regexp_replace(coalesce(p_id_number, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  select * into r from public.pt_invoice_signatures where token = p_token and length(p_token) >= 32 for update;
  if not found or r.status = 'anulado' then raise exception 'Este enlace ya no está disponible'; end if;
  if r.status <> 'enviado' then raise exception 'Esta factura ya fue firmada'; end if;
  if r.expires_at < now() then raise exception 'Este enlace venció. Pida uno nuevo a ProtecTerra'; end if;
  if length(btrim(coalesce(p_name, ''))) < 5 or length(p_name) > 120 or btrim(p_name) !~ '\S+\s+\S+' then
    raise exception 'Escriba su nombre completo (nombre y apellido)';
  end if;
  -- Cédula nicaragüense: 13 dígitos y una letra (001-010190-0001A). Se guarda con guiones.
  if v_id ~ '^[0-9]{13}[A-Z]$' then
    v_id := substr(v_id, 1, 3) || '-' || substr(v_id, 4, 6) || '-' || substr(v_id, 10, 5);
  else
    raise exception 'Escriba su número de cédula completo, por ejemplo 001-010190-0001A';
  end if;
  if jsonb_typeof(p_signature->'strokes') is distinct from 'array'
     or jsonb_array_length(p_signature->'strokes') = 0
     or length(p_signature::text) < 60 then
    raise exception 'Dibuje su firma antes de continuar';
  end if;
  if length(p_signature::text) > 200000 then raise exception 'La firma es demasiado grande. Bórrela y vuelva a firmar'; end if;

  update public.pt_invoice_signatures
     set status = 'firmado', signer_name = btrim(p_name), signer_id = v_id, signature = p_signature, signed_at = now(),
         signed_ip = left(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), 60),
         signed_agent = left(coalesce(v_headers->>'user-agent', ''), 300)
   where id = r.id;
  insert into public.pt_audit_log (user_id, action, entity, entity_id, detail)
  values (auth.uid(), 'firmar', 'factura', r.sale_id,
          jsonb_build_object('factura', r.invoice_number, 'firmante', btrim(p_name), 'cedula', v_id));
  return public.pt_invoice_signature_public(p_token);
end $fn$;

-- Anula un enlace pendiente o una firma ya hecha (por ejemplo, para pedirla otra vez).
create or replace function public.pt_void_invoice_signature(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare r public.pt_invoice_signatures;
begin
  perform pt_private.require_admin();
  if nullif(btrim(p_reason), '') is null then raise exception 'Escribe el motivo de la anulación'; end if;
  update public.pt_invoice_signatures
     set status = 'anulado', voided_at = now(), voided_reason = btrim(p_reason)
   where id = p_id and status in ('enviado', 'firmado')
  returning * into r;
  if not found then raise exception 'Este enlace ya estaba anulado'; end if;
  perform pt_private.audit('anular_firma', 'factura', r.sale_id,
    jsonb_build_object('factura', r.invoice_number, 'motivo', btrim(p_reason)));
end $fn$;

revoke all on function pt_private.valid_placement(jsonb) from public, anon;
grant execute on function pt_private.valid_placement(jsonb) to authenticated;
revoke all on function public.pt_create_invoice_signature(uuid, jsonb, text), public.pt_void_invoice_signature(uuid, text)
  from public, anon;
grant execute on function public.pt_create_invoice_signature(uuid, jsonb, text), public.pt_void_invoice_signature(uuid, text)
  to authenticated;
-- Abrir y firmar no requiere cuenta: el enlace largo y privado es la llave.
revoke all on function public.pt_invoice_signature_public(text), public.pt_sign_invoice(text, text, text, jsonb) from public;
grant execute on function public.pt_invoice_signature_public(text), public.pt_sign_invoice(text, text, text, jsonb)
  to anon, authenticated;
