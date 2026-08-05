# ANEXYpro — código real (Next.js + Prisma + PostgreSQL)

Este es el proyecto real que sucede al prototipo estático
(`anexypro-modulo-condominios.html`). Mismo diseño, misma lógica de
negocio, mismas reglas — ahora con backend real, base de datos real y
autenticación real.

## Puesta en marcha

1. `npm install`
2. Copia `.env.example` a `.env` y completa `DATABASE_URL` (Postgres) y `AUTH_SECRET`.
3. Sigue exactamente `prisma/migrations/README.md` — Prisma crea las tablas,
   pero las vistas/triggers/RLS son SQL aparte que hay que aplicar a mano.
4. `npm run db:seed` — crea la empresa y el primer usuario administrador
   (sin condominios ni datos de demostración; queda impreso el correo y
   la contraseña generados, cámbiala de inmediato).
5. `npm run dev` → http://localhost:3000

## Pruebas automatizadas

`npm test` — 40 casos de prueba (Vitest) sobre la lógica de negocio
más crítica y más propensa a errores silenciosos:

- **Motor de partida doble** (`journal-balance.test.ts`): un asiento
  descuadrado se rechaza, una línea con débito y crédito a la vez se
  rechaza, y errores de punto flotante (0.1 + 0.2) no generan falsos
  negativos.
- **Aplicación de pagos** (`payment-allocation.test.ts`): al cargo más
  antiguo primero, respeta lo ya pagado parcialmente, nunca sobre-aplica,
  el excedente se registra como adelanto — nunca desaparece.
- **RBAC** (`rbac.test.ts`): admin_owner siempre tiene acceso completo,
  admin_staff respeta `staffPermissions`, y Auditoría nunca es
  otorgable a la Junta Directiva bajo ninguna circunstancia.
- **Validaciones Zod** (`validations.test.ts`): límites de montos,
  formatos de UUID, enums inválidos.

La lógica de partida doble y de aplicación de pagos se extrajo a
funciones puras en `src/lib/domain/` (sin dependencia de Prisma)
específicamente para poder probarla así — los servicios reales
(`accounting.ts`, `finance.ts`) las usan internamente, no duplican la
lógica.

**Nota de honestidad**: este entorno no tiene acceso a internet, así
que no pude ejecutar `npm install` ni correr estas pruebas yo mismo —
las escribí y verifiqué a mano (balance de llaves, imports, y
comparación línea por línea contra los esquemas reales), pero el
primer `npm test` en tu máquina es el verdadero primer chequeo. Si
alguna falla, decímelo y la corrijo.

## Qué está construido en esta fase

- Schema completo de datos (63 modelos) — TODOS los módulos del
  prototipo ya tienen su tabla real, aunque todavía no todos tengan
  pantalla.
- Autenticación real (NextAuth v5 + bcrypt), RBAC, protección de rutas
  por portal.
- Layout del panel Administradora (sidebar + topbar), con el mismo
  patrón "pronto" que usó el prototipo para lo que falta construir.
