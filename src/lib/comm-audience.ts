/** Etiqueta legible de la audiencia de un comunicado. */
const ROLE_PLURAL: Record<string, string> = {
  propietario: 'Propietarios',
  residente: 'Residentes',
  inquilino: 'Inquilinos',
  familiar: 'Familiares',
  empleado: 'Empleados',
};

export function audienceLabel(targets: { targetType: string; role?: string | null }[]): string {
  const t = targets[0];
  if (!t) return 'Todos los residentes';
  if (t.targetType === 'rol' && t.role) return `Solo ${ROLE_PLURAL[t.role] ?? t.role}`;
  return 'Todos los residentes';
}
