-- Local development data: the three players of the club the app was born in, with addresses at
-- example.com, which never delivers mail. npm run db:seed, after npm run db:migrate; running it again changes nothing.
INSERT INTO members (id, email) VALUES
  ('member-vincent', 'vincent@example.com'),
  ('member-dimitri', 'dimitri@example.com'),
  ('member-kevin', 'kevin@example.com')
ON CONFLICT(id) DO NOTHING;
INSERT INTO player_identities (slot, owner, player_id) VALUES
  ('chat-pris-tea', 'member-vincent', 'Epic|chat-pris-tea-dev|0'),
  ('nokouki', 'member-dimitri', 'Epic|nokouki-dev|0'),
  ('kevin-74000', 'member-kevin', 'PS4|kevin-74000-dev|0')
ON CONFLICT(slot) DO NOTHING;
INSERT INTO player_identity_aliases (player_id, slot, confirmed_by, confirmed_at) VALUES
  ('Epic|chat-pris-tea-dev|0', 'chat-pris-tea', 'member-vincent', '2026-11-01T00:00:00.000Z'),
  ('Epic|nokouki-dev|0', 'nokouki', 'member-dimitri', '2026-11-01T00:00:00.000Z'),
  ('PS4|kevin-74000-dev|0', 'kevin-74000', 'member-kevin', '2026-11-01T00:00:00.000Z')
ON CONFLICT(player_id) DO NOTHING;
