CREATE TYPE "public"."league_tier" AS ENUM('bronze', 'prata', 'ouro', 'diamante');--> statement-breakpoint
CREATE TABLE "daily_progress" (
	"student_id" uuid NOT NULL,
	"day" text NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"goal" integer NOT NULL,
	"met_goal" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_progress_student_id_day_pk" PRIMARY KEY("student_id","day")
);
--> statement-breakpoint
CREATE TABLE "student_leagues" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"tier" "league_tier" DEFAULT 'bronze' NOT NULL,
	"settled_week" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_progress" ADD CONSTRAINT "daily_progress_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leagues" ADD CONSTRAINT "student_leagues_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_progress_student_day_idx" ON "daily_progress" USING btree ("student_id","day");