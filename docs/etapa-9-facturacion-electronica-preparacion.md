# Etapa 9 — Preparación arquitectónica para facturación electrónica

Fecha: 2026-08-20

**La facturación electrónica NO quedó activada.** No se emite ningún comprobante,
no se genera XML, no se habla con Hacienda ni con ningún proveedor, no hay claves
ni credenciales, y ningún flujo de Finanzas cambió de comportamiento. Lo que
sigue es la arquitectura que permitirá implementarla sin rehacer Finanzas.

Comprobado, no afirmado:

```bash
npx tsx --env-file=.env scripts/probar-etapa9.ts   # 22 comprobaciones
```

- Ningún proveedor implementado; pedir uno falla con un mensaje que explica por qué.
- Los 20 condominios quedan en estado `inactivo`.
- Los catálogos de Hacienda están **vacíos** (0 filas).
- No existe ningún comprobante.
- Ningún archivo de `src/app/` ni de `src/lib/services/` (fuera del propio módulo)
  menciona nada de facturación electrónica.
- Las suites previas siguen verdes: Etapa 7 (83), Etapa 8 (16 + 32), 425 pruebas
  unitarias.

---

## 1. Modelo de datos

Seis tablas nuevas. Ninguna existente fue modificada — la migración es
estrictamente aditiva (`20260820_facturacion_electronica_preparacion`).

| Tabla | Qué guarda | Alcance |
| --- | --- | --- |
| `fiscal_catalog_entries` | Catálogos oficiales de Hacienda | Global (público) |
| `condominium_fiscal_settings` | Configuración fiscal | 1 por condominio |
| `einvoicing_credentials` | **Referencia** al mecanismo de autenticación | Por condominio |
| `fiscal_sequences` | Consecutivos | Por condominio + tipo + sucursal + terminal |
| `fiscal_documents` | Comprobantes | Por condominio |
| `fiscal_document_events` | Historial de estados | Por comprobante, solo agregar |

### La decisión que explica todo el diseño

**No se codificó ninguna estructura tributaria de memoria.** Los tipos de
identificación, los tipos de comprobante, las condiciones y regímenes
tributarios, las actividades económicas y los códigos de provincia/cantón/distrito
son catálogos de Hacienda que cambian por resolución. Ponerlos como `enum` de
Prisma habría significado dos cosas malas: congelar de memoria unos valores que
deben salir de la especificación vigente, y obligar a una migración de base cada
vez que Hacienda publique una versión.

Van en `fiscal_catalog_entries`, que hoy está **vacía a propósito** y se llenará
al implementar, leyendo el documento oficial de ese momento. Cada fila lleva
`spec_version`: sin eso no se puede auditar de dónde salió un valor.

Los `enum` que sí existen son estados de ANEXYpro, no de Hacienda.

## 2. Campos

`condominium_fiscal_settings` cubre lo pedido, **por condominio**:

- Identificación: `identification_type_code` + `identification_number`
- `legal_name`, `trade_name`
- Actividad económica: `economic_activity_code`
- Contacto: `email`, `phone`
- Ubicación: `province_code`, `canton_code`, `district_code`, `address_line`
  (más los nombres legibles, porque los códigos de Hacienda son numéricos y una
  pantalla que muestre "1/01/01" no le sirve a nadie)
- Situación tributaria: `tax_condition_code`, `tax_regime_code`

De cada campo de catálogo se guardan **código y etiqueta**: si el catálogo cambia,
la pantalla sigue mostrando lo que se eligió y no un código pelado.

**No se asume que todos los condominios tengan la misma condición tributaria.**
Condición y régimen son obligatorios por condominio y no se heredan de la empresa
administradora ni de otro condominio. No existe ninguna función que copie
configuración fiscal entre condominios, y no debe escribirse.

## 3. Relaciones

```
Condominium 1──1 CondominiumFiscalSettings
                     │
                     ├──* EInvoicingCredential      (única por tipo)
                     ├──* FiscalSequence            (única por tipo+sucursal+terminal)
                     └──* FiscalDocument
                              ├──* FiscalDocumentEvent   (solo agregar)
                              └──1 FiscalDocument        (autorreferencia: NC/ND → original)

FiscalCatalogEntry  — global, sin dueño
```

`FiscalDocument.referenced_document_id` es la autorreferencia que sostiene las
notas de crédito y débito: un comprobante puede corregir a otro y la cadena se
navega en los dos sentidos. `source_table`/`source_id` lo atan a lo que lo
originó (hoy sería un `Charge`) sin acoplar los módulos — mismo patrón que ya
usan los asientos contables.

## 4. Estados

Dos ciclos de vida, ambos en `src/lib/domain/einvoicing-states.ts`, con 19
pruebas.

**Del módulo, por condominio** — es el flujo de activación que pide la etapa:

