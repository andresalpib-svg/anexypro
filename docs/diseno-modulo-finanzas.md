# Rediseño del Módulo de Finanzas — ANEXYpro

**Documento de arquitectura previo a programación.**
Fecha: 26 de julio de 2026 · Alcance: Finanzas, Contabilidad, Facturación Electrónica y Asistente Financiero.

> **Principio rector de todo el documento:**
> *La complejidad la asume el sistema, nunca el usuario.*
> Cada decisión de diseño se somete a esta prueba: si obliga al administrador a saber contabilidad, está mal diseñada.

---

## Resumen ejecutivo (para leer en 3 minutos)

ANEXYpro ya tiene **el activo más difícil de construir y el que la competencia no tiene bien resuelto**: un motor de partida doble real, con plan de cuentas por empresa, asientos que se validan antes de escribirse y reconocimiento de ingreso por devengo. Eso es una ventaja competitiva grande y no hay que tocarla.

Lo que falta no es el motor contable: es **todo el lado del dinero que sale y del dinero que entra por banco**.

| Estado | Componentes |
|---|---|
| **Sólido hoy** | Partida doble, plan de cuentas, cargos, pagos, aplicación de pagos, facturación de cuota ordinaria, agua por lectura, suspensión de servicios por morosidad, Balance General, Estado de Resultados, Libro Diario |
| **Existe pero incompleto** | Presupuesto (la tabla existe, no hay pantallas ni comparativo), multimoneda (los campos existen, nada los usa), facturación automática (los campos y la bitácora existen, **no hay proceso que la ejecute**) |
| **No existe** | Gastos como entidad propia, cuentas por pagar, proveedores con cédula jurídica, cuentas bancarias, conciliación bancaria, **cálculo de intereses moratorios**, flujo de caja, cierre mensual, fondo de reserva, facturación electrónica, contratos, aprobación de pagos, asistente financiero |

**Los tres hallazgos más importantes de la auditoría:**

1. **El interés moratorio no se calcula nunca.** El campo `lateInterestRate` y el tipo de cargo `interes_moratorio` existen en la base de datos, pero **ninguna línea de código los usa**. Un condominio que confíe en ANEXYpro para cobrar intereses hoy no está cobrando nada.
2. **La facturación automática no se ejecuta.** `autoBilling`, `autoBillingDay` y la bitácora `BillingRunLog` están modelados, pero no hay tarea programada. Hoy alguien tiene que entrar a apretar el botón todos los meses; si se le olvida, no se emitió la cuota.
3. **El gasto no existe como concepto financiero.** Solo se contabiliza gasto que venga de un ticket de mantenimiento o de un proyecto. La póliza del seguro, el salario del guarda, el recibo del agua y la factura del contador **no tienen dónde registrarse**. El Estado de Resultados que produce el sistema hoy está estructuralmente incompleto.

**La decisión más costosa del documento:** la facturación electrónica se **integra con un proveedor especializado por API, no se desarrolla internamente**. La justificación completa está en la Tarea 5; el resumen es que Hacienda cambió de plataforma (TRIBU-CR) en octubre de 2025 y de esquema (v4.4) en septiembre de 2025, y mantener eso al día es un negocio completo, no una funcionalidad.

---

# TAREA 1 — Auditoría funcional comparada

## 1.1 Nota metodológica y límites de esta auditoría

- **ANEXYpro**: auditado directamente sobre el código fuente (`prisma/schema.prisma`, `src/lib/services/finance.ts`, `src/lib/services/accounting.ts`, `src/app/app/finanzas/*`, `src/app/app/contabilidad/*`). Es la única de las tres donde la evaluación es de primera mano y verificable.
- **Aditum**: evaluado sobre su material público. Es el competidor más maduro en el país y publica su lista de funcionalidades financieras con detalle.
- **HAC**: evaluado sobre su sitio público. Es un producto más nuevo y con comunicación mucho más escueta en lo financiero — su sitio no menciona morosidad, intereses, presupuesto, conciliación, facturación electrónica ni proveedores, y sus contadores de clientes aparecen sin datos reales ("0+").

**Advertencia honesta:** para Aditum y HAC estoy leyendo material de mercadeo, no el producto. Una lista de funcionalidades en una página web dice qué promete el vendedor, no qué tan bien está resuelto. Donde marco una ventaja de la competencia, es una ventaja *declarada*. Antes de tomar decisiones de producto sobre estas comparaciones conviene una demo real de ambos.

## 1.2 Matriz de auditoría

Leyenda: ✅ existe y funciona · ⚠️ existe incompleto · ❌ no existe · ❓ no verificable

### A. Ingresos y cuentas por cobrar

| Funcionalidad | ANEXYpro | Aditum | HAC | Diagnóstico |
|---|---|---|---|---|
| Cuota ordinaria | ✅ `generateOrdinaryBilling` con lote (`FeeBatch`) e idempotencia por período | ✅ | ✅ | **Mantener.** Bien resuelto. |
| Cuota extraordinaria | ⚠️ existe como tipo de cargo, se emite una por una | ✅ declarada | ❓ | **Mejorar:** emisión masiva con derrama por coeficiente y opción de cuotas. |
| Agua por consumo | ✅ `WaterReading` + tarifa por bloques (`WaterTariffTier`) | ✅ | ❓ | **Mantener.** ANEXYpro va más lejos que lo que la competencia declara. |
| Cálculo por coeficiente de copropiedad | ✅ `feeCalculation` (fija/por coeficiente) | ✅ | ❓ | **Mantener.** |
| Multas | ⚠️ tipo de cargo manual | ❓ | ❓ | **Simplificar:** que nazcan del módulo de Seguridad/Reglamento, no de digitación. |
| **Intereses moratorios** | ❌ **el campo existe, el cálculo NO** | ✅ declarada | ❌ no la menciona | **Desarrollar. Prioridad máxima.** Ver §6.5. |
| Estado de cuenta por filial | ✅ con referencia, saldo y "asociado a" | ✅ | ✅ | **Mantener.** |
| Suspensión de servicios por mora | ✅ configurable en meses | ❓ | ❓ | **Innovación propia ya construida.** Conservar y exponerla como diferenciador. |
| Convenios de pago / arreglos | ❌ | ❓ | ❓ | **Desarrollar.** Necesidad real de administración; nadie lo declara. |
| Pasarela de pago en línea | ❌ | ❓ | ❓ | **Desarrollar.** Ver §6.2 — es el mayor salto de cobranza posible. |

### B. Egresos y cuentas por pagar

| Funcionalidad | ANEXYpro | Aditum | HAC | Diagnóstico |
|---|---|---|---|---|
| **Gasto como entidad propia** | ❌ solo desde tickets y proyectos | ✅ | ❓ | **Desarrollar. Prioridad máxima.** |
| Cuentas por pagar | ❌ | ✅ declarada | ❓ | **Desarrollar.** |
| Proveedores con cédula jurídica | ⚠️ `Provider` existe por condominio, sin datos tributarios | ✅ "control de proveedores" | ❓ | **Mejorar:** subir a nivel empresa con cédula, contacto y cuenta bancaria. |
| Gastos recurrentes (salarios, pólizas) | ❌ | ❓ | ❓ | **Desarrollar.** Es el 70 % del gasto de un condominio y hoy no tiene lugar. |
| Aprobación de pagos | ❌ | ❓ | ❓ | **Desarrollar.** Control interno básico que nadie declara. |
| Caja chica | ✅ recién construida, con informe PDF y facturas anexas | ❓ | ❓ | **Innovación propia.** Ninguno de los dos la declara. |
| Contratos y vencimientos | ❌ | ❓ | ❓ | **Desarrollar.** |

### C. Bancos y conciliación

| Funcionalidad | ANEXYpro | Aditum | HAC | Diagnóstico |
|---|---|---|---|---|
| Cuentas bancarias | ❌ | ❓ | ❓ | **Desarrollar.** Sin esto no hay flujo de caja real. |
| Conciliación bancaria | ❌ | ❓ | ❌ no la menciona | **Desarrollar.** Ver §6.1 — aquí está la mayor innovación posible. |
| Importación de estado de cuenta bancario | ❌ | ❓ | ❓ | **Desarrollar.** |
| Multimoneda (CRC/USD) | ⚠️ campos `paidCurrency`, `fxRate`, `fxDate` modelados, **sin uso** | ❓ | ❓ | **Completar.** El 80 % del trabajo (el modelo) ya está hecho. |

