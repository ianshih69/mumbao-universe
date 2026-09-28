begin;

-- Capacity is independent of room pricing and does not enable room checkout.
alter table public.booking_rooms
  add column capacity integer
  constraint booking_rooms_capacity_positive check (capacity > 0);

commit;
