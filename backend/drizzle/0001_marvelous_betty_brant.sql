CREATE TABLE "neovate_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"neovate_session_id" varchar(255) NOT NULL,
	"work_dir" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD COLUMN "mode" varchar(50) DEFAULT 'edit' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD COLUMN "context_git_branch" varchar(255);--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD COLUMN "mr_url" text;--> statement-breakpoint
ALTER TABLE "conversation_contexts" ADD COLUMN "preview_info" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "message_metadata" ADD COLUMN "message_references" jsonb;--> statement-breakpoint
ALTER TABLE "message_metadata" ADD COLUMN "git_branch" varchar(255);--> statement-breakpoint
ALTER TABLE "message_metadata" ADD COLUMN "mr_url" text;--> statement-breakpoint
ALTER TABLE "message_metadata" ADD COLUMN "operation_denied" jsonb;--> statement-breakpoint
CREATE INDEX "idx_neovate_sessions_conversation_id" ON "neovate_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "unique_neovate_sessions_conversation_id" ON "neovate_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_neovate_sessions_neovate_session_id" ON "neovate_sessions" USING btree ("neovate_session_id");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_contexts_mode" ON "conversation_contexts" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_id" ON "conversations" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "message_metadata" DROP COLUMN "references";