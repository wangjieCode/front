CREATE TABLE "review_diff_blobs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "diff_hash" varchar(64) NOT NULL,
  "diff_gzip_base64" text NOT NULL,
  "raw_size" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unique_review_diff_blobs_diff_hash" ON "review_diff_blobs" USING btree ("diff_hash");
--> statement-breakpoint
ALTER TABLE "review_file_changes" ADD COLUMN "message_id" uuid;
--> statement-breakpoint
ALTER TABLE "review_file_changes" ADD COLUMN "change_type" varchar(32) DEFAULT 'modified' NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_file_changes" ADD COLUMN "diff_blob_id" uuid;
--> statement-breakpoint
TRUNCATE TABLE "review_file_changes", "review_rounds";
--> statement-breakpoint
ALTER TABLE "review_file_changes" ALTER COLUMN "diff_blob_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_file_changes" DROP COLUMN "diff_patch";
--> statement-breakpoint
CREATE INDEX "idx_review_file_changes_message_id" ON "review_file_changes" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "idx_review_file_changes_diff_blob_id" ON "review_file_changes" USING btree ("diff_blob_id");