```
inactivo → configurado → validado → probado → activo ⇄ suspendido
```

Lineal a propósito: no se activa sin haber probado la conexión, ni se prueba sin
haber validado los datos. Editar la configuración devuelve a `configurado` y
obliga a validar de nuevo — cambiar la cédula y seguir "validado" sería mentira.
`suspendido` es la única salida lateral: un certificado vencido se renueva sin
reconfigurar el condominio.

**De un comprobante** — los siete estados pedidos:

```
borrador → generado → enviado → aceptado
                 ↘        ↘  ↘
                error ──────┘  rechazado (final)
   cualquiera (salvo rechazado) → anulado
```

Tres reglas que quedaron escritas y probadas:

- **Ningún estado vuelve a `borrador`.** Es lo que impide maquillar el historial.
- **`rechazado` es final**: no se corrige el comprobante, se emite otro.
- **`error` sí se reintenta**: es una falla de comunicación, no de fondo; el
  comprobante sigue siendo válido.

`puedeEmitir()` exige estado `activo` **y** ambiente `produccion`. Estar activo en
pruebas no habilita a emitir de verdad — es el error clásico de dejar el sandbox
encendido.

## 5. Seguridad

**Ninguna contraseña, llave ni token se guarda en la base.** `einvoicing_credentials`
no tiene —ni debe tener— una columna con el secreto. Guarda `secret_ref`: un
puntero opaco a dónde vive el secreto de verdad (variable de entorno, gestor de
secretos del hosting, o el repositorio cifrado). El servidor lo resuelve en el
momento de usarlo y **nunca viaja al navegador**. Las demás columnas existen para
poder administrar el mecanismo sin verlo: de qué tipo es, cuándo vence (`expires_at`,
indexado, para avisar antes de que un certificado caduque) y un `hint` para
reconocerlo.

Qué queda decidido y qué no: la indirección sí; **el almacén concreto no**. Elegir
entre el gestor de secretos del hosting y el cifrado en base con una llave
gestionada es una decisión que merece tomarse con el mecanismo de autenticación
real a la vista, no antes.

Además, en `prisma/sql/07_facturacion_electronica.sql`:

- **RLS** en las cinco tablas con dueño, con `FORCE` (el dueño tampoco se la
  salta). `fiscal_catalog_entries` queda fuera a propósito: es un catálogo público,
  mismo criterio que `fx_rates`. `scripts/verificar-bd.ts` lo sabe.
- **Un comprobante emitido no se reescribe.** Un disparador rechaza el `UPDATE`
  de clave, consecutivo, tipo, monto, moneda, condominio o documento referenciado
  una vez que salió de `borrador`, y rechaza volver a `borrador`. Avanzar de
  estado y anotar la respuesta sí se permite: eso es el ciclo de vida.
- **Un comprobante emitido no se borra**: se anula.
- **El historial no se modifica ni se borra.**
- **El consecutivo no retrocede.**

Está en la base y no solo en el servicio a propósito: una consulta suelta, un
guion de mantenimiento o un error de programación futuro tropiezan igual. Se
verificó que el rol de la aplicación **no puede** desactivar esos disparadores.

## 6. Arquitectura

```
Finanzas  →  services/einvoicing.ts  →  lib/einvoicing/index.ts  →  EInvoicingProvider
                                            (fábrica)                  (contrato)
                                                                            ↑
                                              ┌─────────────────────────────┴──────────┐
                                     integración propia              proveedor externo
                                        (sin escribir)                 (sin escribir)
```

Mismo patrón de puerto y adaptador que ya usa el repositorio de documentos en
producción (`src/lib/storage/`), donde funciona para alternar entre disco local y
Google Drive.

**El contrato no habla de XML.** Recibe un encargo en el vocabulario de ANEXYpro
—qué condominio, qué tipo de comprobante, a quién, por cuánto— y devuelve
identificadores opacos. Traducir eso a la estructura vigente es trabajo del
adaptador. Si la puerta recibiera un "objeto FacturaElectrónica" con sus campos,
estaríamos codificando de memoria una estructura tributaria y cada cambio de
versión rompería el contrato.

`IMPLEMENTADOS` está **vacío**. `getProvider()` siempre falla, con un mensaje que
explica que la Etapa 9 solo preparó la arquitectura. Eso no es un descuido: es la
garantía de que nada quedó encendido.

### Cambio de proveedor

Cambiar de proveedor es escribir `EInvoicingProvider` una vez más y cambiar
`providerKind` del condominio. No se toca Finanzas. Los identificadores del
proveedor (`provider_account_ref`, `provider_document_ref`) son opacos: ANEXYpro
los guarda y los devuelve, nunca los interpreta.

Dos condominios de la misma administradora pueden usar proveedores distintos: la
elección vive en la configuración de cada uno.

## 7. Dependencias