- Página de login (mismo diseño validado con Freddy).
- **Módulos funcionales de punta a punta**: Dashboard Ejecutivo,
  Gestión de Condominios, Propiedades, Residentes, Finanzas
  (facturación ordinaria, cargos manuales, pagos con aplicación al
  cargo más antiguo, morosidad, suspensión de servicios), Comunicados
  (redacción, audiencia, publicación, estadísticas de lectura),
  **Contabilidad Inteligente** (motor de partida doble con devengo
  real — Finanzas ahora genera sus asientos automáticamente; Libro
  Diario, Balance General con corriente/no corriente, Estado de
  Resultados con utilidad operativa vs. neta), Calendario General,
  Reservas (áreas comunes, sin solapamiento de horarios, comprobante
  obligatorio en reservas con costo, bloqueo automático por
  suspensión de servicios), Mantenimiento Inteligente (activos,
  proveedores, tickets preventivos/correctivos con costo conectado a
  Contabilidad), Gestión de Proyectos (hitos, checklist, gastos
  también conectados a Contabilidad — nunca generan cargo automático,
  avances), Control de Visitas (rápida/recurrente/entrega, ingreso y
  salida), Seguridad (incidentes, paquetería), **Asambleas**
  (convocatoria, agenda con votación, resultados en tiempo real,
  publicación de acta — la administración NUNCA puede emitir ni
  modificar un voto, verificado por grep en todo el código: no existe
  ninguna función equivalente a "votar en nombre de"), **Gestión
  Documental** (versionado real — cada subida agrega una fila, nunca
  sobrescribe; archivar en vez de eliminar) y **Reportes** (financiero,
  morosidad, mantenimiento, proyectos — consolidado de todos los
  condominios activos, reutilizando los servicios ya construidos, sin
  duplicar lógica, sin mezclar monedas distintas en un total),
  **Configuración** (usuarios de staff, permisos por área, Junta
  Directiva — conjunto de permisos sobre un propietario existente,
  nunca un usuario ni un rol nuevo, solo gestionable por el
  administrador principal) y **Auditoría** (bitácora de actividad
  conectada a los puntos clave: login, pagos, tickets completados,
  proyectos y gastos, asambleas y sus votaciones, documentos y sus
  versiones, comunicados, condominios — nunca accesible a la Junta
  Directiva).
- **Portal de Seguridad** (/seguridad) completo: Dashboard, Control de
  Acceso, Visitas (con la distinción real oficial/residente y su
  propio registro en Auditoría), Reservas de consulta, Paquetería,
  Incidentes y Bitácora unificada.
- **Ecosistema Condómino** (/portal) completo: Dashboard, Estado de
  Cuenta, Comunicados, Calendario, Reservas, Autorizar Visitas,
  Mantenimientos (consulta pública), Asambleas — **acá vive la única
  función de votar de toda la aplicación (castBallot), siempre atada a
  la sesión del residente autenticado, nunca al panel Administradora**
  (verificado con grep sobre los 148 archivos del proyecto) — Mi
  Perfil y Contenido de Valor.
- **Contenido de Valor**: panel de administración completo (crear,
  publicar/despublicar) — el residente ya lo consume desde antes.
- **Árbitro Legal IA — integración real con Claude**: se agregó
  `documents.bodyText` (contenido de texto real del reglamento, no
  solo la URL del archivo) porque un asistente de IA sin texto real
  para fundamentarse solo puede fabricar respuestas. El asistente
  responde EXCLUSIVAMENTE con base en ese texto — si no hay reglamento
  cargado, o si no hay `ANTHROPIC_API_KEY` configurada, lo dice con
  honestidad en vez de inventar. Requiere `npm install` (se agregó
  `@anthropic-ai/sdk`) y la variable de entorno documentada en
  `.env.example`.
- **Los 7 Asistentes IA, completos**: **Analista Financiero** (enlaza
  a Contabilidad, no duplica), **Asistente Administrativo** (preguntas
  fundamentadas en datos reales del sistema — unidades, morosidad,
  incidentes, próxima asamblea — calculados primero, Claude solo los
  narra), **Asistente de Mantenimiento** (activos con 2+ tickets
  correctivos, dato real sin necesidad de IA), **Generador de
  Comunicados** (genera un borrador real con Claude a partir de una
  instrucción, integrado en el formulario de Comunicados — siempre se
  revisa antes de guardar), **Generador de Reportes** (botón "Explícame
  este reporte" en las 4 pestañas de Reportes, narra datos ya
  calculados, nunca inventa cifras), **Buscador Inteligente** (búsqueda
  real multi-entidad, ahora también integrada en el buscador del
  Topbar de todo el panel — reemplazó el campo que antes estaba
  deshabilitado).

Con esto los tres portales completos (Administradora, Portal de
Seguridad, Ecosistema Condómino) están construidos de punta a punta.

## Limitación de este entorno

Este código se escribió sin acceso a internet (no se pudo correr
`npm install`, `prisma generate` ni levantar un servidor real para
probarlo). Se revisó a mano con la misma disciplina que el prototipo,
pero el primer `npm install` + `npm run dev` en tu máquina es el
verdadero primer chequeo — si algo no compila, decímelo y lo corrijo.
