create or replace function public.adjust_shop_supply_quantity(
  p_item_id uuid,
  p_delta integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_item public.shop_supply_items%rowtype;
  updated_item public.shop_supply_items%rowtype;
  next_quantity integer;
begin
  if p_item_id is null then
    raise exception 'SUPPLY_ITEM_ID_REQUIRED' using errcode = 'P0001';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_SUPPLY_QUANTITY_DELTA' using errcode = 'P0001';
  end if;

  select *
    into current_item
    from public.shop_supply_items
    where id = p_item_id
    for update;

  if not found then
    raise exception 'SUPPLY_ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  next_quantity := current_item.quantity + p_delta;

  if next_quantity < 0 then
    raise exception 'SUPPLY_QUANTITY_BELOW_ZERO' using errcode = 'P0001';
  end if;

  update public.shop_supply_items
    set quantity = next_quantity,
        updated_at = now()
    where id = current_item.id
    returning * into updated_item;

  return jsonb_build_object(
    'item', to_jsonb(updated_item),
    'before', to_jsonb(current_item),
    'delta', p_delta
  );
end;
$$;

revoke all on function public.adjust_shop_supply_quantity(uuid, integer) from public;
revoke all on function public.adjust_shop_supply_quantity(uuid, integer) from anon;
revoke all on function public.adjust_shop_supply_quantity(uuid, integer) from authenticated;

grant execute on function public.adjust_shop_supply_quantity(uuid, integer) to service_role;
