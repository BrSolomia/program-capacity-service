CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"minor_units" smallint NOT NULL,
	CONSTRAINT "currencies_code_iso4217_chk" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_units_non_negative_chk" CHECK ("currencies"."minor_units" >= 0)
);
