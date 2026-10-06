-- Archivos propios: facturas, recibos y comprobantes dejan de vivir en Knack.
-- Se guardan en un almacén privado; solo el administrador los lee y sube.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('protecterra', 'protecterra', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists pt_files_read on storage.objects;
create policy pt_files_read on storage.objects for select to authenticated
  using (bucket_id = 'protecterra' and (select pt_private.app_role()) = 'admin');
drop policy if exists pt_files_upload on storage.objects;
create policy pt_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'protecterra' and (select pt_private.app_role()) = 'admin');

-- El administrador puede adjuntar el comprobante a un cobro o a un pago ya registrado.
grant update (file) on public.pt_sale_payments, public.pt_purchase_payments to authenticated;

-- Al volver a traer datos de Knack, un archivo que ya está en el almacén propio no se pisa.
create or replace function pt_private.keep_file(ours jsonb, theirs jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when ours->>'path' is not null then ours else theirs end
$$;

do $$
declare
  def text := pg_get_functiondef('pt_private.migrate_from_knack()'::regprocedure);
  r record;
begin
  for r in select * from (values
    ('due_date = excluded.due_date, invoice_file = excluded.invoice_file, receipt_file = excluded.receipt_file;',
     'due_date = excluded.due_date, invoice_file = pt_private.keep_file(pt_purchases.invoice_file, excluded.invoice_file), receipt_file = pt_private.keep_file(pt_purchases.receipt_file, excluded.receipt_file);'),
    ('description = excluded.description, amount = excluded.amount, method = excluded.method, file = excluded.file;',
     'description = excluded.description, amount = excluded.amount, method = excluded.method, file = pt_private.keep_file(pt_purchase_payments.file, excluded.file);'),
    ('superior_seller = excluded.superior_seller, invoice_file = excluded.invoice_file, receipt_file = excluded.receipt_file;',
     'superior_seller = excluded.superior_seller, invoice_file = pt_private.keep_file(pt_sales.invoice_file, excluded.invoice_file), receipt_file = pt_private.keep_file(pt_sales.receipt_file, excluded.receipt_file);'),
    ('receipt_number = excluded.receipt_number, amount = excluded.amount, method = excluded.method, file = excluded.file;',
     'receipt_number = excluded.receipt_number, amount = excluded.amount, method = excluded.method, file = pt_private.keep_file(pt_sale_payments.file, excluded.file);'),
    ('invoice_file = excluded.invoice_file, payment_file = excluded.payment_file;',
     'invoice_file = pt_private.keep_file(pt_other_commissions.invoice_file, excluded.invoice_file), payment_file = pt_private.keep_file(pt_other_commissions.payment_file, excluded.payment_file);')
  ) as v(old, new) loop
    if position(r.old in def) > 0 then
      def := replace(def, r.old, r.new);
    elsif position(r.new in def) = 0 then
      raise exception 'No se encontró el texto esperado en migrate_from_knack: %', r.old;
    end if;
  end loop;
  execute def;
end $$;

-- Trabajo de copia Knack → almacén propio. Solo lo usa la función de copia, con una clave guardada en el vault.
create or replace function pt_private.files_job_check(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token = '' or not exists (
    select 1 from vault.decrypted_secrets where name = 'pt_files_job_token' and decrypted_secret = p_token
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
end $$;

create or replace view pt_private.v_file_slots with (security_invoker = true) as
  select 'pt_purchases'::text t, id, 'receipt_file'::text c, receipt_file f from public.pt_purchases
  union all select 'pt_purchases', id, 'invoice_file', invoice_file from public.pt_purchases
  union all select 'pt_purchase_payments', id, 'file', file from public.pt_purchase_payments
  union all select 'pt_sales', id, 'invoice_file', invoice_file from public.pt_sales
  union all select 'pt_sales', id, 'receipt_file', receipt_file from public.pt_sales
  union all select 'pt_sale_payments', id, 'file', file from public.pt_sale_payments
  union all select 'pt_other_commissions', id, 'invoice_file', invoice_file from public.pt_other_commissions
  union all select 'pt_other_commissions', id, 'payment_file', payment_file from public.pt_other_commissions;

create or replace function public.pt_files_pending(p_token text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.files_job_check(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('t', s.t, 'id', s.id, 'c', s.c, 'f', s.f))
    from (
      select * from pt_private.v_file_slots
      where f->>'url' is not null and f->>'path' is null and coalesce((f->>'copy_attempts')::integer, 0) < 3
      order by coalesce((f->>'copy_attempts')::integer, 0), id
      limit greatest(p_limit, 0)
    ) s
  ), '[]'::jsonb);
end $$;

create or replace function public.pt_files_mark(p_token text, p_table text, p_id uuid, p_column text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pt_private.files_job_check(p_token);
  if not exists (select 1 from pt_private.v_file_slots where t = p_table and c = p_column and id = p_id) then
    raise exception 'Archivo inválido';
  end if;
  if p_patch ? 'path' then
    -- Copiado: se quitan las direcciones temporales de Knack; la dirección original queda como referencia.
    execute format(
      'update public.%I set %I = (%I - ''signed_url'' - ''signed_url_inline'' - ''thumb_url'' - ''copy_error'' - ''copy_attempts'') || $1 where id = $2',
      p_table, p_column, p_column) using p_patch, p_id;
  else
    execute format('update public.%I set %I = %I || $1 where id = $2', p_table, p_column, p_column) using p_patch, p_id;
  end if;
end $$;

revoke all on all functions in schema pt_private from public, anon;
revoke all on function public.pt_files_pending(text, integer), public.pt_files_mark(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.pt_files_pending(text, integer), public.pt_files_mark(text, uuid, text, jsonb) to service_role;