### D. Contabilidad

| Funcionalidad | ANEXYpro | Aditum | HAC | Diagnóstico |
|---|---|---|---|---|
| **Partida doble real** | ✅ `JournalEntry`/`JournalLine`, validación en código **y** trigger en base de datos | ❓ no lo declara | ❓ | **Ventaja competitiva. No tocar.** |
| Plan de cuentas | ✅ jerárquico por empresa | ❓ | ❓ | **Mantener**, agregar cuentas de gasto y banco. |
| Devengo (ingreso al emitir, no al cobrar) | ✅ documentado y aplicado | ❓ | ❓ | **Ventaja competitiva.** |
| Balance General | ✅ | ✅ "balance de situación" | ❓ | **Mantener.** |
| Estado de Resultados | ✅ | ✅ | ❓ | **Mantener** — pero hoy incompleto por la ausencia de gastos. |
| Libro Diario / Mayor | ✅ diario; ❌ mayor por cuenta | ✅ "balance de comprobación" | ❓ | **Completar.** |
| **Cierre mensual y bloqueo de período** | ❌ | ❓ | ❓ | **Desarrollar.** Sin esto, cualquiera reescribe meses cerrados. |
| Fondo de reserva | ❌ | ❓ | ❓ | **Desarrollar.** Exigencia práctica de asambleas. |

### E. Presupuesto y análisis

| Funcionalidad | ANEXYpro | Aditum | HAC | Diagnóstico |
|---|---|---|---|---|
| Presupuesto anual | ⚠️ tabla `BudgetLine` existe, **sin una sola pantalla** | ✅ "presupuestos" | ❓ | **Completar.** El modelo ya está. |
| Presupuesto vs. ejecución | ❌ | ✅ declarada | ❓ | **Desarrollar.** |
| Flujo de caja | ❌ | ❓ | ❓ | **Desarrollar.** |
| Proyección financiera | ❌ | ❓ | ❓ | **Innovación.** |
| Reporte de morosidad | ⚠️ hay saldos por filial, no antigüedad de saldos | ✅ declarada | ❓ | **Mejorar:** antigüedad 30/60/90/+120. |
| Facturación electrónica | ❌ | ✅ declarada | ❌ | **Desarrollar (integrando).** Ver Tarea 5. |
| Asistente financiero con IA | ❌ (hay IA en reportes, no financiera) | ❌ | ❌ | **Innovación exclusiva.** Ver Tarea 7. |

## 1.3 Lectura estratégica

**Dónde ANEXYpro ya gana:** motor contable de verdad, agua por consumo con tarifa escalonada, suspensión automática de servicios, caja chica con respaldo documental, y el ecosistema no financiero (visitas, seguridad, asambleas) que ya está construido.

**Dónde ANEXYpro pierde hoy:** todo el ciclo del egreso. Aditum declara cuentas por pagar, proveedores, presupuesto y facturación electrónica; ANEXYpro no tiene ninguna de las cuatro. Un administrador que evalúe ambos productos con una factura de proveedor en la mano ve la diferencia en treinta segundos.

**Dónde nadie está jugando todavía** — y por eso son las apuestas de innovación de este rediseño:

1. **Conciliación bancaria automática con aprendizaje.** Ninguno de los tres la declara.
2. **Cobranza con pago en línea y aplicación automática.** Cerrar el ciclo cobro→pago→asiento sin intervención.
3. **Asistente financiero con IA en lenguaje natural.** Nadie lo ofrece en este mercado.
4. **Cero digitación contable.** El administrador nunca ve una cuenta contable; el sistema la deduce.

---

# TAREA 2 — Arquitectura del módulo

## 2.1 Mapa de módulos

```
FINANZAS (/app/finanzas)
│
├── 1. Panel Financiero            → Tarea 4
├── 2. Ingresos
│   ├── 2.1 Cuotas y facturación   (existe, completar)
│   ├── 2.2 Cobros y pagos         (existe, completar)
│   ├── 2.3 Morosidad y cobranza   (nuevo)
│   └── 2.4 Convenios de pago      (nuevo)
├── 3. Egresos
│   ├── 3.1 Gastos                 (NUEVO — núcleo)
│   ├── 3.2 Proveedores            (nuevo, sube de condominio a empresa)
│   ├── 3.3 Gastos recurrentes     (nuevo)
│   ├── 3.4 Contratos              (nuevo)
│   └── 3.5 Caja chica             (existe)
├── 4. Bancos
│   ├── 4.1 Cuentas bancarias      (nuevo)
│   ├── 4.2 Conciliación           (NUEVO — innovación)
│   └── 4.3 Flujo de caja          (nuevo)
├── 5. Presupuesto
│   ├── 5.1 Presupuesto anual      (modelo existe, falta UI)
│   └── 5.2 Ejecución vs. real     (nuevo)
├── 6. Contabilidad  ← visible solo con permiso contable
│   ├── 6.1 Estados financieros    (existe)
│   ├── 6.2 Libro diario y mayor   (diario existe)
│   ├── 6.3 Plan de cuentas        (existe)
│   ├── 6.4 Asientos manuales      (nuevo, para el contador)
│   └── 6.5 Cierre mensual         (nuevo)
├── 7. Facturación Electrónica     (nuevo) → Tarea 5
└── 8. Asistente Financiero IA     (nuevo) → Tarea 7
```

## 2.2 Modelo de datos

### Entidades nuevas

