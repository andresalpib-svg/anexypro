'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AssetCategoryManager } from './asset-category-manager';

export type AssetCategoryOption = { id: string; name: string; isActive: boolean };

const EDITAR_MAS_OPCIONES = '__editar_categorias__';

/**
 * Selector de Categoría del activo, con "Editar más opciones…" al
 * final para abrir el catálogo del condominio (agregar, renombrar,
 * desactivar). Elegir esa opción no envía nada: solo abre el
 * administrador y el selector vuelve a su valor.
 */
export function CategorySelect({
  condominiumId,
  categories,
  name = 'categoryId',
  defaultValue,
  className = 'field-input',
}: {
  condominiumId: string;
  categories: AssetCategoryOption[];
  name?: string;
  defaultValue?: string;
  className?: string;
}) {
  const [managing, setManaging] = useState(false);
  const router = useRouter();

  // Si la categoría actual del activo se desactivó después, se sigue
  // ofreciendo aquí para no perder la selección al editar.
  const disponibles = categories.filter((c) => c.isActive || c.id === defaultValue);

  return (
    <>
      <select
        name={name}
        defaultValue={defaultValue ?? ''}
        onChange={(e) => {
          if (e.target.value === EDITAR_MAS_OPCIONES) {
            e.target.value = defaultValue ?? '';
            setManaging(true);
          }
        }}
        className={className}
      >
        {!defaultValue && <option value="">Selecciona…</option>}
        {disponibles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={EDITAR_MAS_OPCIONES}>Editar más opciones…</option>
      </select>
      {managing && (
        <AssetCategoryManager
          condominiumId={condominiumId}
          categories={categories}
          onClose={() => {
            setManaging(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
