CREATE TABLE "card_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"reason" "report_reason" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"question" text NOT NULL,
	"key_term" text NOT NULL,
	"highlight_term" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option_id" text NOT NULL,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_reports" ADD CONSTRAINT "card_reports_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_reports" ADD CONSTRAINT "card_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_versions" ADD CONSTRAINT "card_versions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_reports_card_student_idx" ON "card_reports" USING btree ("card_id","student_id");--> statement-breakpoint
CREATE INDEX "card_reports_reason_idx" ON "card_reports" USING btree ("reason","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "card_versions_card_version_idx" ON "card_versions" USING btree ("card_id","version");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_reviewed_by_teachers_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_status_created_idx" ON "cards" USING btree ("status","created_at");