```prisma
// ---------- BANCOS ----------
model BankAccount {
  id             String   @id @default(uuid())
  companyId      String
  condominiumId  String        // una cuenta pertenece a UN condominio: nunca se mezcla plata
  name           String        // "BAC Cuenta Corriente ¢"
  bankName       String
  accountNumber  String
  iban           String?
  currency       Currency @default(CRC)
  accountCode    String        // cuenta contable espejo (1002, 1003…)
  openingBalance Decimal  @db.Decimal(14,2)
  openingDate    DateTime @db.Date
  isActive       Boolean  @default(true)
  // El saldo NO se guarda: se deriva de openingBalance + movimientos.
}

model BankTransaction {
  id             String   @id @default(uuid())
  companyId      String
  bankAccountId  String
  txDate         DateTime @db.Date
  description    String        // literal del banco, sin editar
  reference      String?
  amount         Decimal  @db.Decimal(14,2)  // + entra, − sale
  balanceAfter   Decimal? @db.Decimal(14,2)
  importBatchId  String?
  fingerprint    String        // hash(cuenta+fecha+monto+ref) → evita duplicar al reimportar
  status         BankTxStatus @default(sin_conciliar)
  matchedType    String?       // 'payment' | 'expense' | 'journal'
  matchedId      String?
  matchedAt      DateTime?
  matchedById    String?
  matchConfidence Int?         // 0-100, lo escribe el motor de conciliación
  @@unique([bankAccountId, fingerprint])
}

// ---------- EGRESOS ----------
model Supplier {
  id            String   @id @default(uuid())
  companyId     String        // a nivel EMPRESA: se reutiliza entre condominios
  legalName     String
  tradeName     String?
  taxId         String?       // cédula jurídica — obligatoria si se le factura
  taxIdType     TaxIdType?
  email         String?
  phone         String?
  bankAccount   String?       // para pagarle por transferencia
  defaultAccountCode String?  // ← aprende: la cuenta de gasto que más usa
  defaultCategory    String?
  isActive      Boolean  @default(true)
}

model Expense {
  id              String   @id @default(uuid())
  companyId       String
  condominiumId   String
  supplierId      String?
  expenseNumber   Int           // consecutivo por condominio, legible
  category        ExpenseCategory
  accountCode     String        // cuenta de gasto — la sugiere el sistema
  description     String
  issueDate       DateTime @db.Date   // fecha de la factura
  dueDate         DateTime? @db.Date  // vencimiento de pago
  subtotal        Decimal  @db.Decimal(14,2)
  taxAmount       Decimal  @default(0) @db.Decimal(14,2)
  total           Decimal  @db.Decimal(14,2)
  currency        Currency @default(CRC)
  fxRate          Decimal? @db.Decimal(10,4)
  status          ExpenseStatus @default(borrador)
  // borrador → por_aprobar → aprobado → pagado (o anulado)
  documentUrl     String?       // factura escaneada o XML
  documentType    String?
  isRecurring     Boolean  @default(false)
  recurringId     String?
  projectId       String?       // si es gasto de un proyecto
  ticketId        String?       // si nace de un ticket de mantenimiento
  budgetAccountId String?
  approvedById    String?
  approvedAt      DateTime?
  journalEntryId  String?       // asiento generado
  createdById     String?
  @@unique([condominiumId, expenseNumber])
}

model ExpensePayment {
  id            String   @id @default(uuid())
  expenseId     String
  bankAccountId String?
  amount        Decimal  @db.Decimal(14,2)
  paymentDate   DateTime @db.Date
  method        PaymentMethod
  reference     String?
  receiptUrl    String?
  journalEntryId String?
  // Un gasto admite pagos parciales; el saldo se deriva.
}

model RecurringExpense {
  id            String   @id @default(uuid())
  companyId     String
  condominiumId String
  supplierId    String?
  description   String
  accountCode   String
  amount        Decimal  @db.Decimal(14,2)  // 0 = monto variable, se pide al generar
  frequency     RecurringFrequency          // mensual | bimensual | trimestral | semestral | anual
  dayOfMonth    Int
  startDate     DateTime @db.Date
  endDate       DateTime? @db.Date
  autoCreate    Boolean  @default(true)     // crea el gasto en borrador solo
  isActive      Boolean  @default(true)
  lastRunAt     DateTime?
}

model Contract {
  id            String   @id @default(uuid())
  companyId     String
  condominiumId String
  supplierId    String
  title         String
  serviceType   String
  startDate     DateTime @db.Date
  endDate       DateTime @db.Date
  monthlyAmount Decimal? @db.Decimal(14,2)
  autoRenew     Boolean  @default(false)
  noticeDays    Int      @default(30)   // aviso previo de vencimiento
  documentUrl   String?
  recurringExpenseId String?            // el contrato genera el gasto recurrente
  status        ContractStatus @default(vigente)
}

// ---------- COBRANZA ----------
model PaymentPlan {              // convenio de pago
  id            String   @id @default(uuid())
  companyId     String
  propertyId    String
  totalDebt     Decimal  @db.Decimal(14,2)
  downPayment   Decimal  @default(0) @db.Decimal(14,2)
  installments  Int
  startDate     DateTime @db.Date
  status        PlanStatus @default(vigente)
  // vigente | cumplido | incumplido
  documentUrl   String?          // convenio firmado
  approvedById  String?
}

model CollectionAction {         // bitácora de gestión de cobro
  id          String   @id @default(uuid())
  companyId   String
  propertyId  String
  actionType  CollectionType  // recordatorio | aviso | llamada | carta | legal
  channel     String?         // email | whatsapp | sistema
  notes       String?
  automated   Boolean @default(false)
  createdById String?
  createdAt   DateTime @default(now())
}

// ---------- CIERRE Y FONDO ----------
model AccountingPeriod {
  id            String   @id @default(uuid())
  companyId     String
  condominiumId String
  period        String        // 'YYYY-MM'
  status        PeriodStatus @default(abierto)  // abierto | cerrado
  closedById    String?
  closedAt      DateTime?
  snapshot      Json?         // saldos congelados al cierre
  @@unique([condominiumId, period])
}

model ReserveFund {
  id            String   @id @default(uuid())
  companyId     String
  condominiumId String
  name          String
  targetAmount  Decimal? @db.Decimal(14,2)
  monthlyQuota  Decimal  @default(0) @db.Decimal(14,2)
  accountCode   String
  bankAccountId String?
  // El saldo se deriva de sus movimientos.
}
```

### Entidades a modificar

| Entidad | Cambio | Razón |
|---|---|---|
| `Charge` | + `interestBaseChargeId`, `interestThroughDate` | Trazar de qué cargo nace cada interés y hasta qué fecha se calculó, para no cobrar dos veces |
| `Payment` | + `bankAccountId`, + `bankTransactionId` | Amarrar el pago a la cuenta y al movimiento bancario conciliado |
| `CondominiumFinancialSettings` | + `interestGraceDays`, `interestCalcBase`, `interestMaxRate`, `reserveFundPct`, `autoInterest` | Parametrizar el cálculo de mora que hoy no existe |
| `ChartOfAccount` | Ampliar catálogo de gasto (5xxx) y bancos (1002+) | Hoy el catálogo de gasto es mínimo |
| `JournalEntry` | + `periodLocked` derivado de `AccountingPeriod` | Impedir escribir en meses cerrados |
| `Provider` (mantenimiento) | Migrar a `Supplier` | Hoy vive por condominio y sin datos tributarios |

### Flujo de información

```
                        ┌──────────────────┐
   Residente paga ─────►│                  │
   Admin registra ─────►│  CARGO / PAGO    ├──► Asiento automático ──┐
   Facturación auto ───►│                  │                         │
                        └──────────────────┘                         │
                        ┌──────────────────┐                         ▼
   Foto de factura ────►│                  │                  ┌─────────────┐
   Gasto recurrente ───►│      GASTO       ├──► Asiento ─────►│  LIBRO      │
   Ticket / proyecto ──►│                  │                  │  DIARIO     │
                        └──────────────────┘                  └──────┬──────┘
                        ┌──────────────────┐                         │
   Estado bancario ────►│   CONCILIACIÓN   ├──► confirma/crea ───────┤
                        └──────────────────┘                         │
                                                                     ▼
                                          ┌──────────────────────────────────┐
                                          │ Balance · Resultados · Flujo     │
                                          │ Presupuesto vs real · Morosidad  │
                                          │ Panel · Asistente IA             │
                                          └──────────────────────────────────┘
```

**Regla arquitectónica innegociable:** ningún estado financiero se calcula desde tablas operativas. Todos leen del Libro Diario. Si un movimiento no generó asiento, no existe para los estados financieros. Eso es lo que garantiza que el Balance siempre cuadre.

## 2.3 Especificación de procesos

Formato: **qué pide → qué calcula → qué hace en segundo plano → qué reporta → quién puede → a qué alimenta**

### P1. Emisión de cuota ordinaria (existe — automatizar)

- **Pide:** nada. Se dispara sola el día configurado.
- **Calcula:** monto por filial (fijo o por coeficiente), parqueos, agua según lectura y tarifa escalonada, fecha de vencimiento.
- **En segundo plano:** crea el lote, los cargos, el asiento de devengo por cada cargo, notifica a los residentes, escribe en `BillingRunLog`.
- **Reporta:** resumen del lote, comparativo contra el mes anterior.
- **Permiso:** automático; `finanzas.emitir` para forzarlo a mano.
- **Alimenta:** estado de cuenta, morosidad, panel, presupuesto, Estado de Resultados.

### P2. Cálculo de interés moratorio (NUEVO — crítico)

- **Pide:** nada.
- **Calcula:** por cada cargo vencido más allá de los días de gracia, `interés = saldo × tasa × días/30`, según sea simple o compuesto; nunca sobre intereses previos si la política es simple; tope configurable.
- **En segundo plano:** corre diario; crea un cargo `interes_moratorio` **por período y por cargo base**, marcando `interestThroughDate` para no duplicar. Idempotente: correrlo dos veces el mismo día no cobra dos veces.
- **Reporta:** detalle de intereses generados; el residente ve el desglose en su estado de cuenta.
- **Permiso:** automático; anulación requiere `finanzas.ajustar` con motivo obligatorio.
- **Alimenta:** estado de cuenta, morosidad, ingresos.

> **Nota contable importante:** el interés moratorio en un condominio no es una ganancia comercial, es un resarcimiento. Se reconoce como ingreso al devengarse, pero conviene mantenerlo en una cuenta separada (4901 hoy; propongo una cuenta propia 4204) para que la asamblea vea cuánto del ingreso viene de mora y no de cuota. Esa distinción cambia decisiones.

### P3. Registro de gasto (NUEVO — núcleo del rediseño)

