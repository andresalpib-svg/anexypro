'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  Folder, FolderOpen, FileText, Upload, Download, Eye, Trash2, Pencil,
  Search, RefreshCw, ShieldCheck, User, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  uploadDocumentAction,
  linkForAction,
  deleteDocumentAction,
  renameDocumentAction,
  rebuildTreeAction,
  searchAction,
  type ActionState,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type FolderRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  depth: number;
  personId: string | null;
  fileCount: number;
  canWrite: boolean;
};

export type ObjectRow = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  ownerName: string | null;
};

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      <Upload size={14} /> {pending ? 'Subiendo…' : 'Subir'}
    </button>
  );
}

export function RepositoryBrowser({
  condominiumId,
  condoName,
  providerLabel,
  folders,
  selectedId,
  objects,
  canRebuild,
}: {
  condominiumId: string;
  condoName: string;
  providerLabel: string;
  folders: FolderRow[];
  selectedId: string | null;
  objects: ObjectRow[];
  canRebuild: boolean;
}) {
  const [uploadState, uploadAction] = useFormState<ActionState, FormData>(uploadDocumentAction, {});
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; folderName: string; sizeBytes: number }[] | null>(null);

  const selected = folders.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (uploadState.success) toast.success('Documento subido.');
    if (uploadState.formError) toast.error(uploadState.formError);
  }, [uploadState.success, uploadState.formError]);

  // Búsqueda con espera: no se consulta en cada tecla.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      enTransicion(startTransition, async () => {
        const r = await searchAction(condominiumId, query);
        if (r.ok) setResults(r.results ?? []);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [query, condominiumId]);

  /**
   * Abre el documento pidiendo un enlace de corta vida.
   *
   * El enlace no existe hasta este momento y vence en cinco minutos.
   * Nunca hay una URL permanente en el HTML que alguien pueda copiar y
   * compartir.
   */
  const open = (objectId: string, mode: 'v' | 'd') =>
    enTransicion(startTransition, async () => {
      const r = await linkForAction(objectId, condominiumId, mode);
      if (!r.ok || !r.url) {
        toast.error(r.error ?? 'No se pudo abrir el documento.');
        return;
      }
      window.open(r.url, '_blank', 'noopener');
    });

  const secciones = useMemo(() => folders.filter((f) => f.kind !== 'residente'), [folders]);
  const residentes = useMemo(() => folders.filter((f) => f.kind === 'residente'), [folders]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar un documento en todo el repositorio…"
            className="field-input pl-9"
          />
        </div>
        <span className="flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          <ShieldCheck size={13} className="text-royal" /> {providerLabel}
        </span>
        {canRebuild && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              enTransicion(startTransition, async () => {
                const r = await rebuildTreeAction(condominiumId);
                if (r.ok) toast.success(r.detail ?? 'Repositorio verificado.');
                else toast.error(r.error);
              })
            }
            className="btn-ghost py-2 text-xs"
          >
            <RefreshCw size={13} /> Verificar carpetas
          </button>
        )}
      </div>

      {results !== null ? (
        <div className="card mt-4 overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
            {results.length} resultado(s) para “{query}”
          </p>
          <ul className="divide-y divide-line">
            {results.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted">
                Ningún documento coincide entre las carpetas a las que tenés acceso.
              </li>
            ) : (
              results.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <FileText size={15} className="flex-none text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{r.name}</p>
                    <p className="text-xs text-muted">
                      {r.folderName} · {kb(r.sizeBytes)}
                    </p>
                  </div>
                  <button type="button" onClick={() => open(r.id, 'v')} className="text-royal hover:opacity-70" title="Ver">
                    <Eye size={15} />
                  </button>
                  <button type="button" onClick={() => open(r.id, 'd')} className="text-muted hover:text-royal" title="Descargar">
                    <Download size={15} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-[300px_1fr] gap-4 max-lg:grid-cols-1">
          {/* ---------- Árbol ---------- */}
          <div className="card overflow-hidden">
            <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
              {condoName}
            </p>
            <nav className="max-h-[34rem] overflow-y-auto py-1">
              {secciones.map((f) => (
                <a
                  key={f.id}
                  href={`/app/repositorio?condoId=${condominiumId}&carpeta=${f.id}`}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition ${
                    f.id === selectedId ? 'bg-royal-soft font-semibold text-royal' : 'text-ink hover:bg-canvas'
                  }`}
                  style={{ paddingLeft: `${12 + f.depth * 16}px` }}
                >
                  {f.id === selectedId ? (
                    <FolderOpen size={15} className="flex-none" />
                  ) : (
                    <Folder size={15} className="flex-none text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {f.fileCount > 0 && <span className="flex-none text-[.65rem] text-muted">{f.fileCount}</span>}
                  {!f.canWrite && (
                    <span title="Solo lectura" className="flex-none">
                      <Lock size={11} className="text-muted" />
                    </span>
                  )}
                </a>
              ))}

              {residentes.length > 0 && (
                <>
                  <p className="mt-2 border-t border-line px-3 pb-1 pt-2 text-[.65rem] font-bold uppercase tracking-wide text-muted">
                    Carpetas de residentes ({residentes.length})
                  </p>
                  {residentes.map((f) => (
                    <a
                      key={f.id}
                      href={`/app/repositorio?condoId=${condominiumId}&carpeta=${f.id}`}
                      className={`flex items-center gap-2 py-2 pl-7 pr-3 text-sm transition ${
                        f.id === selectedId ? 'bg-royal-soft font-semibold text-royal' : 'text-ink hover:bg-canvas'
                      }`}
                    >
                      <User size={14} className="flex-none text-muted" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      {f.fileCount > 0 && <span className="flex-none text-[.65rem] text-muted">{f.fileCount}</span>}
                    </a>
                  ))}
                </>
              )}
            </nav>
          </div>

          {/* ---------- Contenido ---------- */}
          <div>
            {selected ? (
              <>
                {selected.canWrite && (
                  <form action={uploadAction} className="card p-4">
                    <input type="hidden" name="condominiumId" value={condominiumId} />
                    <input type="hidden" name="folderId" value={selected.id} />
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-56 flex-1">
                        <label className="field-label">Subir a {selected.name}</label>
                        <input name="file" type="file" className="field-input text-xs" />
                      </div>
                      <Submit />
                    </div>
                    {uploadState.errors?.file && (
                      <p className="mt-2 text-xs font-medium text-danger">{uploadState.errors.file[0]}</p>
                    )}
                  </form>
                )}

                <div className="card mt-4 overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                    <p className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">
                      {selected.name} ({objects.length})
                    </p>
                    {!selected.canWrite && (
                      <span className="flex items-center gap-1 text-[.7rem] text-muted">
                        <Lock size={11} /> solo lectura
                      </span>
                    )}
                  </div>
                  <ul className="divide-y divide-line">
                    {objects.length === 0 ? (
                      <li className="p-10 text-center text-sm text-muted">
                        <FileText className="mx-auto mb-2 text-muted" size={20} />
                        Esta carpeta está vacía.
                      </li>
                    ) : (
                      objects.map((o) => (
                        <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                          <FileText size={15} className="flex-none text-muted" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{o.name}</p>
                            <p className="text-xs text-muted">
                              {kb(o.sizeBytes)} · {fecha(o.createdAt)}
                              {o.ownerName && ` · ${o.ownerName}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => open(o.id, 'v')}
                            className="flex-none text-royal transition hover:opacity-70"
                            title="Ver"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => open(o.id, 'd')}
                            className="flex-none text-muted transition hover:text-royal"
                            title="Descargar"
                          >
                            <Download size={15} />
                          </button>
                          {selected.canWrite && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                const nuevo = window.prompt('Nuevo nombre del documento:', o.name);
                                if (!nuevo) return;
                                enTransicion(startTransition, async () => {
                                  const r = await renameDocumentAction(o.id, condominiumId, nuevo);
                                  if (r.ok) toast.success('Documento renombrado.');
                                  else toast.error(r.error);
                                });
                              }}
                              className="flex-none text-muted transition hover:text-royal"
                              title="Renombrar"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {selected.canWrite && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                if (!window.confirm(`¿Eliminar "${o.name}"?`)) return;
                                enTransicion(startTransition, async () => {
                                  const r = await deleteDocumentAction(o.id, condominiumId);
                                  if (r.ok) toast.success('Documento eliminado.');
                                  else toast.error(r.error);
                                });
                              }}
                              className="flex-none text-muted transition hover:text-danger"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
                  <ShieldCheck size={13} className="mt-0.5 flex-none text-royal" />
                  Ningún documento es público. Al abrirlo, ANEXYpro emite un enlace que vive cinco minutos, es
                  únicamente para tu usuario y vuelve a verificar tus permisos en el momento de la descarga. La
                  ubicación real del archivo nunca sale del servidor.
                </p>
              </>
            ) : (
              <div className="card p-12 text-center">
                <Folder className="mx-auto mb-3 text-muted" size={26} />
                <p className="text-sm font-semibold text-ink">Elegí una carpeta</p>
                <p className="mt-1 text-sm text-muted">
                  {folders.length === 0
                    ? 'Este condominio todavía no tiene el repositorio creado. Usá “Verificar carpetas”.'
                    : 'Las carpetas de la izquierda son las que tu rol puede ver.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
