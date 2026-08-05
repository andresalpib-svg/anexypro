'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getUserDetailAction, type DetalleUsuario } from '../actions';

/**
 * Ficha del usuario.
 *
 * Se carga al abrir y no antes: son varias consultas por usuario y la
 * tabla puede traer trescientas filas.
 *
 * Los últimos accesos son lo que de verdad resuelve la llamada: si hay
 * intentos fallidos, el usuario existe y se equivoca de contraseña; si
 * no hay ninguno, ni siquiera está llegando al sistema.
 */
export function UserDetail({ userId }: { userId: string }) {
  const [datos, setDatos] = useState<DetalleUsuario | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getUserDetailAction(userId).then((r) => {
      if (!vivo) return;
      if (!r) setError('No se pudo cargar la información.');
      else setDatos(r);
    });
    return () => {
      vivo = false;
    };
  }, [userId]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!datos) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <Loader2 className="animate-spin" size={15} /> Cargando…
      </p>
    );
  }

  const ROL: Record<string, string> = {
    admin_owner: 'Administrador',
    admin_staff: 'Supervisor',
    contador: 'Contador',
    seguridad: 'Seguridad',
    condomino: 'Condómino',
    master: 'Master',
  };

  return (
    <div className="space-y-4 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Fila k="Empresa" v={datos.companyName} />
        <Fila k="Rol" v={ROL[datos.role] ?? datos.role} />
        <Fila k="Estado" v={datos.status} />
        <Fila k="Teléfono" v={datos.phone ?? '—'} />
        <Fila k="Creado" v={new Date(datos.createdAt).toLocaleDateString('es-CR')} />
        <Fila
          k="Último ingreso"
          v={datos.lastLoginAt ? new Date(datos.lastLoginAt).toLocaleString('es-CR') : 'nunca ha ingresado'}
        />
      </dl>

      {datos.condominios.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Condominios asignados</p>
          <p className="text-ink">{datos.condominios.join(' · ')}</p>
        </div>
      )}

      {datos.persona && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Ficha de residente</p>
          <p className="text-ink">
            {datos.persona.fullName}
            {datos.persona.idNumber ? ` · cédula ${datos.persona.idNumber}` : ''}
          </p>
          {datos.persona.unidades.length > 0 && (
            <p className="text-xs text-muted">{datos.persona.unidades.join(' · ')}</p>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Últimos accesos</p>
        {datos.accesos.length === 0 ? (
          <p className="text-muted">
            Sin registros. Este usuario nunca ha llegado a la pantalla de acceso con estas credenciales.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {datos.accesos.map((a, i) => (
              <li key={i} className="flex justify-between">
                <span className={a.eventType === 'login_failed' ? 'text-danger' : 'text-ink'}>
                  {a.eventType === 'login_failed' ? 'Intento fallido' : 'Ingreso correcto'}
                </span>
                <span className="text-muted">{new Date(a.createdAt).toLocaleString('es-CR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </>
  );
}