- **Pide:** foto o PDF de la factura. **Nada más, en el caso ideal.**
- **Calcula:** el sistema extrae proveedor, fecha, número de factura, subtotal, impuesto y total del documento; deduce la cuenta contable y la categoría del historial de ese proveedor; sugiere la partida presupuestaria.
- **En segundo plano:** crea el gasto en borrador, lo enruta a aprobación si supera el monto configurado, genera el asiento al aprobarse, verifica presupuesto y avisa si lo excede, deja el gasto disponible para conciliación bancaria.
- **Reporta:** gasto por categoría, por proveedor, por mes; ejecución presupuestaria.
- **Permiso:** `finanzas.gasto.crear`; aprobar requiere `finanzas.gasto.aprobar` (nunca la misma persona que creó, si la empresa activa segregación de funciones).
- **Alimenta:** Estado de Resultados, flujo de caja, presupuesto, conciliación, panel, asistente IA.

### P4. Conciliación bancaria (NUEVO — innovación)

- **Pide:** el archivo del estado de cuenta del banco. Un solo arrastre.
- **Calcula:** por cada movimiento, busca el pago o gasto que le corresponde y le asigna una confianza de 0 a 100 (monto exacto + fecha cercana + referencia + patrón histórico del mismo texto bancario).
- **En segundo plano:** ≥95 concilia solo; 70-94 lo propone y espera un clic; <70 lo deja para revisión manual. Aprende: cada confirmación manual entrena la regla para la próxima vez.
- **Reporta:** conciliación del mes, partidas en tránsito, movimientos sin identificar.
- **Permiso:** `finanzas.banco`.
- **Alimenta:** flujo de caja, saldo real de bancos, panel.

### P5. Cierre mensual (NUEVO)

- **Pide:** confirmación.
- **Calcula:** verifica que todo cuadre — Balance balanceado, bancos conciliados, sin gastos en borrador, sin cargos sin asiento.
- **En segundo plano:** congela el período, guarda un `snapshot` de saldos, bloquea escritura de asientos con esa fecha.
- **Reporta:** paquete de cierre en PDF (Balance, Resultados, flujo, morosidad, ejecución presupuestaria).
- **Permiso:** `finanzas.cerrar` — solo administrador propietario.
- **Alimenta:** comparativos históricos, asambleas, proyecciones.

## 2.4 Matriz de permisos

| Proceso | Master | Admin propietario | Supervisor | Contador | Junta Directiva | Residente |
|---|---|---|---|---|---|---|
| Ver panel financiero | ✅ | ✅ | ⚠️ solo sus condominios | ✅ | ✅ solo lectura | ❌ |
| Emitir cuotas | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Registrar pago | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Anular pago o cargo | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Crear gasto | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Aprobar gasto** | ❌ | ✅ | ❌ | ❌ | ⚠️ configurable | ❌ |
| Conciliar banco | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Asiento manual | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| Cerrar mes | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver estados financieros | ✅ | ✅ | ❌ | ✅ | ✅ | ⚠️ si la asamblea lo aprueba |
| Su propio estado de cuenta | — | — | — | — | — | ✅ |

**Rol nuevo propuesto: Contador.** Hoy no existe. Un contador externo necesita entrar a ver el diario, hacer ajustes y sacar estados financieros, **sin** poder tocar residentes, visitas ni seguridad. Es un rol que se vende solo a las administradoras.

---

# TAREA 3 — Rediseño de la experiencia

## 3.1 El método: interrogar cada campo

Antes de pedir un dato, se le aplican cinco preguntas. Aplicadas al **registro de un gasto**, que hoy es el peor flujo del mercado:

| Campo | ¿Necesario? | ¿Se obtiene solo? | Decisión |
|---|---|---|---|
| Condominio | Sí | **Sí** — es el condominio activo | **Eliminado** de la pantalla |
| Proveedor | Sí | **Sí** — se lee de la factura | Precargado, editable |
| Fecha de factura | Sí | **Sí** — se lee de la factura | Precargada |
| N.º de factura | Sí | **Sí** — se lee de la factura | Precargado |
| Monto | Sí | **Sí** — se lee de la factura | Precargado |
| Impuesto | Sí | **Sí** — se lee o se calcula | Precargado |
| **Cuenta contable** | Sí, para contabilidad | **Sí** — la que ese proveedor usó las últimas veces | **Nunca se le muestra al administrador.** Va en "Detalles avanzados", colapsado |
| Categoría | Sí | **Sí** — del proveedor | Precargada |
| Partida presupuestaria | Sí | **Sí** — de la cuenta | Automática |
| Moneda | Sí | **Sí** — del condominio | Solo aparece si el condominio maneja dos monedas |
| Tipo de cambio | Solo si es USD | **Sí** — del BCCR del día | Automático |
| Centro de costo | No siempre | — | Solo si el condominio activó centros de costo |
| Quién registró | Sí | **Sí** — la sesión | Nunca se pregunta |
| Fecha de registro | Sí | **Sí** | Nunca se pregunta |

**Resultado: de 14 campos a 1 acción.** Arrastrar la factura. El administrador revisa y confirma.

## 3.2 Registrar un gasto en menos de un minuto

```
┌────────────────────────────────────────────────────────────┐
│  + Nuevo gasto                                        [X]  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│      ┌──────────────────────────────────────────┐          │
│      │   Arrastra la factura aquí               │          │
│      │   o toma una foto  📷                    │          │
│      │   PDF, XML de Hacienda, JPG o PNG        │          │
│      └──────────────────────────────────────────┘          │
│                                                            │
│      ── o registra sin documento ──                        │
└────────────────────────────────────────────────────────────┘
```

Al soltar el archivo (≈3 segundos de lectura):

```
┌────────────────────────────────────────────────────────────┐
│  Revisá que esté correcto                             [X]  │
├────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  Proveedor                                │
│  │             │  ┌────────────────────────────────────┐   │
│  │  [factura]  │  │ Seguros del Istmo S.A.        ✓ 98%│   │
│  │             │  └────────────────────────────────────┘   │
│  │             │                                           │
│  │             │  Descripción                              │
│  │             │  ┌────────────────────────────────────┐   │
│  │             │  │ Póliza de incendio — julio 2026    │   │
│  └─────────────┘  └────────────────────────────────────┘   │
│  🔍 ver completa                                           │
│                   Fecha            Monto                   │
│                   ┌───────────┐    ┌──────────────────┐    │
│                   │ 22/07/2026│    │ ₡  485.000,00    │    │
│                   └───────────┘    └──────────────────┘    │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 📁 Seguros  ·  presupuesto: ₡520.000  →  queda 6,7 % │  │
│  │ Se clasificó como en las 6 facturas anteriores       │  │
│  │ de este proveedor.                        [cambiar]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ▸ Detalles avanzados (cuenta contable, centro de costo)   │
│                                                            │
│         [ Guardar y registrar otro ]   [ Guardar ]         │
└────────────────────────────────────────────────────────────┘
```

**Tiempo objetivo: 22 segundos** — 3 de lectura, 15 de revisión visual, 4 de confirmación. Contra los 2-4 minutos que toma un formulario tradicional de 14 campos.

Decisiones detrás de la pantalla:

- **La factura se muestra al lado del formulario.** El administrador verifica mirando, no recordando.
- **La confianza de lectura es visible.** Un 98 % da permiso de confiar; un 60 % obliga a revisar. Ocultar la incertidumbre es lo que produce errores silenciosos.
- **El impacto presupuestario se ve ANTES de guardar,** no en un reporte del mes siguiente.
- **La cuenta contable está colapsada.** Existe, es correcta, es auditable — y el administrador no tiene que saber qué es.
- **"Guardar y registrar otro"** existe porque los gastos se digitan en tandas, no de uno en uno.

## 3.3 Otros flujos rediseñados

| Flujo | Hoy | Rediseñado | Ahorro |
|---|---|---|---|
| Registrar pago | Buscar filial, digitar monto, elegir método, aplicar cargo por cargo | Pegar la referencia SINPE → el sistema encuentra filial, monto y aplica al cargo más antiguo | 3 min → **15 s** |
| Emitir cuota mensual | Entrar, elegir condominio, elegir período, generar | **No se hace: ocurre sola** y llega un resumen | 5 min → **0** |
| Conciliar el mes | Excel contra estado de cuenta, línea por línea | Subir el archivo; el sistema concilia ~90 % solo | 3 h → **10 min** |
| Cerrar el mes | No existe | Un botón con lista de verificación previa | — → **2 min** |
| Cobrar morosos | Revisar, redactar, enviar uno por uno | Escalamiento automático configurable | 2 h → **0** |

## 3.4 Reglas de interacción transversales

