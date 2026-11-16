CREATE TYPE "public"."reservation_actor" AS ENUM('CLIENT', 'TREASURY');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('ACTIVE', 'RELEASED');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"reserved_amount" numeric(19, 4) NOT NULL,
	"invoice_to_program_fx_rate" numeric(24, 12) NOT NULL,
	"status" "reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"reserve_client_operation_number" bigint,
	"created_by" "reservation_actor" NOT NULL,
	"release_client_operation_number" bigint,
	"released_by" "reservation_actor",
	"released_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "reservations_reserved_amount_positive_chk" CHECK ("reservations"."reserved_amount" > 0),
	CONSTRAINT "reservations_invoice_to_program_fx_rate_positive_chk" CHECK ("reservations"."invoice_to_program_fx_rate" > 0),
	CONSTRAINT "reservations_released_at_matches_status_chk" CHECK (("reservations"."status" = 'RELEASED') = ("reservations"."released_at" IS NOT NULL)),
	CONSTRAINT "reservations_released_by_matches_status_chk" CHECK (("reservations"."status" = 'RELEASED') = ("reservations"."released_by" IS NOT NULL)),
	CONSTRAINT "reservations_reserve_op_number_matches_created_by_chk" CHECK (("reservations"."created_by" = 'CLIENT') = ("reservations"."reserve_client_operation_number" IS NOT NULL)),
	CONSTRAINT "reservations_release_op_number_matches_released_by_chk" CHECK (COALESCE("reservations"."released_by" = 'CLIENT', false) = ("reservations"."release_client_operation_number" IS NOT NULL)),
	CONSTRAINT "reservations_client_operation_numbers_positive_chk" CHECK ("reservations"."reserve_client_operation_number" >= 1 AND "reservations"."release_client_operation_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_invoice_id_program_id_fkey" FOREIGN KEY ("invoice_id","program_id") REFERENCES "public"."invoices"("id","program_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_invoice_id_key" ON "reservations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_program_id_reserve_client_operation_number_key" ON "reservations" USING btree ("program_id","reserve_client_operation_number");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_program_id_release_client_operation_number_key" ON "reservations" USING btree ("program_id","release_client_operation_number");--> statement-breakpoint
CREATE INDEX "reservations_program_id_status_idx" ON "reservations" USING btree ("program_id","status");