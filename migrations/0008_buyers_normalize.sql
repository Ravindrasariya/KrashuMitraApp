-- Task #112 follow-up: tighten buyer identity to be case-insensitive on name
-- with internal whitespace collapsed, and to ignore all whitespace in phone.
-- Normalizes existing rows in-place, then re-creates the unique index on the
-- normalized expression so future inserts are deduped consistently with the
-- application-level helpers in server/storage.ts.

UPDATE buyers
SET name  = regexp_replace(btrim(name),  '\s+', ' ', 'g'),
    phone = regexp_replace(phone,        '\s+', '',  'g');

DROP INDEX IF EXISTS buyers_seller_name_phone_unique;
CREATE UNIQUE INDEX buyers_seller_name_phone_unique
  ON buyers (
    seller_id,
    lower(regexp_replace(btrim(name), '\s+', ' ', 'g')),
    regexp_replace(phone, '\s+', '', 'g')
  );
