CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(255) NOT NULL,
	"currency" char(3) NOT NULL,
	"credit_limit" numeric(19, 4) NOT NULL,
	"reserved_amount" numeric(19, 4) DEFAULT 0 NOT NULL,
	"last_treasury_version" bigint NOT NULL,
	"last_treasury_reconciled_at" timestamp (3) with time zone,
	"last_client_operation_number" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "programs_credit_limit_non_negative_chk" CHECK ("programs"."credit_limit" >= 0),
	CONSTRAINT "programs_reserved_amount_non_negative_chk" CHECK ("programs"."reserved_amount" >= 0),
	CONSTRAINT "programs_currency_iso4217_chk" CHECK ("programs"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "programs_last_client_operation_number_non_negative_chk" CHECK ("programs"."last_client_operation_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_currency_fkey" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_key" ON "programs" USING btree ("code");--> statement-breakpoint
CREATE FUNCTION programs_prevent_currency_change() RETURNS trigger AS $$
BEGIN
    IF NEW.currency <> OLD.currency THEN
        RAISE EXCEPTION 'Program currency is immutable (program %)', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER programs_currency_immutable
    BEFORE UPDATE OF currency ON programs
    FOR EACH ROW EXECUTE FUNCTION programs_prevent_currency_change();
