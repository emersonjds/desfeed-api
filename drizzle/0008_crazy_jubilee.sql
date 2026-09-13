CREATE TABLE "school_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school" text NOT NULL,
	"name" text NOT NULL,
	"grade" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "class_id" uuid;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "class_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "school_classes_school_name_idx" ON "school_classes" USING btree ("school","name");--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE set null ON UPDATE no action;