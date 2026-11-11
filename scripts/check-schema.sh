#!/usr/bin/env bash
# Prova supabase/schema.sql su un Postgres locale usa-e-getta, con un finto schema `auth` come quello di Supabase:
# la tabella si crea, ognuno vede e scrive solo le proprie righe, l'upsert e le righe "eliminate" funzionano.
# Richiede i binari di PostgreSQL (initdb, pg_ctl, psql) e, se lanciato da root, l'utente di sistema "postgres".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
DIR="$(mktemp -d)"; PORT=54329
cp "$ROOT/supabase/schema.sql" "$DIR/schema.sql"; chmod -R a+rwx "$DIR"
AS=""; [ "$(id -u)" = "0" ] && AS="runuser -u postgres --"
cleanup() { $AS "$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$AS "$BIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
$AS "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -c listen_addresses='' -k $DIR" -w start >/dev/null
Q() { $AS "$BIN/psql" -h "$DIR" -p $PORT -U postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

Q <<'SQL'
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin; create role anon nologin;
grant usage on schema auth to authenticated, anon;
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'a@example.com'), ('22222222-2222-2222-2222-222222222222', 'b@example.com');
SQL
Q -f "$DIR/schema.sql"
Q -f "$DIR/schema.sql"   # rieseguibile senza errori
Q -c "grant all on docs to authenticated; grant select on docs to anon;"

A="set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';"
B="set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';"
fail() { echo "ERRORE: $1"; exit 1; }
eq() { [ "$1" = "$2" ] || fail "$3 (atteso «$2», ottenuto «$1»)"; }

Q -c "$A insert into docs (user_id, coll, id, data, updated_at) values ('11111111-1111-1111-1111-111111111111', 'app', 'core', '{\"goal\":14400}', '2026-11-17T07:00:00.123Z'), ('11111111-1111-1111-1111-111111111111', 'workouts', 'w1', '{\"km\":6}', '2026-11-17T07:00:01Z');"
eq "$(Q -c "$A select count(*) from docs;")" "2" "l'utente A vede le proprie righe"
eq "$(Q -c "$B select count(*) from docs;")" "0" "l'utente B non vede le righe di A"
eq "$(Q -c "set role anon; select count(*) from docs;")" "0" "chi non ha fatto l'accesso non vede nulla"
if Q -c "$B insert into docs (user_id, coll, id, data) values ('11111111-1111-1111-1111-111111111111', 'app', 'plan', '{}');" 2>/dev/null; then fail "B è riuscito a scrivere una riga a nome di A"; fi
eq "$(Q -c "$B update docs set data = '{}' where coll = 'app' returning 1;" | wc -l | tr -d ' ')" "0" "B non può modificare le righe di A"
eq "$(Q -c "$B delete from docs returning 1;" | wc -l | tr -d ' ')" "0" "B non può cancellare le righe di A"
# upsert come lo fa l'app: stessa chiave, contenuto e orario nuovi (l'orario resta quello inviato)
Q -c "$A insert into docs (user_id, coll, id, data, updated_at) values ('11111111-1111-1111-1111-111111111111', 'workouts', 'w1', '{\"km\":6.5}', '2026-11-17T08:30:00.5Z') on conflict (user_id, coll, id) do update set data = excluded.data, updated_at = excluded.updated_at;"
eq "$(Q -c "$A select data->>'km' || ' ' || to_char(updated_at at time zone 'UTC', 'HH24:MI:SS.MS') from docs where id = 'w1';")" "6.5 08:30:00.500" "l'upsert sostituisce contenuto e orario"
# eliminato = data null: la riga resta
Q -c "$A insert into docs (user_id, coll, id, data, updated_at) values ('11111111-1111-1111-1111-111111111111', 'versions', 'v0001', null, now()) on conflict (user_id, coll, id) do update set data = excluded.data, updated_at = excluded.updated_at;"
eq "$(Q -c "$A select count(*) from docs where data is null;")" "1" "una riga eliminata resta con data null"
# stesso id per due utenti: nessun conflitto
Q -c "$B insert into docs (user_id, coll, id, data) values ('22222222-2222-2222-2222-222222222222', 'app', 'core', '{\"goal\":13500}');"
eq "$(Q -c "$A select data->>'goal' from docs where coll = 'app' and id = 'core';")" "14400" "ognuno ha il proprio documento core"
eq "$(Q -c "$B select data->>'goal' from docs where coll = 'app' and id = 'core';")" "13500" "ognuno ha il proprio documento core"
# cancellando l'utente spariscono i suoi dati
Q -c "delete from auth.users where email = 'a@example.com';"
eq "$(Q -c "select count(*) from docs;")" "1" "eliminando l'account si eliminano i suoi documenti"
echo "SCHEMA_OK"
