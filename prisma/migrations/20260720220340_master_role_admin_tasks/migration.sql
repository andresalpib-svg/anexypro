-- CreateEnum
CREATE TYPE "AdminTaskPriority" AS ENUM ('baja', 'media', 'alta');

-- CreateEnum
CREATE TYPE "AdminTaskStatus" AS ENUM ('pendiente', 'en_progreso', 'completada');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'master';

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "admin_tasks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "assigned_to" TEXT,
    "priority" "AdminTaskPriority" NOT NULL DEFAULT 'media',
    "due_date" DATE,
    "alarm_at" TIMESTAMP(3),
    "notes" TEXT,
    "status" "AdminTaskStatus" NOT NULL DEFAULT 'pendiente',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_task_checklist" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_task_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_task_attachments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_tasks_company_id_status_idx" ON "admin_tasks"("company_id", "status");

-- CreateIndex
CREATE INDEX "admin_tasks_company_id_due_date_idx" ON "admin_tasks"("company_id", "due_date");

-- CreateIndex
CREATE INDEX "admin_task_checklist_task_id_idx" ON "admin_task_checklist"("task_id");

-- CreateIndex
CREATE INDEX "admin_task_attachments_task_id_idx" ON "admin_task_attachments"("task_id");

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_task_checklist" ADD CONSTRAINT "admin_task_checklist_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "admin_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_task_attachments" ADD CONSTRAINT "admin_task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "admin_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

