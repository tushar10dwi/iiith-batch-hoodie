-- Run once in Supabase Dashboard > SQL Editor

create table public.votes (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email      text not null default (auth.jwt() ->> 'email'),
  picks      text[] not null,
  created_at timestamptz not null default now(),
  -- exactly 3 distinct picks, ranked by array order (index 1 = first choice)
  constraint three_distinct check (
    array_length(picks, 1) = 3
    and picks[1] <> picks[2] and picks[1] <> picks[3] and picks[2] <> picks[3]
  )
);

alter table public.votes enable row level security;

-- Students can insert one vote for themselves, only with an institute email
-- (edit the domain regex to match yours)
create policy "insert own vote" on public.votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (auth.jwt() ->> 'email') ~* '@(students\.|research\.)?iiit\.ac\.in$'
  );

-- Students can only read their own vote (nobody can see others' votes)
create policy "read own vote" on public.votes
  for select to authenticated
  using (user_id = auth.uid());

-- No update/delete policies: votes are final.

-- Tally: 1st = 3 points, 2nd = 2, 3rd = 1. Run in the SQL Editor to see results.
create or replace function public.results()
returns table(color text, borda int, first_choices int, total_votes int)
language sql security definer set search_path = public as $$
  select c, sum(4 - i)::int, count(*) filter (where i = 1)::int, count(*)::int
  from public.votes, unnest(picks) with ordinality as t(c, i)
  group by c order by 2 desc;
$$;
revoke execute on function public.results() from public, anon, authenticated;

-- select * from public.results();
