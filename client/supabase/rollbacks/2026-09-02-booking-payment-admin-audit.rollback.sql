begin;

-- Restore the pre-hotfix payment review RPC. The append-only audit table and
-- existing rows are deliberately preserved so rollback cannot erase history.
create or replace function public.review_booking_bank_transfer(
  p_booking_request_id uuid,
  p_admin_profile_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  database_now timestamptz;
  requested_booking public.booking_requests%rowtype;
  payment_record public.booking_payment_records%rowtype;
  target_booking_status text;
  target_payment_status text;
begin
  if p_decision not in ('confirmed', 'cancelled') then
    raise exception using errcode = '22023', message = 'invalid_payment_review_decision';
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  limit 1;

  if requested_booking.id is null then
    return jsonb_build_object('ok', false, 'code', 'booking_not_found');
  end if;

  if p_decision = 'confirmed' then
    perform public.lock_villa_inventory_nights(requested_booking.check_in, requested_booking.check_out);
  end if;

  select request.*
  into requested_booking
  from public.booking_requests as request
  where request.id = p_booking_request_id
  for update;

  select payment.*
  into payment_record
  from public.booking_payment_records as payment
  where payment.booking_request_id = requested_booking.id
    and payment.payment_method = 'bank_transfer'
  for update;

  if payment_record.id is null then
    return jsonb_build_object('ok', false, 'code', 'payment_record_not_found');
  end if;

  target_booking_status := p_decision;
  target_payment_status := case when p_decision = 'confirmed' then 'verified' else 'rejected' end;

  if requested_booking.status = target_booking_status
    and payment_record.status = target_payment_status
  then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'request', to_jsonb(requested_booking),
      'payment_record', to_jsonb(payment_record)
    );
  end if;

  if requested_booking.status <> 'payment_review' or payment_record.status <> 'reported' then
    return jsonb_build_object('ok', false, 'code', 'payment_review_invalid_status');
  end if;

  database_now := clock_timestamp();

  if p_decision = 'confirmed'
    and requested_booking.review_expires_at <= database_now
  then
    return jsonb_build_object('ok', false, 'code', 'payment_review_expired');
  end if;

  update public.booking_requests
  set status = target_booking_status
  where id = requested_booking.id
  returning * into requested_booking;

  update public.booking_payment_records
  set status = target_payment_status,
      verified_at = case when p_decision = 'confirmed' then database_now else null end,
      verified_by_admin_id = case when p_decision = 'confirmed' then p_admin_profile_id else null end
  where id = payment_record.id
  returning * into payment_record;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'request', to_jsonb(requested_booking),
    'payment_record', to_jsonb(payment_record)
  );
end;
$$;

revoke all on function public.review_booking_bank_transfer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.review_booking_bank_transfer(uuid, uuid, text) to service_role;

commit;
