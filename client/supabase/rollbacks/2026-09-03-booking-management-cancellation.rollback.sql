begin;

drop function if exists public.review_booking_cancellation_request(uuid, uuid, text, text, text);
drop function if exists public.admin_cancel_confirmed_booking(uuid, uuid, text);
drop function if exists public.customer_request_booking_cancellation(uuid, text, text, text);
drop function if exists public.report_booking_bank_transfer_from_management_session(uuid, text, text, text, text, integer);
drop function if exists public.customer_cancel_payment_hold_booking(uuid, text, text, text);
drop function if exists public.consume_booking_lookup_rate_limit(text, integer, integer);
drop function if exists public.get_booking_management_session(text);
drop function if exists public.create_booking_management_session(uuid, text, text, text);

drop table if exists public.booking_management_sessions;
drop table if exists public.booking_lookup_rate_limits;

commit;
