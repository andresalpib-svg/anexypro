import { auth } from '@/lib/auth';
import { buildImportTemplate } from '@/lib/services/import-excel';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('No autorizado', { status: 401 });

  const buffer = buildImportTemplate();

  return new Response(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-residentes-anexypro.xlsx"',
    },
  });
}
