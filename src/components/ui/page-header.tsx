/**
 * Encabezado de página.
 *
 * `menu` es el botón de tres puntos con las opciones de edición del
 * módulo. Se recibe ya resuelto en vez de calcularlo aquí porque este
 * componente también se usa desde una pantalla de cliente
 * (`condominios/nuevo`), y leer la sesión lo obligaría a ser asíncrono.
 * Ver `ModuleActions`.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  menu,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="font-sans text-2xl font-bold text-ink">{title}</h1>
          {menu}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
