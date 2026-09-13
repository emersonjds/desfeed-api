ALTER TABLE "notebooks" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notebooks" ADD COLUMN "teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notebooks_teacher_created_idx" ON "notebooks" USING btree ("teacher_id","created_at");