-- Reference data, not state: treasury refers to a currency, it never creates one, so a program
-- cannot appear in a currency the schema has not heard of. Seeded here so a fresh database is
-- usable at once; idempotent, so re-running the migrations on an existing one changes nothing.
--
-- The set is the one the exchange rate provider knows. A production deployment would take this
-- list from a reference data service instead, and then this migration becomes its initial load.
INSERT INTO "currencies" ("code", "minor_units") VALUES
    ('USD', 2),
    ('EUR', 2),
    ('JPY', 0),
    ('KWD', 3)
ON CONFLICT ("code") DO NOTHING;
