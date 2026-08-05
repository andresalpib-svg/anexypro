import { auth } from '@/lib/auth';
import { buildImportTemplate } from '@/lib/services/import-excel';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('No autorizado', { status: 401 });

  return new Response(new Uint8Array(buildImportTemplate()), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-residentes-anexypro.xlsx"',
    },
  });
}
