CREATE TYPE "public"."review_origin" AS ENUM('feed', 'sala');--> statement-breakpoint
CREATE TYPE "public"."review_rating" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TABLE "card_states" (
	"student_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"elapsed_days" double precision NOT NULL,
	"scheduled_days" double precision NOT NULL,
	"learning_steps" integer NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"state" integer NOT NULL,
	"last_review" timestamp with time zone,
	CONSTRAINT "card_states_student_id_card_id_pk" PRIMARY KEY("student_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"card_version" integer NOT NULL,
	"rating" "review_rating" NOT NULL,
	"origin" "review_origin" DEFAULT 'feed' NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"previous_state" integer NOT NULL,
	"previous_due" timestamp with time zone NOT NULL,
	"next_due" timestamp with time zone NOT NULL,
	"elapsed_days" double precision NOT NULL,
	"scheduled_days" double precision NOT NULL,
	"xp_gained" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "daily_goal" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "new_cards_per_day" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "reminder_time" text DEFAULT '19:30' NOT NULL;--> statement-breakpoint
ALTER TABLE "card_states" ADD CONSTRAINT "card_states_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_states" ADD CONSTRAINT "card_states_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_states_student_due_idx" ON "card_states" USING btree ("student_id","due");--> statement-breakpoint
CREATE UNIQUE INDEX "review_logs_student_card_moment_idx" ON "review_logs" USING btree ("student_id","card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_logs_student_reviewed_idx" ON "review_logs" USING btree ("student_id","reviewed_at");