-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('activa', 'suspendida', 'inactiva');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin_owner', 'admin_staff', 'seguridad', 'condomino');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('activo', 'invitado', 'bloqueado', 'inactivo');

-- CreateEnum
CREATE TYPE "CondoType" AS ENUM ('residencial', 'vertical', 'mixto', 'comercial');

-- CreateEnum
CREATE TYPE "CondoStatus" AS ENUM ('configuracion', 'activo', 'inactivo');

-- CreateEnum
CREATE TYPE "StructUnitType" AS ENUM ('etapa', 'torre', 'bloque', 'sector');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('casa', 'apartamento', 'local', 'lote', 'parqueo', 'bodega');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('activa', 'inactiva');

-- CreateEnum
CREATE TYPE "AmenityStatus" AS ENUM ('disponible', 'mantenimiento', 'limpieza', 'fuera_de_servicio');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('simple', 'compuesto');

-- CreateEnum
CREATE TYPE "FeeCalculation" AS ENUM ('fija', 'por_coeficiente', 'por_area');

-- CreateEnum
CREATE TYPE "WaterMode" AS ENUM ('sin_cobro', 'tarifa_plana', 'escalonado');

-- CreateEnum
CREATE TYPE "CondoDocType" AS ENUM ('reglamento', 'reglamento_uso_area', 'manual', 'plano', 'seguro', 'otro');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('crear', 'actualizar', 'eliminar');

-- CreateEnum
CREATE TYPE "PropertyRole" AS ENUM ('propietario', 'residente', 'inquilino', 'familiar', 'empleado');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('automovil', 'motocicleta', 'bicicleta', 'otro');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('activo', 'inactivo');

-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('perro', 'gato', 'ave', 'otro');

-- CreateEnum
CREATE TYPE "PropertyEventType" AS ENUM ('creacion', 'traspaso', 'nuevo_miembro', 'salida_miembro', 'vehiculo', 'mascota', 'contacto', 'nota', 'suspension_activada', 'suspension_levantada', 'pago', 'cargo', 'reserva', 'comunicado', 'otro');

-- CreateEnum
CREATE TYPE "PersonDocType" AS ENUM ('identificacion', 'contrato_alquiler', 'autorizacion', 'otro');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pendiente', 'aceptada', 'expirada', 'revocada');

-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('ordinaria', 'extraordinaria');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('cuota_ordinaria', 'cuota_extraordinaria', 'interes_moratorio', 'multa', 'reposicion_danos', 'mantenimiento_parqueo', 'agua_potable', 'quick_pass', 'reserva_area_social', 'otro');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('pendiente', 'parcial', 'pagado', 'anulado');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('transferencia', 'sinpe', 'efectivo', 'tarjeta', 'deposito', 'comprobante');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('aplicado', 'anulado');

-- CreateEnum
CREATE TYPE "PaidCurrency" AS ENUM ('CRC', 'USD');

-- CreateEnum
CREATE TYPE "BillingRunStatus" AS ENUM ('ok', 'omitido', 'error');

-- CreateEnum
CREATE TYPE "CommCategory" AS ENUM ('aviso', 'noticia', 'urgente', 'mantenimiento', 'asamblea', 'recordatorio_pago', 'suspension');

-- CreateEnum
CREATE TYPE "CommSource" AS ENUM ('manual', 'automatico');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('borrador', 'programado', 'enviado');

-- CreateEnum
CREATE TYPE "CommTargetType" AS ENUM ('todos', 'estructura', 'rol', 'propiedad', 'persona');

-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('push', 'correo', 'ambos');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('pendiente_aprobacion', 'confirmada', 'rechazada', 'cancelada');

-- CreateEnum
CREATE TYPE "CalEventType" AS ENUM ('mantenimiento', 'asamblea', 'reserva', 'corte_servicio', 'actividad', 'otro');

-- CreateEnum
CREATE TYPE "CalEventSource" AS ENUM ('manual', 'comunicado', 'reserva', 'mantenimiento', 'asamblea');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('rapida', 'recurrente', 'entrega');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('vigente', 'usada', 'vencida', 'cancelada');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('seguridad', 'mantenimiento', 'convivencia', 'otro');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('abierto', 'en_seguimiento', 'cerrado');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('recibido', 'entregado');

