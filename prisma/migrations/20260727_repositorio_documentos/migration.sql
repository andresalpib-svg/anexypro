-- CreateEnum
CREATE TYPE "StorageProviderKind" AS ENUM ('local', 'google_drive', 's3', 'gcs', 'r2', 'azure_blob');

-- CreateEnum
CREATE TYPE "StorageFolderKind" AS ENUM ('raiz', 'condominios', 'condominio', 'seccion', 'subseccion', 'residente');

-- CreateEnum
CREATE TYPE "StorageObjectStatus" AS ENUM ('activo', 'eliminado');

-- CreateTable
CREATE TABLE "storage_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "provider" "StorageProviderKind" NOT NULL DEFAULT 'local',
    "root_folder_id" TEXT,
    "config" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "storage_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_folders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "condominium_id" TEXT,
    "person_id" TEXT,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "StorageFolderKind" NOT NULL,
    "provider" "StorageProviderKind" NOT NULL,
    "provider_folder_id" TEXT NOT NULL,
    "allowed_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_objects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT,
    "folder_id" TEXT NOT NULL,
    "provider" "StorageProviderKind" NOT NULL,
    "provider_file_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "owner_person_id" TEXT,
    "uploaded_by" TEXT,
    "status" "StorageObjectStatus" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "storage_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "storage_folders_company_id_condominium_id_idx" ON "storage_folders"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "storage_folders_person_id_idx" ON "storage_folders"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_folders_condominium_id_slug_key" ON "storage_folders"("condominium_id", "slug");

-- CreateIndex
CREATE INDEX "storage_objects_company_id_condominium_id_folder_id_idx" ON "storage_objects"("company_id", "condominium_id", "folder_id");

-- CreateIndex
CREATE INDEX "storage_objects_folder_id_status_idx" ON "storage_objects"("folder_id", "status");

-- CreateIndex
CREATE INDEX "storage_objects_sha256_idx" ON "storage_objects"("sha256");

-- AddForeignKey
ALTER TABLE "storage_folders" ADD CONSTRAINT "storage_folders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_folders" ADD CONSTRAINT "storage_folders_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_folders" ADD CONSTRAINT "storage_folders_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_folders" ADD CONSTRAINT "storage_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "storage_folders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "storage_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
