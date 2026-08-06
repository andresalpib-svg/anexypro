'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HardDrive, CheckCircle2, XCircle, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { testProviderAction, activateProviderAction } from './actions';
import type { StorageKind } from '@/lib/storage/provider';
import { enTransicion } from '@/lib/accion-segura';

export type ProviderOption = {
  kind: StorageKind;
  label: string;
  implemented: boolean;
  active: boolean;
};

export function StorageConfig({
  providers,
  stats,
}: {
  providers: ProviderOption[];
  stats: { folders: number; objects: number; totalBytes: number; byProvider: { provider: string; files: number; bytes: number }[] };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [health, setHealth] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const mb = (n: number) => (n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Carpetas</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{stats.folders}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Documentos</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{stats.objects}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Volumen</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{mb(stats.totalBytes)}</p>
        </div>
      </div>

      <div className="card mt-4 divide-y divide-line">
        {providers.map((p) => {
          const h = health[p.kind];
          return (
            <div key={p.kind} className="flex flex-wrap items-center gap-3 p-4">
              <span
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${
                  p.active ? 'bg-royal text-white' : 'bg-canvas text-muted'
                }`}
              >
                <HardDrive size={18} />
              </span>
              <div className="min-w-48 flex-1">
                <p className="font-sans text-sm font-bold text-ink">
                  {p.label}
                  {p.active && <span className="ml-2 text-xs font-semibold text-royal">activo</span>}
                </p>
                <p className="text-xs text-muted">
                  {p.implemented
                    ? 'Proveedor implementado.'
                    : 'Declarado para migración: falta el archivo que implemente StorageProvider.'}
                </p>
                {h && (
                  <p className={`mt-1 flex items-start gap-1.5 text-xs ${h.ok ? 'text-ok' : 'text-danger'}`}>
                    {h.ok ? <CheckCircle2 size={12} className="mt-0.5 flex-none" /> : <XCircle size={12} className="mt-0.5 flex-none" />}
                    {h.detail}
                  </p>
                )}
                {stats.byProvider.find((s) => s.provider === p.kind) && (
                  <p className="mt-1 text-[.7rem] text-muted">
                    {stats.byProvider.find((s) => s.provider === p.kind)!.files} archivo(s) guardado(s) acá.
                  </p>
                )}
              </div>

              {p.implemented && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    enTransicion(startTransition, async () => {
                      const r = await testProviderAction(p.kind);
                      setHealth((prev) => ({ ...prev, [p.kind]: r }));
                    })
                  }
                  className="btn-ghost py-2 text-xs"
                >
                  {pending ? <Loader2 size={13} className="animate-spin" /> : null} Probar conexión
                </button>
              )}
              {p.implemented && !p.active && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    enTransicion(startTransition, async () => {
                      const r = await activateProviderAction(p.kind);
                      if (r.ok) {
                        toast.success(`${p.label} quedó activo. ${r.detail ?? ''}`);
                        router.refresh();
                      } else toast.error(r.error);
                    })
                  }
                  className="btn-primary py-2 text-xs"
                >
                  Activar
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="card mt-4 p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <Info size={13} /> Cómo está construido
        </p>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">
          <p>
            Ningún módulo del sistema conoce el proveedor. Todos hablan con una sola interfaz, y detrás de esa
            interfaz se conecta Google Drive, el servidor de ANEXYpro o, en el futuro, S3, Cloud Storage, R2 o
            Azure. <b>Cambiar de proveedor no cambia una sola línea del resto del sistema.</b>
          </p>
          <p>
            La base de datos guarda solo metadatos: proveedor, identificador, nombre, tipo, tamaño, fechas,
            dueño, condominio, huella del contenido y estado. <b>Nunca una ruta ni una URL permanente.</b>
          </p>
          <p>
            Al cambiar de proveedor, los archivos ya guardados se siguen leyendo con el proveedor con el que se
            guardaron. Por eso conviven dos durante una migración sin que el usuario note nada.
          </p>
        </div>
      </div>

      <div className="card mt-4 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Para activar Google Drive</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink">
          <li>Crear una cuenta de servicio en Google Cloud con la API de Drive habilitada.</li>
          <li>
            Definir en el entorno <code className="rounded bg-canvas px-1">GOOGLE_DRIVE_CLIENT_EMAIL</code> y{' '}
            <code className="rounded bg-canvas px-1">GOOGLE_DRIVE_PRIVATE_KEY</code>.
          </li>
          <li>
            Compartir la carpeta raíz con el correo de la cuenta de servicio, o usar una unidad compartida y
            definir <code className="rounded bg-canvas px-1">GOOGLE_DRIVE_SHARED_DRIVE_ID</code>.
          </li>
          <li>Probar la conexión acá y recién entonces activar.</li>
        </ol>
        <p className="mt-2 text-xs text-muted">
          Recomendación: usar una unidad compartida. Sin ella los archivos cuentan contra la cuota de la cuenta
          de servicio, que es pequeña y no se puede ampliar.
        </p>
      </div>
    </div>
  );
}