-- CreateEnum
CREATE TYPE "ContentCategory" AS ENUM ('video', 'manual', 'reglamento', 'curso', 'consejo', 'emergencia', 'reciclaje', 'seguridad');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('elevador', 'bomba', 'generador', 'piscina', 'porton', 'techo', 'otro');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('operativo', 'en_mantenimiento', 'fuera_servicio');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('preventivo', 'correctivo');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('baja', 'media', 'alta');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('reportado', 'programado', 'en_progreso', 'completado', 'cancelado');

-- CreateEnum
CREATE TYPE "TicketSource" AS ENUM ('manual', 'incidente', 'automatico');

-- CreateEnum
CREATE TYPE "PhotoPhase" AS ENUM ('antes', 'despues', 'evidencia');

-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('login_success', 'login_failed', 'logout');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planificado', 'en_progreso', 'pausado', 'completado', 'cancelado');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pendiente', 'completado');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto');

-- CreateEnum
CREATE TYPE "AccountSub" AS ENUM ('corriente', 'no_corriente');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('manual', 'cuota', 'pago', 'gasto_mantenimiento', 'gasto_proyecto', 'ia', 'ajuste');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('borrador', 'confirmado', 'anulado');

-- CreateEnum
CREATE TYPE "AssemblyType" AS ENUM ('ordinaria', 'extraordinaria');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('convocada', 'en_curso', 'cerrada', 'cancelada');

-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "BallotChoice" AS ENUM ('a_favor', 'en_contra', 'abstencion');

-- CreateEnum
CREATE TYPE "DocCategory" AS ENUM ('reglamento', 'contrato', 'manual', 'seguro', 'garantia', 'plano', 'otro');

-- CreateEnum
CREATE TYPE "DocVisibility" AS ENUM ('admin', 'residentes');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('vigente', 'archivado');

-- CreateEnum
CREATE TYPE "AuditDevice" AS ENUM ('Escritorio', 'Movil');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "logo_url" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'activa',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'admin_staff',
    "staff_permissions" JSONB,
    "status" "UserStatus" NOT NULL DEFAULT 'activo',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condominiums" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CondoType" NOT NULL,
    "address_line" TEXT,
    "province" TEXT,
    "canton" TEXT,
    "district" TEXT,
    "country" TEXT NOT NULL DEFAULT 'CR',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "timezone" TEXT NOT NULL DEFAULT 'America/Costa_Rica',
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "logo_url" TEXT,
    "status" "CondoStatus" NOT NULL DEFAULT 'configuracion',
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "condominiums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structural_units" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "unit_type" "StructUnitType" NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structural_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "structural_unit_id" TEXT,
    "code" TEXT NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "floor" INTEGER,
    "area_m2" DECIMAL(10,2),
    "coefficient" DECIMAL(8,5),
    "parking_spaces" INTEGER NOT NULL DEFAULT 0,
    "status" "PropertyStatus" NOT NULL DEFAULT 'activa',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "reservation_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_hours" INTEGER,
    "advance_days" INTEGER NOT NULL DEFAULT 30,
    "rules" TEXT,
    "status" "AmenityStatus" NOT NULL DEFAULT 'disponible',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenity_schedules" (
    "id" TEXT NOT NULL,
    "amenity_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "opens_at" TEXT NOT NULL,
    "closes_at" TEXT NOT NULL,

    CONSTRAINT "amenity_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condominium_financial_settings" (
    "condominium_id" TEXT NOT NULL,
    "base_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "billing_day" INTEGER NOT NULL DEFAULT 1,
    "due_day" INTEGER NOT NULL DEFAULT 15,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "late_interest_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "interest_type" "InterestType" NOT NULL DEFAULT 'simple',
    "fee_calculation" "FeeCalculation" NOT NULL DEFAULT 'fija',
    "auto_billing" BOOLEAN NOT NULL DEFAULT true,
    "auto_billing_day" INTEGER NOT NULL DEFAULT 1,
    "parking_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "water_mode" "WaterMode" NOT NULL DEFAULT 'sin_cobro',
    "water_flat_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "suspension_enabled" BOOLEAN NOT NULL DEFAULT true,
    "suspension_months" INTEGER NOT NULL DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condominium_financial_settings_pkey" PRIMARY KEY ("condominium_id")
);