1. **Nunca pedir lo que se puede deducir.** Condominio activo, usuario, fecha y moneda jamás se preguntan.
2. **Autocompletar con memoria.** El sistema recuerda cómo se clasificó cada proveedor.
3. **Validar mientras se escribe,** no al enviar.
4. **Mostrar consecuencias antes de confirmar** ("esto excede el presupuesto en 6,7 %").
5. **Todo se deshace.** Ningún error financiero debe requerir llamar a soporte.
6. **Vocabulario de administrador, no de contador.** "Lo que entró" y "lo que salió", no "haber" y "debe".
7. **Cero pantallas en blanco.** Cada módulo vacío explica qué hacer primero.

---

# TAREA 4 — Panel Financiero

## 4.1 Diseño

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Finanzas — Residencial Altamar          [Julio 2026 ▾]  [Descargar ▾]   │
├──────────────────────────────────────────────────────────────────────────┤
│  ⚠️ 3 asuntos requieren tu atención                            [ver]     │
│     • 2 pagos esperan aprobación por ₡340.000                            │
│     • El contrato de jardinería vence en 12 días                         │
│     • Mantenimiento excede el presupuesto en 18 %                        │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ INGRESOS     │ │ GASTOS       │ │ RESULTADO    │ │ EN BANCOS    │     │
│  │ ₡4.850.000   │ │ ₡3.920.000   │ │ +₡930.000    │ │ ₡12.480.000  │     │
│  │ ▲ 4,2 % vs   │ │ ▲ 11,8 % vs  │ │ ▼ 18 % vs    │ │ 2 cuentas    │     │
│  │   junio      │ │   junio      │ │   junio      │ │ conciliadas  │     │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │
├────────────────────────────────────────┬─────────────────────────────────┤
│  FLUJO DE CAJA (12 meses + proyección) │  MOROSIDAD                      │
│                                        │                                 │
│   ₡M                        ┊ proyec.  │   Al día      68 %  ████████     │
│  6 ┤      ╭──╮      ╭───╮   ┊          │   1-30 días   14 %  ██           │
│  4 ┤ ╭────╯  ╰──────╯   ╰───┊─ ─ ─     │   31-60 días   9 %  █            │
│  2 ┤─╯                      ┊          │   61-90 días   5 %  ▌            │
│  0 ┼──┬──┬──┬──┬──┬──┬──┬──┬┊─┬──┬──   │   +90 días     4 %  ▌            │
│    ago      nov      feb    ┊ may      │                                 │
│    ── ingresos  ── gastos  ── saldo    │   Cartera: ₡2.340.000           │
│                                        │   Recuperación mes: 91 %        │
├────────────────────────────────────────┼─────────────────────────────────┤
│  PRESUPUESTO VS EJECUCIÓN              │  INDICADORES                    │
│                                        │                                 │
│  Mantenimiento  ████████████▓ 118 % ⚠️  │  Liquidez         3,2  ✅       │
│  Seguridad      ████████▌      86 %    │  Meses de reserva 4,1  ✅       │
│  Servicios      ███████        72 %    │  Morosidad       32 %  ⚠️        │
│  Administración █████▌         61 %    │  Gasto/filial  ₡78k    ✅       │
│  Jardinería     ████▌          49 %    │  Cobranza        91 %  ✅       │
├────────────────────────────────────────┴─────────────────────────────────┤
│  PENDIENTES                                                              │
│  ┌───────────────────┬───────────────────┬───────────────────┐           │
│  │ Por aprobar   (2) │ Por pagar     (5) │ Por conciliar (7) │           │
│  │ ₡340.000          │ ₡1.210.000        │ 7 movimientos     │           │
│  └───────────────────┴───────────────────┴───────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
```

## 4.2 Criterios de diseño del panel

- **Las alertas van arriba de todo.** Un panel que obliga a buscar el problema fracasó. Lo que exige acción se ve antes que lo que solo informa.
- **Toda cifra se compara.** "₡3.920.000" no significa nada; "▲ 11,8 % vs. junio" sí.
- **La proyección se dibuja punteada.** Nunca mezclar el dato real con el estimado en el mismo trazo: es la forma más común de mentirle a un administrador sin querer.
- **La morosidad va por antigüedad, no por total.** ₡2,3 millones con 4 % arriba de 90 días es una situación completamente distinta a ₡2,3 millones todos de este mes.
- **Los indicadores llevan semáforo con umbral configurable.** El número sin criterio no ayuda a quien no es financiero.
- **Todo bloque es clicable** y lleva al detalle filtrado.
- **Actualización:** los saldos se recalculan en cada carga; el panel se refresca solo cada 60 segundos si queda abierto.

## 4.3 Indicadores y sus fórmulas

| Indicador | Fórmula | Verde | Amarillo | Rojo |
|---|---|---|---|---|
| Liquidez | Efectivo ÷ gasto mensual promedio | > 2 | 1 – 2 | < 1 |
| Meses de reserva | Fondo de reserva ÷ gasto mensual | > 3 | 1,5 – 3 | < 1,5 |
| Morosidad | Cartera vencida ÷ cartera total | < 15 % | 15 – 30 % | > 30 % |
| Efectividad de cobranza | Cobrado del mes ÷ facturado del mes | > 90 % | 75 – 90 % | < 75 % |
| Ejecución presupuestaria | Ejecutado ÷ presupuestado a la fecha | 90 – 105 % | 105 – 115 % | > 115 % |
| Dependencia de mora | Ingreso por intereses ÷ ingreso total | < 3 % | 3 – 8 % | > 8 % |

El último es propio: un condominio cuyo ingreso depende de multas e intereses tiene un problema estructural de cobranza que ningún otro indicador revela.

---

# TAREA 5 — Facturación Electrónica Costa Rica

## 5.1 Marco normativo vigente (verificado julio 2026)

| Elemento | Estado |
|---|---|
| Esquema vigente | **Versión 4.4**, resolución **MH-DGT-RES-0027-2024**, confirmada por **MH-DGT-RES-0001-2025** |
| Obligatoriedad | Desde el **1.º de septiembre de 2025** |
| Plataforma oficial | **TRIBU-CR** desde el **6 de octubre de 2025**, en sustitución de ATV. Concentra registro de contribuyentes, generación de llaves criptográficas y validación en tiempo real |
| Comprobantes | Factura Electrónica (FE), Tiquete (TE), Nota de Crédito (NC), Nota de Débito (ND), Factura de Compra, Factura de Exportación y el nuevo **Recibo Electrónico de Pago (REP)** |
| REP | Obligatorio en servicios a instituciones del Estado y en facturas a crédito con diferimiento de IVA de hasta 90 días; se emite **al recibirse el pago real** |
| Firma | XAdES con certificado criptográfico del contribuyente |
| Envío | Por API, **inmediato**. No existe envío por lotes ni diferido para comprobantes ordinarios |
| Efecto legal | Sin validación de Hacienda, el documento **no tiene efecto tributario aunque se haya emitido** |
| Alcance de la 4.4 | Más de 140 ajustes técnicos: nuevos campos obligatorios, nuevos medios de pago, códigos de descuento y mayor especificidad de CABYS |

## 5.2 La pregunta previa que hay que responder antes de programar

**¿Está obligado un condominio a facturar electrónicamente?**

Esta es la pregunta que define el alcance del módulo, y la respuesta pública **no es unánime**. Lo que sí está claro y es consistente entre fuentes:

- La cuota condominal **no lleva IVA**: es un supuesto de **no sujeción**, no una exención cualquiera.
- Existe un código CABYS específico para servicios de asociaciones de propietarios (cuota condominal), aplicable a cuotas ordinarias, extraordinarias, multas e intereses.
- El administrador del condominio **sí tiene obligación de emitir comprobante al propietario**.
- Hay confusión documentada en el propio gremio sobre cómo aplica la normativa a la naturaleza jurídica del condominio.

**Recomendación:** ANEXYpro debe tratar la facturación electrónica como **configurable por condominio**, no como obligatoria para todos. Un condominio con cédula jurídica inscrito como contribuyente la activa; otro no. Y —esto es importante— **antes de programar este módulo, Freddy debe validar el criterio con un contador público o asesor tributario y dejarlo por escrito.** Yo puedo construir la herramienta; la determinación de la obligación tributaria de cada condominio no es una decisión que deba tomar un sistema, ni yo.

## 5.3 Desarrollar internamente vs. integrar por API

### Alternativa A — Desarrollo interno

**Ventajas:** control total, sin costo por documento, sin dependencia de terceros, dato tributario propio.

**Desventajas — y son determinantes:**

- **Mantenimiento normativo perpetuo.** La 4.4 trajo más de 140 cambios y llegó apenas dos años después de la 4.3. Cada resolución obliga a reprogramar y recertificar, con fecha límite impuesta por el Estado.
- **Firma digital XAdES.** Implementarla correctamente es criptografía de firma avanzada, no un `sign()`. Un error deja las facturas rechazadas y sin efecto legal.
- **Custodia de certificados.** Habría que guardar y usar las llaves criptográficas de cada condominio cliente. Eso convierte a ANEXYpro en custodio de credenciales tributarias de terceros: un riesgo legal y de seguridad de primer orden.
- **Alta disponibilidad obligatoria.** El envío es inmediato; si el servicio se cae, el cliente no puede facturar.
- **Contingencia y reintentos.** Manejar caídas de Hacienda, colas y reenvíos es un subsistema completo.
- **Esfuerzo:** entre 3 y 5 meses de desarrollo dedicado, más mantenimiento permanente.

### Alternativa B — Integración con proveedor especializado ✅ **Recomendada**

Existen proveedores costarricenses y regionales con API documentada para v4.4 que se encargan de generar el XML, firmarlo, transmitirlo a Hacienda y almacenar el comprobante, cobrando por documento emitido y sin cuota fija mensual en varios casos.

**Ventajas:** el cumplimiento normativo lo absorbe el proveedor; las llaves criptográficas las custodia quien tiene esa especialidad; el time-to-market baja de meses a semanas; el costo es variable y proporcional al uso.

**Desventajas:** costo por documento, dependencia de un tercero, y menor control sobre incidentes.

### Decisión y mitigación

**Integrar, con una capa de abstracción propia.** ANEXYpro define su propia interfaz interna (`EInvoiceProvider`) con las operaciones que necesita — emitir, consultar estado, anular, notas de crédito y débito — y detrás de ella se conecta el proveedor. Así:

- El resto del sistema no sabe quién es el proveedor.
- Cambiar de proveedor es reimplementar una interfaz, no reescribir el módulo.
- Se puede negociar precio con competencia real.
- Si algún día el volumen justifica desarrollarlo internamente, se implementa la misma interfaz y se cambia sin tocar nada más.

**Criterios de selección del proveedor:** soporte comprobado de v4.4 y REP · API REST documentada · ambiente de pruebas · webhooks de cambio de estado · almacenamiento de XML aceptados · SLA por escrito · precio por documento a volumen · soporte en Costa Rica.

## 5.4 Arquitectura del módulo

```prisma
model TaxSettings {                 // por condominio
  condominiumId    String  @id
  isEInvoicer      Boolean @default(false)   // ← se activa solo si corresponde
  taxId            String?                    // cédula jurídica
  taxIdType        String?
  legalName        String?
  commercialName   String?
  economicActivity String?                    // código de actividad económica
  province String?; canton String?; district String?; address String?
  email String?; phone String?
  providerName     String?                    // proveedor de facturación
  providerApiKey   String?                    // CIFRADO en reposo, nunca en texto plano
  environment      String  @default("sandbox") // sandbox | produccion
  lastSequence     Int     @default(0)
}

