'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { requestDocument, DOC_TYPE_LABEL } from '@/lib/services/document-requests';

export async function requestDocumentAction(
  docType: 'certificacion_cuotas_al_dia' | 'estado_cuenta',
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { ok: false, error: 'Tu cuenta no está vinculada a ninguna unidad.' };

  try {
    await requestDocument(
      session.user.companyId,
      {
        condominiumId: ctx.condominium.id,
        propertyId: ctx.property.id,
        personId: ctx.person.id,
        docType,
        note,
      },
      { userId: session.user.id, userName: session.user.name ?? ctx.person.fullName }
    );
  } catch (err: any) {
    // El `findFirst` de `requestDocument` ya avisa con el mismo mensaje
    // en el caso normal; esto solo dispara si dos clics casi
    // simultáneos ganan la carrera al `findFirst` y choca contra el
    // índice único parcial de la base (`P2002`, ver migración
    // 20260816_convenio_solicitud_unicos).
    if (err?.code === 'P2002') {
      return { ok: false, error: `Ya tienes una solicitud de "${DOC_TYPE_LABEL[docType]}" en trámite.` };
    }
    return { ok: false, error: err?.message ?? 'No se pudo enviar la solicitud.' };
  }
  revalidatePath('/portal/estado-cuenta');
  return { ok: true };
}