-- CreateTable
CREATE TABLE "condominium_documents" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "amenity_id" TEXT,
    "doc_type" "CondoDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condominium_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT,
    "user_id" TEXT,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "changes" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "full_name" TEXT NOT NULL,
    "id_number" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "phone_alt" TEXT,
    "birth_date" DATE,
    "photo_url" TEXT,
    "notes" TEXT,
    "is_board_member" BOOLEAN NOT NULL DEFAULT false,
    "board_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_members" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "role" "PropertyRole" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_access_schedules" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,

    CONSTRAINT "member_access_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "person_id" TEXT,
    "driver_name" TEXT,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "color" TEXT,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'automovil',
    "parking_code" TEXT,
    "photo_url" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "PetSpecies" NOT NULL DEFAULT 'perro',
    "breed" TEXT,
    "color" TEXT,
    "vaccines_ok" BOOLEAN NOT NULL DEFAULT false,
    "vaccines_due" DATE,
    "photo_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT NOT NULL,
    "phone_alt" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_events" (
    "id" BIGSERIAL NOT NULL,
    "property_id" TEXT NOT NULL,
    "event_type" "PropertyEventType" NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_documents" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "doc_type" "PersonDocType" NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_invitations" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pendiente',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_batches" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "batch_type" "BatchType" NOT NULL,
    "period" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "total_amount" DECIMAL(16,2) NOT NULL,
    "units_count" INTEGER NOT NULL,
    "project_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reverted_at" TIMESTAMP(3),

    CONSTRAINT "fee_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "charge_type" "ChargeType" NOT NULL,
    "description" TEXT NOT NULL,
    "period" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'pendiente',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "receipt_url" TEXT,
    "paid_currency" "PaidCurrency" NOT NULL DEFAULT 'CRC',
    "original_amount" DECIMAL(14,2),
    "fx_rate" DECIMAL(10,4),
    "fx_date" DATE,
    "received_by" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'aplicado',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_run_log" (
    "id" BIGSERIAL NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "batch_id" TEXT,
    "status" "BillingRunStatus" NOT NULL,
    "detail" TEXT,
    "notified_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_run_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_tariff_tiers" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "tier_order" INTEGER NOT NULL,
    "up_to_m3" DECIMAL(10,2),
    "price_per_m3" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "water_tariff_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_readings" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "previous_reading" DECIMAL(12,2) NOT NULL,
    "current_reading" DECIMAL(12,2) NOT NULL,
    "charge_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "rate_date" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "buy_rate" DECIMAL(10,4) NOT NULL,
    "sell_rate" DECIMAL(10,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'BCCR',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("rate_date","currency")
);

