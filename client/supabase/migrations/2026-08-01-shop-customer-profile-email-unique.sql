do $$
declare
  duplicate_rows jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'normalized_email',
      normalized_email,
      'row_count',
      row_count,
      'profile_ids',
      profile_ids
    )
    order by normalized_email
  )
  into duplicate_rows
  from (
    select
      lower(trim(email)) as normalized_email,
      count(*) as row_count,
      array_agg(id order by created_at, id) as profile_ids
    from public.shop_customer_profiles
    group by lower(trim(email))
    having count(*) > 1
  ) duplicates;

  if duplicate_rows is not null then
    raise exception
      'Cannot create shop_customer_profiles_email_normalized_unique_idx: duplicate normalized customer profile emails exist: %',
      duplicate_rows;
  end if;
end $$;

drop index if exists public.shop_customer_profiles_email_unique_idx;

create unique index if not exists shop_customer_profiles_email_normalized_unique_idx
  on public.shop_customer_profiles((lower(trim(email))));
