CREATE TYPE "public"."room_status" AS ENUM('aberta', 'em_andamento', 'encerrada');--> statement-breakpoint
CREATE TABLE "live_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"pin" text NOT NULL,
	"title" text NOT NULL,
	"status" "room_status" DEFAULT 'aberta' NOT NULL,
	"card_ids" jsonb NOT NULL,
	"current_index" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"option_id" text NOT NULL,
	"correct" boolean NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"bridged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"student_id" uuid,
	"guest_key" text NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_rooms" ADD CONSTRAINT "live_rooms_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_answers" ADD CONSTRAINT "room_answers_room_id_live_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."live_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_answers" ADD CONSTRAINT "room_answers_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_answers" ADD CONSTRAINT "room_answers_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_live_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."live_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "live_rooms_pin_idx" ON "live_rooms" USING btree ("pin");--> statement-breakpoint
CREATE INDEX "live_rooms_status_idx" ON "live_rooms" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "room_answers_participant_card_idx" ON "room_answers" USING btree ("participant_id","card_id");--> statement-breakpoint
CREATE INDEX "room_answers_room_card_idx" ON "room_answers" USING btree ("room_id","card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_room_guest_idx" ON "room_participants" USING btree ("room_id","guest_key");