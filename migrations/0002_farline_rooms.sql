-- Ephemeral tic-tac-toe rooms. Unowned: the room code is the only key.
-- Rows are not personal data; call signs are display handles for the open table.
create table if not exists farline_rooms (
  room text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
