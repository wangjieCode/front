CREATE TABLE "review_rounds" (
  "id" uuid PRIMARY KEY NOT NULL,
  "conversation_id" uuid NOT NULL,
  "source_message_id" uuid NOT NULL,
  "round_number" integer NOT NULL,
  "status" varchar(32) DEFAULT 'completed' NOT NULL,
  "summary" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_file_changes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "conversation_id" uuid NOT NULL,
  "review_round_id" uuid NOT NULL,
  "file_path" text NOT NULL,
  "status" varchar(32) DEFAULT 'modified' NOT NULL,
  "old_path" text,
  "diff_patch" text,
  "additions" integer DEFAULT 0 NOT NULL,
  "deletions" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unique_review_rounds_conversation_round" ON "review_rounds" USING btree ("conversation_id","round_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "unique_review_rounds_source_message_id" ON "review_rounds" USING btree ("source_message_id");
--> statement-breakpoint
CREATE INDEX "idx_review_rounds_conversation_created_at" ON "review_rounds" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_review_file_changes_review_round_id" ON "review_file_changes" USING btree ("review_round_id");
--> statement-breakpoint
CREATE INDEX "idx_review_file_changes_conversation_round" ON "review_file_changes" USING btree ("conversation_id","review_round_id");
