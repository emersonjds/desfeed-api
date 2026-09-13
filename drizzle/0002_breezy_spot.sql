CREATE TYPE "public"."report_reason" AS ENUM('factualmente-errado', 'fora-do-tema', 'confuso', 'duplicado');--> statement-breakpoint
ALTER TYPE "public"."card_status" ADD VALUE 'under_review';--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "prompt";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "answer";