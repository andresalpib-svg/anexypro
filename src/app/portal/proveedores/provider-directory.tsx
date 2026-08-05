'use client';

import { useState, useRef, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { Phone, MessageCircle, Globe, Mail, ArrowLeft, Handshake, X, Search, Package } from 'lucide-react';
import { SERVICE_CATEGORIES, categoryLabel, parseAccessories } from '@/lib/services/service-providers';

export type DirectoryProvider = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  accessories: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
};

const COOKIE = 'anexypro-aviso-proveedores';

function CategoryIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Wrench;
  return <Icon size={size} />;
}

/**
 * Aviso previo al directorio. Es una nota de cortesía y, a la vez, el
 * deslinde de responsabilidad de la Administración sobre el servicio
 * que preste cada proveedor (son empresas independientes).
 */
function DisclaimerModal({ onAccept }: { onAccept: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-deep/60 p-6 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (boxRef.current && !boxRef.current.contains(e.target as Node)) onAccept();
      }}
    >
      <div ref={boxRef} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line bg-royal-soft px-6 py-4">
          <Handshake className="mt-0.5 flex-none text-royal" size={22} />
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-lg font-extrabold text-ink">Un directorio para facilitarte el camino</h2>
          </div>
          <button
            type="button"
            onClick={onAccept}
            aria-label="Cerrar aviso"
            className="flex-none rounded-lg p-1.5 text-muted transition hover:bg-white hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-3 px-6 py-5 text-sm leading-relaxed text-ink">
          <p>
            Reunimos aquí proveedores de materiales, accesorios y mantenimiento para que encuentres rápido lo que
            necesitas y puedas iniciar tu proyecto sin perder tiempo buscando.
          </p>
          <p>
            Ten presente que cada proveedor es una <b>empresa independiente</b>. El precio, los plazos, las garantías y
            la calidad del trabajo se acuerdan directamente entre tú y el proveedor:{' '}
            <b>la Administración no participa en esa contratación ni se hace responsable por el servicio brindado.</b>
          </p>
          <p className="text-muted">
            Nuestra recomendación: solicita un par de cotizaciones y deja los alcances por escrito antes de empezar.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-3">
          <button type="button" onClick={onAccept} className="btn-primary py-2 text-xs">
            Entendido, ver proveedores
          </button>
        </footer>
      </div>
    </div>
  );
}

function ProviderGrid({ providers }: { providers: DirectoryProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
      {providers.map((p) => (
        <div key={p.id} className="card p-5">
          <div className="flex items-start gap-4">
            {p.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logoUrl} alt={p.name} className="h-14 w-14 flex-none rounded-xl border border-line object-contain p-1" />
            ) : (
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-royal-soft text-lg font-bold text-royal">
                {p.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-sans text-sm font-bold text-ink">{p.name}</p>
              <p className="text-[.7rem] text-muted">{categoryLabel(p.category)}</p>
              {p.description && <p className="mt-1 text-xs leading-relaxed text-muted">{p.description}</p>}
              {parseAccessories(p.accessories).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {parseAccessories(p.accessories).map((a) => (
                    <span key={a} className="rounded-full bg-canvas px-2 py-0.5 text-[.65rem] font-medium text-ink">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs">
            <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 font-semibold text-royal hover:underline">
              <Phone size={13} /> {p.phone}
            </a>
            {p.whatsapp && (
              <a
                href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-ok hover:underline"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
            )}
            {p.email && (
              <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
                <Mail size={13} /> {p.email}
              </a>
            )}
            {p.website && (
              <a
                href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-muted hover:text-ink"
              >
                <Globe size={13} /> Sitio web
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProviderDirectory({ providers }: { providers: DirectoryProvider[] }) {
  const [accepted, setAccepted] = useState(true); // evita parpadeo antes de leer la cookie
  const [category, setCategory] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState('');
  const [accessoryQuery, setAccessoryQuery] = useState('');

  useEffect(() => {
    const seen = document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=`));
    if (!seen) setAccepted(false);
  }, []);

  const accept = () => {
    // El aviso se recuerda por 30 días para no repetirlo en cada visita.
    document.cookie = `${COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}`;
    setAccepted(true);
  };

  const nq = nameQuery.trim().toLowerCase();
  const aq = accessoryQuery.trim().toLowerCase();
  const searching = nq.length > 0 || aq.length > 0;

  const matches = (p: DirectoryProvider) =>
    (nq ? p.name.toLowerCase().includes(nq) : true) &&
    (aq ? `${p.accessories ?? ''} ${p.description ?? ''}`.toLowerCase().includes(aq) : true);

  const found = providers.filter(matches);
  const countOf = (key: string) => providers.filter((p) => p.category === key).length;
  const visibleCategories = SERVICE_CATEGORIES.filter((c) => countOf(c.key) > 0);
  const inCategory = category ? providers.filter((p) => p.category === category) : [];
  // Qué se muestra: resultados de búsqueda › categoría abierta › nada.
  const listed = searching ? found : inCategory;

  return (
    <>
      {!accepted && <DisclaimerModal onAccept={accept} />}

      {/* Recordatorio permanente y discreto del deslinde */}
      <p className="mb-4 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-muted">
        Cada proveedor es una empresa independiente. La contratación se realiza directamente entre el residente y el
        proveedor; la Administración no se hace responsable por el servicio brindado.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Buscar por nombre del proveedor…"
            className="field-input pl-9"
          />
        </div>
        <div className="relative min-w-56 flex-1">
          <Package size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={accessoryQuery}
            onChange={(e) => setAccessoryQuery(e.target.value)}
            placeholder="Buscar por accesorio o producto (cemento, pintura…)"
            className="field-input pl-9"
          />
        </div>
      </div>

      {searching ? (
        <>
          <p className="mb-3 text-sm text-muted">
            {listed.length === 0
              ? 'Ningún proveedor coincide con la búsqueda.'
              : `${listed.length} proveedor${listed.length === 1 ? '' : 'es'} encontrado${listed.length === 1 ? '' : 's'}`}
          </p>
          <ProviderGrid providers={listed} />
        </>
      ) : category === null ? (
        visibleCategories.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">
            El directorio de proveedores todavía no tiene registros.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
            {visibleCategories.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className="card flex items-center gap-3 p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-royal-soft text-royal">
                  <CategoryIcon name={c.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-sans text-sm font-bold text-ink">{c.label}</span>
                  <span className="block text-xs text-muted">
                    {countOf(c.key)} proveedor{countOf(c.key) === 1 ? '' : 'es'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <button type="button" onClick={() => setCategory(null)} className="btn-ghost mb-4 py-1.5 text-xs">
            <ArrowLeft size={14} /> Todas las categorías
          </button>
          <p className="mb-3 font-sans text-base font-bold text-ink">{categoryLabel(category)}</p>
          <ProviderGrid providers={listed} />
        </>
      )}
    </>
  );
}
