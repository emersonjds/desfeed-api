ALTER TABLE "notebooks" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "source_label" text DEFAULT 'Caderno fotografado' NOT NULL;