-- CreateTable
CREATE TABLE "property_service_suspensions" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "months_overdue" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "ended_reason" TEXT,
    "resident_notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "property_service_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "CommCategory" NOT NULL DEFAULT 'aviso',
    "source" "CommSource" NOT NULL DEFAULT 'manual',
    "status" "CommStatus" NOT NULL DEFAULT 'borrador',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_targets" (
    "id" TEXT NOT NULL,
    "communication_id" TEXT NOT NULL,
    "target_type" "CommTargetType" NOT NULL,
    "structural_unit_id" TEXT,
    "role" TEXT,
    "property_id" TEXT,
    "person_id" TEXT,

    CONSTRAINT "communication_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_attachments" (
    "id" TEXT NOT NULL,
    "communication_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,

    CONSTRAINT "communication_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_recipients" (
    "id" TEXT NOT NULL,
    "communication_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "property_id" TEXT,
    "channel" "CommChannel" NOT NULL DEFAULT 'push',
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    "email_sent_at" TIMESTAMP(3),
    "email_opened_at" TIMESTAMP(3),

    CONSTRAINT "communication_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "amenity_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "requested_by" TEXT,
    "res_date" DATE NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'pendiente_aprobacion',
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "charge_id" TEXT,
    "receipt_url" TEXT,
    "receipt_note" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "event_type" "CalEventType" NOT NULL,
    "event_date" DATE NOT NULL,
    "event_time" TEXT,
    "source" "CalEventSource" NOT NULL DEFAULT 'manual',
    "communication_id" TEXT,
    "reservation_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_authorizations" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "authorized_by" TEXT,
    "visit_type" "VisitType" NOT NULL,
    "visitor_name" TEXT NOT NULL,
    "visitor_id_number" TEXT,
    "vehicle_plate" TEXT,
    "courier" TEXT,
    "code" TEXT NOT NULL,
    "valid_date" DATE,
    "start_date" DATE,
    "end_date" DATE,
    "status" "VisitStatus" NOT NULL DEFAULT 'vigente',
    "notes" TEXT,
    "created_by_role" "UserRole",
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_schedules" (
    "id" TEXT NOT NULL,
    "authorization_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,

    CONSTRAINT "visit_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_checkins" (
    "id" TEXT NOT NULL,
    "authorization_id" TEXT NOT NULL,
    "checkin_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkout_at" TIMESTAMP(3),
    "photo_url" TEXT,
    "registered_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "visit_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL DEFAULT 'seguridad',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "photo_url" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'abierto',
    "reported_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "visit_authorization_id" TEXT,
    "courier" TEXT,
    "description" TEXT,
    "photo_url" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" TEXT,
    "status" "PackageStatus" NOT NULL DEFAULT 'recibido',
    "delivered_at" TIMESTAMP(3),
    "delivered_by" TEXT,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "category" "ContentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT,
    "video_url" TEXT,
    "published_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL DEFAULT 'otro',
    "location" TEXT,
    "purchase_date" DATE,
    "warranty_until" DATE,
    "manual_url" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'operativo',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "service_type" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "asset_id" TEXT,
    "provider_id" TEXT,
    "incident_id" TEXT,
    "ticket_type" "TicketType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority" NOT NULL DEFAULT 'media',
    "status" "TicketStatus" NOT NULL DEFAULT 'reportado',
    "scheduled_date" DATE,
    "completed_at" TIMESTAMP(3),
    "cost" DECIMAL(12,2),
    "quote_amount" DECIMAL(12,2),
    "source" "TicketSource" NOT NULL DEFAULT 'manual',
    "public_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_photos" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "phase" "PhotoPhase" NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "event_type" "AuthEventType" NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "provider_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planificado',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" DATE,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pendiente',
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_checklist_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "project_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_expenses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expense_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "project_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_updates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "progress_pct" INTEGER,
    "photo_url" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parent_id" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "sub" "AccountSub",
    "is_operating" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "entry_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL DEFAULT 'manual',
    "source_table" TEXT,
    "source_id" TEXT,
    "charge_ref_id" TEXT,
    "payment_ref_id" TEXT,
    "ticket_ref_id" TEXT,
    "expense_ref_id" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'confirmado',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "budgeted_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assemblies" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "type" "AssemblyType" NOT NULL,
    "title" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "event_time" TEXT NOT NULL,
    "location" TEXT,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'convocada',
    "convocatoria_body" TEXT NOT NULL,
    "quorum_required_pct" DECIMAL(5,2) NOT NULL DEFAULT 50.0,
    "minutes_body" TEXT,
    "minutes_published" BOOLEAN NOT NULL DEFAULT false,
    "minutes_published_at" TIMESTAMP(3),
    "minutes_approved_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_attachments" (
    "id" TEXT NOT NULL,
    "assembly_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assembly_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_topics" (
    "id" TEXT NOT NULL,
    "assembly_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "requires_vote" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assembly_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_votes" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "status" "VoteStatus" NOT NULL DEFAULT 'abierta',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "assembly_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_ballots" (
    "id" TEXT NOT NULL,
    "vote_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "voter_name" TEXT NOT NULL,
    "choice" "BallotChoice" NOT NULL,
    "cast_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assembly_ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_attendance" (
    "id" TEXT NOT NULL,
    "assembly_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "proxy_name" TEXT,

    CONSTRAINT "assembly_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "category" "DocCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "visibility" "DocVisibility" NOT NULL DEFAULT 'admin',
    "status" "DocStatus" NOT NULL DEFAULT 'vigente',
    "expires_on" DATE,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "body_text" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "notes" TEXT,
    "uploaded_by" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "device" "AuditDevice" NOT NULL DEFAULT 'Escritorio',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_email_key" ON "users"("company_id", "email");

-- CreateIndex
CREATE INDEX "condominiums_company_id_idx" ON "condominiums"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "condominiums_company_id_code_key" ON "condominiums"("company_id", "code");

-- CreateIndex
CREATE INDEX "structural_units_condominium_id_idx" ON "structural_units"("condominium_id");

-- CreateIndex
CREATE INDEX "structural_units_parent_id_idx" ON "structural_units"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "structural_units_condominium_id_parent_id_name_key" ON "structural_units"("condominium_id", "parent_id", "name");

-- CreateIndex
CREATE INDEX "properties_condominium_id_idx" ON "properties"("condominium_id");

-- CreateIndex
CREATE INDEX "properties_structural_unit_id_idx" ON "properties"("structural_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_condominium_id_code_key" ON "properties"("condominium_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_condominium_id_name_key" ON "amenities"("condominium_id", "name");

-- CreateIndex
CREATE INDEX "amenity_schedules_amenity_id_idx" ON "amenity_schedules"("amenity_id");

-- CreateIndex
CREATE INDEX "condominium_documents_condominium_id_idx" ON "condominium_documents"("condominium_id");

-- CreateIndex
CREATE INDEX "condominium_documents_amenity_id_idx" ON "condominium_documents"("amenity_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_user_id_key" ON "persons"("user_id");

-- CreateIndex
CREATE INDEX "persons_company_id_idx" ON "persons"("company_id");

-- CreateIndex
CREATE INDEX "persons_company_id_id_number_idx" ON "persons"("company_id", "id_number");

-- CreateIndex
CREATE INDEX "property_members_property_id_idx" ON "property_members"("property_id");

-- CreateIndex
CREATE INDEX "property_members_person_id_idx" ON "property_members"("person_id");

-- CreateIndex
CREATE INDEX "member_access_schedules_member_id_idx" ON "member_access_schedules"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_access_schedules_member_id_day_of_week_starts_at_key" ON "member_access_schedules"("member_id", "day_of_week", "starts_at");

-- CreateIndex
CREATE INDEX "vehicles_property_id_idx" ON "vehicles"("property_id");

-- CreateIndex
CREATE INDEX "vehicles_plate_idx" ON "vehicles"("plate");

-- CreateIndex
CREATE INDEX "pets_property_id_idx" ON "pets"("property_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_property_id_idx" ON "emergency_contacts"("property_id");

-- CreateIndex
CREATE INDEX "property_events_property_id_created_at_idx" ON "property_events"("property_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "person_documents_person_id_idx" ON "person_documents"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_invitations_token_key" ON "person_invitations"("token");

-- CreateIndex
CREATE INDEX "person_invitations_person_id_idx" ON "person_invitations"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_batches_condominium_id_batch_type_period_key" ON "fee_batches"("condominium_id", "batch_type", "period");

-- CreateIndex
CREATE INDEX "charges_property_id_due_date_idx" ON "charges"("property_id", "due_date");

-- CreateIndex
CREATE INDEX "charges_condominium_id_period_idx" ON "charges"("condominium_id", "period");

-- CreateIndex
CREATE INDEX "payments_property_id_payment_date_idx" ON "payments"("property_id", "payment_date");

-- CreateIndex
CREATE INDEX "payment_allocations_charge_id_idx" ON "payment_allocations"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_charge_id_key" ON "payment_allocations"("payment_id", "charge_id");

-- CreateIndex
CREATE INDEX "billing_run_log_condominium_id_run_date_idx" ON "billing_run_log"("condominium_id", "run_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "water_tariff_tiers_condominium_id_tier_order_key" ON "water_tariff_tiers"("condominium_id", "tier_order");

-- CreateIndex
CREATE UNIQUE INDEX "water_readings_charge_id_key" ON "water_readings"("charge_id");

-- CreateIndex
CREATE INDEX "water_readings_property_id_period_idx" ON "water_readings"("property_id", "period" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "water_readings_property_id_period_key" ON "water_readings"("property_id", "period");

-- CreateIndex
CREATE INDEX "property_service_suspensions_property_id_idx" ON "property_service_suspensions"("property_id");

-- CreateIndex
CREATE INDEX "communications_condominium_id_created_at_idx" ON "communications"("condominium_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "communication_recipients_communication_id_idx" ON "communication_recipients"("communication_id");

-- CreateIndex
CREATE INDEX "communication_recipients_person_id_idx" ON "communication_recipients"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_recipients_communication_id_person_id_key" ON "communication_recipients"("communication_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_charge_id_key" ON "reservations"("charge_id");

-- CreateIndex
CREATE INDEX "reservations_amenity_id_res_date_idx" ON "reservations"("amenity_id", "res_date");

-- CreateIndex
CREATE INDEX "reservations_property_id_idx" ON "reservations"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_communication_id_key" ON "calendar_events"("communication_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_reservation_id_key" ON "calendar_events"("reservation_id");

-- CreateIndex
CREATE INDEX "calendar_events_condominium_id_event_date_idx" ON "calendar_events"("condominium_id", "event_date");

-- CreateIndex
CREATE UNIQUE INDEX "visit_authorizations_code_key" ON "visit_authorizations"("code");

-- CreateIndex
CREATE INDEX "visit_authorizations_property_id_idx" ON "visit_authorizations"("property_id");

-- CreateIndex
CREATE INDEX "visit_authorizations_condominium_id_created_at_idx" ON "visit_authorizations"("condominium_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "visit_authorizations_code_idx" ON "visit_authorizations"("code");

-- CreateIndex
CREATE INDEX "visit_schedules_authorization_id_idx" ON "visit_schedules"("authorization_id");

-- CreateIndex
CREATE INDEX "visit_checkins_authorization_id_idx" ON "visit_checkins"("authorization_id");

-- CreateIndex
CREATE INDEX "incidents_condominium_id_created_at_idx" ON "incidents"("condominium_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "packages_condominium_id_received_at_idx" ON "packages"("condominium_id", "received_at" DESC);

-- CreateIndex
CREATE INDEX "packages_property_id_idx" ON "packages"("property_id");

-- CreateIndex
CREATE INDEX "content_items_condominium_id_published_at_idx" ON "content_items"("condominium_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "assets_condominium_id_idx" ON "assets"("condominium_id");

-- CreateIndex
CREATE INDEX "providers_condominium_id_idx" ON "providers"("condominium_id");

-- CreateIndex
CREATE INDEX "maintenance_tickets_condominium_id_created_at_idx" ON "maintenance_tickets"("condominium_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "maintenance_tickets_condominium_id_status_idx" ON "maintenance_tickets"("condominium_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_photos_ticket_id_idx" ON "maintenance_photos"("ticket_id");

-- CreateIndex
CREATE INDEX "auth_log_user_id_created_at_idx" ON "auth_log"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "projects_condominium_id_created_at_idx" ON "projects"("condominium_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "project_milestones_project_id_idx" ON "project_milestones"("project_id");

-- CreateIndex
CREATE INDEX "project_checklist_items_project_id_idx" ON "project_checklist_items"("project_id");

-- CreateIndex
CREATE INDEX "project_expenses_project_id_idx" ON "project_expenses"("project_id");

-- CreateIndex
CREATE INDEX "project_updates_project_id_created_at_idx" ON "project_updates"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chart_of_accounts_company_id_idx" ON "chart_of_accounts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_company_id_code_key" ON "chart_of_accounts"("company_id", "code");

-- CreateIndex
CREATE INDEX "journal_entries_condominium_id_entry_date_idx" ON "journal_entries"("condominium_id", "entry_date" DESC);

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_condominium_id_account_id_period_key" ON "budget_lines"("condominium_id", "account_id", "period");

-- CreateIndex
CREATE INDEX "assemblies_condominium_id_event_date_idx" ON "assemblies"("condominium_id", "event_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "assembly_votes_topic_id_key" ON "assembly_votes"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_ballots_vote_id_property_id_key" ON "assembly_ballots"("vote_id", "property_id");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_attendance_assembly_id_property_id_key" ON "assembly_attendance"("assembly_id", "property_id");

-- CreateIndex
CREATE INDEX "documents_condominium_id_category_idx" ON "documents"("condominium_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_key" ON "document_versions"("document_id", "version");

-- CreateIndex
CREATE INDEX "audit_log_company_id_occurred_at_idx" ON "audit_log"("company_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_company_id_module_idx" ON "audit_log"("company_id", "module");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominiums" ADD CONSTRAINT "condominiums_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominiums" ADD CONSTRAINT "condominiums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structural_units" ADD CONSTRAINT "structural_units_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structural_units" ADD CONSTRAINT "structural_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "structural_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_structural_unit_id_fkey" FOREIGN KEY ("structural_unit_id") REFERENCES "structural_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenities" ADD CONSTRAINT "amenities_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amenity_schedules" ADD CONSTRAINT "amenity_schedules_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominium_financial_settings" ADD CONSTRAINT "condominium_financial_settings_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominium_documents" ADD CONSTRAINT "condominium_documents_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominium_documents" ADD CONSTRAINT "condominium_documents_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_members" ADD CONSTRAINT "property_members_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_members" ADD CONSTRAINT "property_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_access_schedules" ADD CONSTRAINT "member_access_schedules_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "property_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_events" ADD CONSTRAINT "property_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_invitations" ADD CONSTRAINT "person_invitations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_batches" ADD CONSTRAINT "fee_batches_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_batches" ADD CONSTRAINT "fee_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "fee_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_log" ADD CONSTRAINT "billing_run_log_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_tariff_tiers" ADD CONSTRAINT "water_tariff_tiers_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_readings" ADD CONSTRAINT "water_readings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_readings" ADD CONSTRAINT "water_readings_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_service_suspensions" ADD CONSTRAINT "property_service_suspensions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_targets" ADD CONSTRAINT "communication_targets_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_targets" ADD CONSTRAINT "communication_targets_structural_unit_id_fkey" FOREIGN KEY ("structural_unit_id") REFERENCES "structural_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_targets" ADD CONSTRAINT "communication_targets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_targets" ADD CONSTRAINT "communication_targets_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_attachments" ADD CONSTRAINT "communication_attachments_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_authorizations" ADD CONSTRAINT "visit_authorizations_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_authorizations" ADD CONSTRAINT "visit_authorizations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_schedules" ADD CONSTRAINT "visit_schedules_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "visit_authorizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_checkins" ADD CONSTRAINT "visit_checkins_authorization_id_fkey" FOREIGN KEY ("authorization_id") REFERENCES "visit_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_visit_authorization_id_fkey" FOREIGN KEY ("visit_authorization_id") REFERENCES "visit_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_photos" ADD CONSTRAINT "maintenance_photos_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_log" ADD CONSTRAINT "auth_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_checklist_items" ADD CONSTRAINT "project_checklist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_expenses" ADD CONSTRAINT "project_expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_charge_ref_id_fkey" FOREIGN KEY ("charge_ref_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_payment_ref_id_fkey" FOREIGN KEY ("payment_ref_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_ticket_ref_id_fkey" FOREIGN KEY ("ticket_ref_id") REFERENCES "maintenance_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_expense_ref_id_fkey" FOREIGN KEY ("expense_ref_id") REFERENCES "project_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_attachments" ADD CONSTRAINT "assembly_attachments_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_topics" ADD CONSTRAINT "assembly_topics_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_votes" ADD CONSTRAINT "assembly_votes_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "assembly_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_ballots" ADD CONSTRAINT "assembly_ballots_vote_id_fkey" FOREIGN KEY ("vote_id") REFERENCES "assembly_votes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_ballots" ADD CONSTRAINT "assembly_ballots_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_attendance" ADD CONSTRAINT "assembly_attendance_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assemblies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_attendance" ADD CONSTRAINT "assembly_attendance_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