model CabysCode {                   // catálogo nacional
  code        String @id           // 13 dígitos
  description String
  taxRate     Decimal @db.Decimal(5,2)
  isActive    Boolean @default(true)
}

model EInvoice {
  id            String   @id @default(uuid())
  companyId     String
  condominiumId String
  docType       EInvoiceType        // FE | TE | NC | ND | REP
  consecutive   String              // consecutivo de 20 dígitos
  clave         String  @unique     // clave numérica de 50 dígitos
  issueDate     DateTime
  receiverName  String
  receiverTaxId String?
  receiverEmail String?
  subtotal Decimal @db.Decimal(14,2)
  taxTotal Decimal @db.Decimal(14,2)
  total    Decimal @db.Decimal(14,2)
  currency Currency @default(CRC)
  status        EInvoiceStatus @default(pendiente)
  // pendiente | enviado | aceptado | rechazado | error
  haciendaResponse Json?
  rejectReason  String?
  xmlUrl String?; pdfUrl String?
  chargeId String?; paymentId String?   // qué originó el comprobante
  referencedInvoiceId String?           // para NC y ND
  sentAt DateTime?; acceptedAt DateTime?
  retryCount Int @default(0)
  nextRetryAt DateTime?
}

model EInvoiceLog {                 // bitácora completa e inmutable
  id          String   @id @default(uuid())
  eInvoiceId  String
  event       String   // creado | firmado | enviado | respuesta | reintento | error
  detail      Json
  createdAt   DateTime @default(now())
}
```

### Flujo de emisión

```
Cargo emitido / pago recibido
        ↓
¿El condominio factura electrónicamente?  ── no ──► fin
        ↓ sí
Construir comprobante (CABYS de cuota condominal, no sujeta a IVA)
        ↓
Enviar al proveedor  ──► firma XAdES ──► Hacienda
        ↓
Registrar EInvoice en estado "enviado" + bitácora
        ↓
Webhook o consulta programada
        ├── aceptado  → guardar XML y PDF, enviar al propietario
        ├── rechazado → registrar motivo, avisar al administrador
        └── sin respuesta → reintento exponencial (1, 5, 15, 60 min…) hasta 24 h,
                            luego alerta al administrador
```

**Reglas de robustez:**
- La emisión **nunca bloquea** la operación del condominio. Si Hacienda está caída, el cargo se emite igual y el comprobante queda en cola.
- **Idempotencia por clave numérica:** un reintento nunca genera un comprobante duplicado.
- **La bitácora es inmutable y completa:** todo intento queda registrado, exitoso o no. Es el respaldo ante una fiscalización.
- **Los rechazos son visibles y accionables**, no un log que nadie lee.

---

# TAREA 6 — Automatización inteligente

## 6.1 Conciliación bancaria automática

**Motor de coincidencia por puntaje:**

| Señal | Puntos |
|---|---|
| Monto exacto | 40 |
| Monto con diferencia < 1 % | 25 |
| Fecha exacta | 20 |
| Fecha ± 3 días | 12 |
| Referencia coincide (SINPE, N.º de transferencia) | 25 |
| Texto del banco coincide con un patrón ya confirmado antes | 15 |

**Umbrales:** ≥95 concilia automáticamente · 70-94 propone con un clic · <70 revisión manual.

**El aprendizaje es lo que la hace valiosa:** cuando el administrador concilia a mano "TRANSF SINPE JIMENEZ M" con la filial CASA-01, el sistema guarda esa asociación. Al mes siguiente ese mismo texto se concilia solo. En tres meses, la conciliación de un condominio pasa de manual a casi totalmente automática.

## 6.2 Cobros

- **Emisión automática** de la cuota el día configurado, con notificación al residente. *(Nota: hoy la infraestructura existe pero no hay proceso que la ejecute — hay que construir el programador de tareas.)*
- **Escalamiento de cobranza configurable:** recordatorio antes del vencimiento → aviso al vencer → recordatorio a los 8 días → aviso formal a los 30 → notificación de suspensión de servicios a los 60 → expediente para cobro judicial a los 90. Cada paso queda en `CollectionAction`.
- **Pago en línea** con aplicación automática del pago y su asiento. Es el mayor salto posible en efectividad de cobranza: quitar la fricción de ir al banco.
- **Aplicación automática de pagos:** al cargo más antiguo primero, política estándar y configurable.

## 6.3 Pagos

- Gastos recurrentes que se crean solos en borrador antes del vencimiento.
- Recordatorio de facturas por vencer.
- Aprobación por monto: bajo cierto umbral no requiere aprobación; encima, sí.
- Programación de pagos con proyección de su efecto en el flujo de caja.

## 6.4 Distribución de cuotas

Cálculo por coeficiente de copropiedad, prorrateo de gastos comunes, derrama de cuotas extraordinarias con opción de dividir en pagos, y agua por consumo con tarifa escalonada — esto último ya construido.

## 6.5 Intereses moratorios *(el hueco más grave que hay que tapar)*

```
Diario, para cada cargo vencido:
  días_mora = hoy − (vencimiento + días_gracia)
  si días_mora ≤ 0 → nada
  base = saldo pendiente del cargo
         (si la política es interés simple, NUNCA incluye intereses previos)
  interés = base × tasa_mensual × (días_mora / 30)
  interés = min(interés, base × tope_configurado)
  si ya existe cargo de interés para ese cargo y período → solo ajustar diferencia
  si no → crear cargo `interes_moratorio` con su asiento
