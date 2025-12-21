CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"git_repository_url" varchar(500) NOT NULL,
	"git_branch" varchar(100) DEFAULT 'main',
	"gitlab_project_id" varchar(100),
	"gitlab_url" varchar(500),
	"work_directory" varchar(500) NOT NULL,
	"owner_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_project_members_project_id" ON "project_members" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_members_user_id" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unique_project_members_project_user" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_owner_id" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_projects_name" ON "projects" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_projects_is_active" ON "projects" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_projects_created_at" ON "projects" USING btree ("created_at");