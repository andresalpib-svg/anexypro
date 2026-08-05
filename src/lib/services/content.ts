import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';

export async function listContentAdmin(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.contentItem.findMany({ where: { condominiumId }, orderBy: { createdAt: 'desc' } })
  );
}

export async function createContentItem(
  companyId: string,
  userId: string,
  userName: string,
  input: { condominiumId: string; category: string; title: string; description?: string; fileUrl?: string; videoUrl?: string; publish: boolean }
) {
  return withTenantContext(companyId, async (tx) => {
    const item = await tx.contentItem.create({
      data: {
        condominiumId: input.condominiumId,
        category: input.category as any,
        title: input.title,
        description: input.description || null,
        fileUrl: input.fileUrl || null,
        videoUrl: input.videoUrl || null,
        publishedAt: input.publish ? new Date() : null,
        createdById: userId,
      },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Comunicados', action: 'Contenido de valor agregado', target: item.title });
    return item;
  });
}

export async function togglePublish(companyId: string, itemId: string, publish: boolean) {
  return withTenantContext(companyId, (tx) =>
    tx.contentItem.update({ where: { id: itemId }, data: { publishedAt: publish ? new Date() : null } })
  );
}

export async function deleteContentItem(companyId: string, itemId: string) {
  return withTenantContext(companyId, (tx) => tx.contentItem.delete({ where: { id: itemId } }));
}
