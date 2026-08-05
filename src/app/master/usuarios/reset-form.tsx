'use client';

import { useState, useTransition } from 'react';
import { Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { resetPasswordAction } from '../actions';

/**
 * Fija la contraseña de un usuario desde el panel del master.
 *
 * Antes generaba una al azar y la mostraba una sola vez. Ahora la
 * escribe quien la va a dictar, y se pide dos veces: es una contraseña
 * que se entrega por teléfono o en persona, y un error de tecleo deja
 * al usuario fuera sin que nadie se entere hasta que intenta entrar.
 */
export function ResetForm({
  userId,
  nombre,
  onListo,
}: {
  userId: string;
  nombre: string;
  onListo: () => void;
}) {
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pendiente, start] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    start(async () => {
      const r = await resetPasswordAction(userId, password);
      if (r.error) setError(r.error);
      else setOk(true);
    });
  }

  if (ok) {
    return (
      <div className="py-4 text-center">
        <Check className="mx-auto mb-3 text-ok" size={30} />
        <p className="font-semibold text-ink">Contraseña actualizada</p>
        <p className="mt-1.5 text-sm text-muted">
          {nombre} ya puede ingresar con la contraseña que acabás de fijar. Si estaba bloqueado,
          quedó reactivado.
        </p>
        <button type="button" onClick={onListo} className="btn-primary mt-6">
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <p className="text-sm text-muted">
        Escribí la contraseña que le vas a entregar a <strong className="text-ink">{nombre}</strong>.
        La actual dejará de servir.
      </p>

      <div>
        <label htmlFor="np" className="label">
          Contraseña nueva
        </label>
        <div className="relative">
          <input
            id="np"
            type={ver ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            className="input pr-10"
            placeholder="Al menos 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setVer((v) => !v)}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition hover:text-ink"
          >
            {ver ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="np2" className="label">
          Repetí la contraseña
        </label>
        <input
          id="np2"
          type={ver ? 'text' : 'password'}
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
          placeholder="La misma de arriba"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
        />
      </div>

      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onListo} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={pendiente} className="btn-primary">
          {pendiente ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={15} className="animate-spin" /> Guardando…
            </span>
          ) : (
            'Guardar contraseña'
          )}
        </button>
      </div>
    </form>
  );
}
