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
  // En un teléfono el título y el botón de acción no caben en la misma
  // fila: se apilan, y el botón se alinea a la izquierda con el título
  // en vez de quedar colgando del borde.
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h1 className="font-sans text-xl font-bold text-ink sm:text-2xl">{title}</h1>
          {menu}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 sm:flex-none">{action}</div>}
    </div>
  );
}
