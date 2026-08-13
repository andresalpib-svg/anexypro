-- Agrega el rubro/actividad comercial del proveedor de Finanzas.
--
-- POR QUÉ. El alta rápida de proveedor desde "Nuevo gasto" solo pedía
-- razón social, nombre comercial, cédula jurídica, correo y teléfono.
-- Faltaba la actividad ("Seguros", "Jardinería", "Mantenimiento
-- eléctrico"…) que el formulario ahora captura. No es la misma columna
-- que `default_category`: esa la aprende el sistema sola del historial
-- de gastos; esta la escribe la administración al registrar el
-- proveedor.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS activity TEXT;