```

**Salvaguardas obligatorias:** idempotencia total (correrlo dos veces no cobra dos veces) · tope configurable · exclusión de filiales con convenio de pago vigente · trazabilidad del cargo base · anulación con motivo obligatorio y registro en auditoría.

## 6.6 Presupuesto, flujo y proyección

- **Presupuesto sugerido** a partir del gasto real de los 12 meses previos más un ajuste por inflación — el administrador ajusta, no construye desde cero.
- **Alertas** al 80 %, 100 % y 120 % de ejecución por partida.
- **Flujo de caja proyectado** a 3, 6 y 12 meses: saldo actual + cuotas por cobrar × tasa histórica de recuperación − gastos recurrentes comprometidos − contratos vigentes.
- **Alerta temprana de liquidez:** avisar cuando el saldo proyectado caiga bajo un mes de gasto operativo — con meses de anticipación, no cuando ya pasó.

---

# TAREA 7 — Asistente Financiero con IA

## 7.1 Qué es y qué no es

**Es** una capa de consulta en lenguaje natural sobre datos financieros reales, que explica y recomienda.
**No es** un motor que ejecute movimientos de dinero. El asistente **nunca** emite cargos, registra pagos ni modifica asientos. Analiza, explica y sugiere; la acción siempre la ejecuta una persona con permiso. Esta línea es deliberada: un error de un modelo de lenguaje sobre la contabilidad de un condominio es un problema legal, no un bug.

## 7.2 Arquitectura

```
Pregunta del administrador
        ↓
Clasificación de intención (morosidad, gastos, presupuesto, liquidez, proveedores…)
        ↓
Recolección de datos REALES vía consultas parametrizadas y acotadas
   al condominio activo y al período consultado
        ↓
Construcción del contexto: cifras, comparativos y variaciones ya calculadas
        ↓
Modelo de lenguaje → redacta el análisis en español costarricense
        ↓
Respuesta + tabla de respaldo + acciones sugeridas + enlace al detalle
```

**Decisión de arquitectura clave: la IA no calcula, solo redacta.** Todos los números se calculan en SQL con las mismas funciones que alimentan los estados financieros; el modelo recibe cifras ya calculadas y las explica. Así es imposible que invente un monto. Toda respuesta muestra la tabla de la que salió.

## 7.3 Preguntas y comportamiento esperado

| Pregunta | El asistente hace |
|---|---|
| ¿Por qué aumentaron los gastos este mes? | Compara por categoría contra el promedio de 6 meses, ordena por variación absoluta, identifica gastos extraordinarios y señala qué es puntual y qué es tendencia |
| ¿Quiénes presentan mayor morosidad? | Antigüedad de saldos, top de deudores, tiempo de mora, si tienen convenio, y qué acción de cobro corresponde |
| ¿Qué proveedores representan el mayor gasto? | Concentración por proveedor, participación acumulada, y alerta si uno concentra más del 30 % del gasto |
| ¿Qué presupuesto está excedido? | Partidas sobre el 100 %, monto y porcentaje, y proyección de cierre de año |
| ¿Qué pagos requieren aprobación? | Lista con antigüedad, monto y a quién le corresponde aprobar |
| ¿Cómo mejorar la liquidez? | Analiza cobranza, gasto y calendario de pagos; propone acciones ordenadas por impacto |

**Ejemplo de respuesta bien diseñada:**

> **Los gastos subieron 11,8 % respecto a junio (₡3.920.000 vs. ₡3.505.000).**
>
> Casi todo el aumento viene de un solo rubro:
>
> | Categoría | Junio | Julio | Variación |
> |---|---|---|---|
> | Mantenimiento | ₡680.000 | ₡1.150.000 | **+₡470.000** |
> | Seguridad | ₡1.420.000 | ₡1.420.000 | sin cambio |
> | Servicios | ₡890.000 | ₡845.000 | −₡45.000 |
>
> El alza de mantenimiento corresponde a la reparación de la bomba de agua (₡470.000, Bombas del Valle). **Es un gasto puntual, no una tendencia** — sin él, el gasto del mes habría bajado 1,6 %.
>
> ⚠️ Aun así, la partida de mantenimiento quedó en **118 % de su presupuesto anual** faltando 5 meses.
>
> **Recomendación:** revisar la partida en la próxima junta. Al ritmo actual cerraría el año 40 % por encima de lo aprobado.
>
> `[Ver detalle]` `[Ajustar presupuesto]` `[Preparar nota para la junta]`

Nótese: números verificables, causa concreta, distinción entre lo puntual y lo estructural, consecuencia proyectada y acciones a un clic. Eso es un asesor, no un chatbot.

## 7.4 Informe mensual automático

El primer día de cada mes, el asistente genera un resumen ejecutivo — qué pasó, qué cambió, qué requiere atención y qué se proyecta — listo para reenviar a la junta directiva. Para una administradora con 40 condominios, esto son 40 informes que hoy se escriben a mano.

---

# TAREA 8 — Diseño de pantallas

Se especifican las nueve pantallas nuevas o rediseñadas. Las existentes (estado de cuenta, libro diario, balance) se conservan.

### F1. Panel Financiero — `/app/finanzas`
**Objetivo:** en 10 segundos, saber si el condominio está bien y qué requiere acción hoy.
**Componentes:** barra de alertas · 4 tarjetas comparativas · flujo de caja con proyección · morosidad por antigüedad · presupuesto vs. ejecución · indicadores con semáforo · bandejas de pendientes.
**Filtros:** condominio activo · período.
**Acciones:** todo bloque lleva a su detalle · descargar paquete financiero.
**Automatizaciones:** alertas calculadas al cargar · refresco cada 60 s.

### F2. Gastos — `/app/finanzas/gastos`
**Objetivo:** ver, registrar y aprobar los egresos.
**Componentes:** totales del período · filtros (estado, categoría, proveedor, rango) · tabla · acciones masivas.
**Campos de la tabla:** N.º · fecha · proveedor · descripción · categoría · monto · estado · vencimiento.
**Acciones:** nuevo gasto · aprobar (individual o en lote) · registrar pago · anular · exportar.
**Automatizaciones:** resalta lo vencido · muestra impacto presupuestario por categoría.

### F3. Registro de gasto (ventana sobrepuesta)
Especificada en detalle en §3.2. **Objetivo: menos de un minuto.**
**Automatizaciones:** lectura del documento · proveedor y cuenta deducidos del historial · validación presupuestaria antes de guardar · enrutamiento a aprobación por monto · asiento contable automático.

### F4. Proveedores — `/app/finanzas/proveedores`
**Objetivo:** un directorio único de proveedores con su historial de gasto.
**Componentes:** buscador · tabla · ficha con historial, contratos y facturas.
**Campos:** razón social · cédula jurídica · contacto · categoría habitual · cuenta bancaria.
**Automatizaciones:** aprende la cuenta contable que más usa · alerta de concentración de gasto.

### F5. Bancos y conciliación — `/app/finanzas/bancos`
**Objetivo:** que el saldo del sistema sea igual al del banco, sin Excel.
**Componentes:** tarjetas por cuenta con saldo y fecha de última conciliación · zona de carga del estado de cuenta · tres columnas (conciliado automático / propuesto / sin identificar).
**Acciones:** importar · confirmar propuesta · conciliar manualmente · crear el registro faltante desde el movimiento · deshacer.
**Automatizaciones:** motor de puntaje · detección de duplicados por huella · aprendizaje de patrones.

### F6. Presupuesto — `/app/finanzas/presupuesto`
**Objetivo:** planificar el año y vigilar su ejecución.
**Componentes:** selector de año · tabla por partida (presupuestado / ejecutado / disponible / % con barra) · comparativo con el año anterior.
**Acciones:** generar propuesta desde el histórico · editar · aprobar · congelar · exportar.
**Automatizaciones:** sugerencia basada en 12 meses reales · alertas al 80/100/120 % · proyección de cierre.

### F7. Morosidad y cobranza — `/app/finanzas/morosidad`
**Objetivo:** saber a quién cobrar y ejecutar la gestión.
**Componentes:** antigüedad de saldos · lista de deudores ordenable · ficha con historial de gestión · configuración del escalamiento.
**Acciones:** enviar recordatorio · registrar gestión · crear convenio de pago · generar expediente de cobro judicial.
**Automatizaciones:** escalamiento automático · exclusión de filiales con convenio vigente.

### F8. Cierre mensual — `/app/finanzas/cierre`
**Objetivo:** cerrar el mes con la certeza de que todo cuadra.
**Componentes:** lista de verificación con estado (✅/⚠️) · resumen del período · vista previa del paquete de cierre.
**Verificaciones:** Balance cuadrado · bancos conciliados · sin gastos en borrador · sin cargos sin asiento · sin pagos sin aplicar.
**Acciones:** resolver cada punto · cerrar mes · reabrir (solo administrador propietario, con motivo).
**Automatizaciones:** congela saldos · bloquea el período · genera el PDF.

### F9. Asistente Financiero — `/app/finanzas/asistente`
**Objetivo:** responder preguntas financieras en lenguaje natural.
**Componentes:** conversación · preguntas sugeridas · respuestas con tabla de respaldo y acciones.
**Automatizaciones:** datos calculados en SQL, nunca por el modelo · informe mensual automático.

## 8.1 Flujo de navegación

```
Panel Financiero (F1)
   ├─ alerta "pagos por aprobar"   → Gastos (F2) filtrado
   ├─ tarjeta Gastos               → Gastos (F2)
   ├─ tarjeta En bancos            → Bancos (F5)
   ├─ bloque Morosidad             → Morosidad (F7)
   ├─ bloque Presupuesto           → Presupuesto (F6)
   └─ botón Cerrar mes             → Cierre (F8)

