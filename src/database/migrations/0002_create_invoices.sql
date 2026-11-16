CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "invoices_amount_positive_chk" CHECK ("invoices"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_fkey" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_program_id_external_id_key" ON "invoices" USING btree ("program_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_id_program_id_key" ON "invoices" USING btree ("id","program_id");--> statement-breakpoint
CREATE FUNCTION invoices_prevent_update() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Invoice is immutable (invoice %)', OLD.id;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER invoices_immutable
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION invoices_prevent_update();
