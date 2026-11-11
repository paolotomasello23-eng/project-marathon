-- Madrid 27 — schema del database (Supabase / Postgres)
-- Da eseguire una volta in SQL Editor del progetto Supabase. Si può rieseguire senza danni.

-- Tabella unica di documenti, come nel prototipo.
create table if not exists docs (
  user_id uuid not null references auth.users(id) on delete cascade,
  coll text not null,            -- 'app' | 'workouts' | 'checkins' | 'changes' | 'versions'
  id text not null,              -- 'core', 'plan' oppure l'id del documento
  data jsonb,                    -- null = eliminato
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);
alter table docs enable row level security;
drop policy if exists "own rows" on docs;
create policy "own rows" on docs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Nota: updated_at lo scrive l'app ed è l'orario in cui il documento è stato modificato sul dispositivo.
-- Serve a far vincere la scrittura più recente: non aggiungere trigger che lo riscrivano.