Gastos (F2) ──► Registro (F3, ventana sobrepuesta, no navega)
            └─► Ficha de proveedor (F4)
```

**Regla de navegación:** todo lo que sea crear o editar ocurre en ventana sobrepuesta, nunca en una página aparte. El administrador no debe perder el contexto de la lista donde estaba.

## 8.2 Cambios de arquitectura que este diseño exige

Detectados durante el diseño de pantallas, se proponen **antes** de programar:

1. **Rol Contador.** El diseño de F8 y de los asientos manuales no tiene sentido sin él.
2. **Programador de tareas.** No existe hoy. Sin él no hay facturación automática, ni intereses, ni gastos recurrentes, ni alertas de contratos. **Es prerrequisito de casi toda la Tarea 6.**
3. **Motor de lectura de documentos.** Necesario para que F3 cumpla su objetivo de un minuto.
4. **`Provider` → `Supplier`.** Migración de datos: hoy los proveedores viven por condominio y sin datos tributarios.
5. **Cifrado de credenciales en reposo.** `TaxSettings.providerApiKey` guarda una credencial tributaria de un tercero; no puede almacenarse en texto plano.
6. **Bloqueo de período en el motor contable.** `createJournalEntry` debe consultar `AccountingPeriod` y rechazar escrituras en meses cerrados.
7. **Numeración consecutiva concurrente.** `Expense.expenseNumber` necesita una secuencia por condominio segura ante escrituras simultáneas.

---

# TAREA 9 — Plan de implementación

La secuencia importa: cada fase deja el sistema utilizable y habilita la siguiente.

| Fase | Qué se construye | Por qué en este orden |
|---|---|---|
| **0. Fundaciones** | Programador de tareas · rol Contador · bloqueo de período · cuentas bancarias | Sin esto nada de lo demás se puede automatizar |
| **1. Tapar los huecos críticos** | **Intereses moratorios** · **facturación automática ejecutándose** · gastos con proveedores y aprobación | Son los tres hallazgos graves de la auditoría. Hasta que estén, el módulo tiene fallos funcionales, no carencias |
| **2. El ciclo del egreso** | Gastos recurrentes · contratos · cuentas por pagar · lectura de facturas | Cierra la brecha frente a Aditum |
| **3. Bancos** | Importación · conciliación con puntaje · aprendizaje · flujo de caja | La mayor innovación frente a la competencia |
| **4. Control** | Presupuesto y ejecución · cierre mensual · fondo de reserva · morosidad por antigüedad | Convierte los datos en gestión |
| **5. Panel y cobranza** | Panel financiero · escalamiento de cobranza · convenios | Donde el administrador percibe el valor |
| **6. Facturación electrónica** | Capa de abstracción + integración con proveedor | **APLAZADA por decisión de Freddy (2026-07-26).** Retomar después de validar el criterio tributario con un contador |
| **7. Inteligencia** | Asistente financiero · informe mensual · proyecciones | Se apoya en todo lo anterior; sin datos completos no sirve |

## 9.1 Riesgos que hay que mirar de frente

| Riesgo | Mitigación |
|---|---|
| **La obligación tributaria de facturar no está clara para condominios** | Validar con contador público **antes** de la fase 6 y dejar el criterio por escrito. Hacerla configurable por condominio |
| Cobrar intereses mal calculados genera reclamos legales | Idempotencia, tope, trazabilidad del cargo base y anulación con motivo. Correr en paralelo un mes antes de activar |
| La lectura automática de facturas se equivoca | Mostrar siempre el porcentaje de confianza y la imagen al lado. Nunca guardar sin revisión humana |
| La conciliación automática concilia mal | Umbral alto (95) para automático, todo lo demás propuesto. Todo reversible |
| Migrar `Provider` a `Supplier` rompe mantenimiento | Migración con período de convivencia y datos duplicados temporalmente |
| El asistente IA inventa cifras | Arquitectura donde la IA **no calcula**: recibe números ya calculados en SQL y solo redacta |
| Escalar a cientos de condominios | Los saldos ya se derivan, no se guardan. Añadir vistas materializadas por condominio y refresco incremental al cierre |

## 9.2 Lo que hay que decidir antes de programar

1. **¿Se valida el criterio tributario con un contador?** — bloquea la fase 6.
2. **¿Interés simple o compuesto por defecto, y con qué tope?** — define la fase 1.
3. **¿Aprobación de gastos obligatoria o por monto?** — define el flujo de F2/F3.
4. **¿Se integra pago en línea?** — es la palanca más grande de cobranza y define alcance de la fase 5.
5. **¿Qué proveedor de facturación electrónica?** — conviene cotizar al menos tres.
6. **¿El contador es un rol del sistema o un usuario externo con acceso limitado?**

---

## Fuentes consultadas

- [Hac — Sistema de Administración de Condominios](https://www.hac.cr/)
- [Aditum — Sistema para condominios](https://aditumcr.com/)
- [Novedades en facturación electrónica Costa Rica (resolución, REP, TRIBU-CR)](https://siemprealdia.co/costa-rica/impuestos/novedades-en-facturacion-electronica/)
- [Facturación Electrónica Hacienda v4.4 en Costa Rica — guía 2026](https://kmsoftcr.com/blog/facturacion-electronica-hacienda-v44-costa-rica/)
- [Versión 4.4: ajustes XML en facturación electrónica](https://www.facturele.com/2025/10/20/ajustes-xml-facturacion-electronica/)
- [Cuotas condominales y el IVA — El Observador CR](https://observador.cr/cuotas-condominales-y-el-iva/)
- [¿Debe o no entregar factura electrónica un condominio?](http://drcondominio.blogspot.com/2018/08/debe-o-no-entregar-factura-electronica.html)
- [CABYS para condominios](http://drcondominio.blogspot.com/2020/11/asi-como-en-condominios-tuvimosque.html)
- [API de facturación electrónica en Costa Rica v4.4 — Alanube](https://www.alanube.co/costarica/)
- [Comparativa de facturadores electrónicos Costa Rica 2026](https://programascontabilidad.com/comparativas-de-software/facturador-electronico-ministerio-de-hacienda/)

**Auditoría de ANEXYpro:** realizada directamente sobre el código fuente en `prisma/schema.prisma`, `src/lib/services/finance.ts`, `src/lib/services/accounting.ts`, `src/app/app/finanzas/` y `src/app/app/contabilidad/`.
