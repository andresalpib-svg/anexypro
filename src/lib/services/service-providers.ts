import { prisma } from '@/lib/db';

/**
 * Directorio de proveedores para trabajos varios.
 *
 * Es una base de datos de PLATAFORMA: la mantiene el usuario master y
 * la consultan los residentes de todos los condominios. No pertenece a
 * ninguna empresa administradora ni sustituye a los proveedores
 * contratados por el condominio (esos viven en el módulo Operativo).
 */

export const SERVICE_CATEGORIES = [
  { key: 'materiales', label: 'Materiales de construcción', icon: 'Hammer' },
  { key: 'electricidad', label: 'Electricidad', icon: 'Zap' },
  { key: 'fontaneria', label: 'Fontanería', icon: 'Droplets' },
  { key: 'pintura', label: 'Pintura y acabados', icon: 'Paintbrush' },
  { key: 'jardineria', label: 'Jardinería y zonas verdes', icon: 'Trees' },
  { key: 'limpieza', label: 'Limpieza', icon: 'Sparkles' },
  { key: 'aire', label: 'Aire acondicionado', icon: 'Wind' },
  { key: 'cerrajeria', label: 'Cerrajería y seguridad', icon: 'KeyRound' },
  { key: 'carpinteria', label: 'Carpintería y muebles', icon: 'Sofa' },
  { key: 'piscinas', label: 'Piscinas', icon: 'Waves' },
  { key: 'mudanzas', label: 'Mudanzas y transporte', icon: 'Truck' },
  { key: 'techos', label: 'Techos e impermeabilización', icon: 'CloudRain' },
  { key: 'electrodomesticos', label: 'Electrodomésticos', icon: 'Plug' },
  { key: 'otros', label: 'Otros servicios', icon: 'Wrench' },
] as const;

export type ServiceCategoryKey = (typeof SERVICE_CATEGORIES)[number]['key'];

export function categoryLabel(key: string): string {
  return SERVICE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export type ServiceProviderInput = {
  category: string;
  name: string;
  description?: string;
  accessories?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  visible: boolean;
};

/** Lo que ve el residente: SOLO proveedores visibles. */
export async function listVisibleProviders() {
  return prisma.serviceProvider.findMany({
    where: { visible: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

/** Lo que ve el master: todos, incluidos los ocultos. */
export async function listAllProviders() {
  return prisma.serviceProvider.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createProvider(input: ServiceProviderInput) {
  return prisma.serviceProvider.create({
    data: {
      category: input.category,
      name: input.name,
      description: input.description || null,
      accessories: input.accessories || null,
      phone: input.phone,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      website: input.website || null,
      logoUrl: input.logoUrl || null,
      visible: input.visible,
    },
  });
}

export async function updateProvider(id: string, input: ServiceProviderInput) {
  return prisma.serviceProvider.update({
    where: { id },
    data: {
      category: input.category,
      name: input.name,
      description: input.description || null,
      accessories: input.accessories || null,
      phone: input.phone,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      website: input.website || null,
      // Sin logo nuevo, se conserva el existente.
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      visible: input.visible,
    },
  });
}

export async function toggleProviderVisibility(id: string, visible: boolean) {
  return prisma.serviceProvider.update({ where: { id }, data: { visible } });
}

export async function deleteProvider(id: string) {
  return prisma.serviceProvider.delete({ where: { id } });
}

/** "Cemento, varilla, block" → ["Cemento", "varilla", "block"] */
export function parseAccessories(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter(Boolean);
}