Lo que hace falta y **todavía no existe**:

| Dependencia | Estado |
| --- | --- |
| Especificación vigente de las estructuras de Hacienda | **Pendiente** — no se codificó de memoria |
| Catálogos oficiales (identificación, comprobantes, condición, régimen, actividades, ubicaciones) | Tabla lista, **vacía** |
| Certificado de firma digital del condominio | No solicitado |
| Credenciales del ambiente de Hacienda o del proveedor | No solicitadas |
| Decisión: integración propia vs. proveedor | **Sin tomar** |
| Almacén de secretos concreto | **Sin elegir** |
| Firma XAdES | Sin librería elegida |
| Repositorio de documentos | ✅ ya existe y se reutiliza para los XML |
| Contabilidad y cargos | ✅ ya existen; el comprobante se ata por `source_table`/`source_id` |

## 8. Riesgos

1. **Codificar la estructura de memoria.** El riesgo mayor y el más fácil de
   cometer. Mitigado: catálogos en base con `spec_version`, contrato que no
   menciona campos fiscales, y el formato del consecutivo deliberadamente **no**
   armado (`componentesConsecutivo` devuelve las piezas, no el número compuesto).
2. **Consecutivos duplicados.** Un número repetido en un comprobante fiscal no se
   corrige con un `UPDATE`: hay que anular y reemitir, con Hacienda de por medio.
   Mitigado: `UPDATE ... RETURNING` atómico, no `MAX + 1`. Verificado con 30
   asignaciones simultáneas → 30 números distintos y consecutivos.
   > Nota: el resto del sistema **sí** usa `MAX + 1` (`nextExpenseNumber` en
   > `expenses.ts`). Ahí el peor caso es un consecutivo interno repetido, molesto
   > pero corregible. Queda anotado como deuda aparte.
3. **Cruce de información fiscal entre condominios.** Son contribuyentes
   distintos. Mitigado: 1 a 1 con el condominio, `condominium_id` en la clave
   única de los consecutivos, RLS con `FORCE`, y ninguna función que copie.
4. **Secretos en la base o en el navegador.** Mitigado: no hay columna para el
   secreto, solo una referencia.
5. **Reescritura del historial.** Mitigado con disparadores, no con convenciones.
6. **Vencimiento del certificado sin aviso.** `expires_at` indexado; falta el
   trabajo programado que avise (componente futuro).
7. **Activar por accidente.** Mitigado: `IMPLEMENTADOS` vacío, todos los
   condominios en `inactivo`, y `puedeEmitir()` exige además ambiente de
   producción.

## 9. Componentes futuros

Lo que falta escribir el día de la implementación, en orden:

1. Carga de los catálogos oficiales (`fiscal_catalog_entries`) desde la
   especificación vigente.
2. Un adaptador que implemente `EInvoicingProvider`, y su registro en la fábrica.
3. Generación y firma del XML — dentro del adaptador, nunca en Finanzas.
4. Validación de fondo en `camposFaltantes()` contra el catálogo cargado (hoy solo
   comprueba que los campos estén).
5. Pantalla de configuración fiscal en Finanzas, con el flujo de cinco pasos.
6. Acciones del flujo (validar / probar conexión / activar / suspender), cada una
   moviendo el estado con `puedeTransicionarModulo`.
7. El disparador de emisión: qué evento de Finanzas genera un comprobante.
8. Trabajo programado que consulte el estado de los enviados y avise de
   certificados por vencer.
9. Representación gráfica (PDF) del comprobante y su envío por correo.
10. Reporte de comprobantes emitidos, y su conexión con el módulo de Reportes.

## 10. Qué quedó preparado

- Modelo de datos completo, aditivo, aplicado y verificado.
- Configuración fiscal por condominio, con todos los campos pedidos, sin
  compartir nada entre condominios.
- Consecutivos seguros: atómicos, sin duplicados bajo concurrencia, sin cruzarse
  entre condominios, sin poder retroceder.
- Almacenamiento previsto para XML generado, enviado, respuesta, estado, clave,
  consecutivo y fecha — por referencia al repositorio, no como columnas.
- Los siete estados de comprobante y los seis del módulo, con sus transiciones
  escritas y probadas.
- Referencias entre documentos para notas de crédito y débito, con la
  imposibilidad de editar un comprobante emitido garantizada en la base.
- Seguridad: RLS forzado, secretos por referencia, disparadores de inmutabilidad.
- Contrato de proveedor intercambiable, sin ninguna implementación.
- Flujo de activación diseñado y **mantenido inactivo**.

**Lo que NO quedó hecho, a propósito**: no se generó XML, no se emitió ningún
comprobante, no se contactó a Hacienda, no se cargaron catálogos, no se pidieron
credenciales, no se eligió proveedor y no se codificó ninguna estructura
tributaria.
