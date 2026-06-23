-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.lotto_draws (
  id bigint generated always as identity primary key,
  session_id text not null,
  numbers smallint[] not null check (array_length(numbers, 1) = 6),
  bonus smallint null check (bonus is null or (bonus >= 1 and bonus <= 45)),
  draw_type text not null default 'random' check (draw_type in ('random', 'saju')),
  created_at timestamptz not null default now()
);

create index if not exists lotto_draws_session_created_idx
  on public.lotto_draws (session_id, created_at desc);

alter table public.lotto_draws enable row level security;

-- API는 service_role 키로 접근합니다. anon 직접 접근은 차단합니다.
-- 이미 정책이 있으면 삭제 후 다시 생성 (재실행 가능)
drop policy if exists "no direct anon access" on public.lotto_draws;

create policy "no direct anon access"
  on public.lotto_draws
  for all
  to anon
  using (false)
  with check (false);
