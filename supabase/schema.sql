-- Run this once in the Supabase SQL Editor for the project connected to BizRecord.
-- Every business record is owned by its authenticated Supabase user.
create table if not exists public.shop_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null check (record_type in (
    'product', 'sale', 'employee', 'daily_report', 'expense', 'credit_entry'
  )),
  record_id text not null check (length(record_id) > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_type, record_id)
);

alter table public.shop_records enable row level security;

drop policy if exists "Users can read their own shop records" on public.shop_records;
create policy "Users can read their own shop records"
  on public.shop_records for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own shop records" on public.shop_records;
create policy "Users can insert their own shop records"
  on public.shop_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own shop records" on public.shop_records;
create policy "Users can delete their own shop records"
  on public.shop_records for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.replace_my_shop_records(p_records jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Sign in is required to save shop records';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Shop records must be an array';
  end if;

  delete from public.shop_records
  where user_id = current_user_id;

  insert into public.shop_records (user_id, record_type, record_id, payload, updated_at)
  select
    current_user_id,
    item ->> 'record_type',
    item ->> 'record_id',
    item -> 'payload',
    now()
  from jsonb_array_elements(p_records) as records(item);
end;
$function$;

revoke all on public.shop_records from public, anon, authenticated;
grant select, insert, delete on public.shop_records to authenticated;

revoke all on function public.replace_my_shop_records(jsonb) from public, anon;
grant execute on function public.replace_my_shop_records(jsonb) to authenticated;
