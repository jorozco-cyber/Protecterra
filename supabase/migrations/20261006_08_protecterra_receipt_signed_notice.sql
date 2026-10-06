-- Aviso al administrador cuando un recibo queda firmado. Se entrega una sola vez por recibo.
alter table public.pt_commission_receipts add column if not exists admin_notified_at timestamptz;

create or replace function public.pt_receipt_signed_notice(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare r public.pt_commission_receipts;
begin
  select * into r from public.pt_commission_receipts where token = p_token and length(p_token) >= 32 for update;
  if not found then return null; end if;
  perform pt_private.receipt_access(r.seller_id, false);
  if r.status <> 'firmado' or r.admin_notified_at is not null then return null; end if;
  update public.pt_commission_receipts set admin_notified_at = now() where id = r.id;
  return jsonb_build_object(
    'number', r.number, 'seller_name', r.seller_name, 'signer_name', r.signer_name,
    'total_commission', r.total_commission, 'invoices', jsonb_array_length(r.items), 'signed_at', r.signed_at,
    'admins', coalesce((select value from public.pt_settings where key = 'admin_emails'), '[]'::jsonb));
end $fn$;

revoke all on function public.pt_receipt_signed_notice(text) from public, anon;
grant execute on function public.pt_receipt_signed_notice(text) to authenticated;
