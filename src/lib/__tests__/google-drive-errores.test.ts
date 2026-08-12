import { describe, it, expect } from 'vitest';
import { motivoDelRechazo } from '@/lib/storage/google-drive-provider';

/**
 * Este texto es lo que un administrador lee en «Estado del sistema»
 * cuando el repositorio deja de guardar documentos, y es lo único que
 * tiene para saber qué hacer. Lo que se prueba acá no es la redacción:
 * es que los dos motivos NO se confundan. Se arreglan en sitios
 * distintos —uno reautorizando la cuenta, el otro corrigiendo las
 * credenciales del cliente en Google Cloud— y durante meses el mensaje
 * fue el mismo para los dos ("volvé a autorizar la cuenta"), que para
 * `invalid_client` manda a perder la tarde en el lugar equivocado.
 */
describe('motivoDelRechazo()', () => {
  it('invalid_grant: es el token, y manda al guion que lo renueva', () => {
    const msg = motivoDelRechazo(400, 'invalid_grant');
    expect(msg).toContain('scripts/autorizar-drive-oauth.ts');
    // El vencimiento a los 7 días del modo «Prueba» es la causa real y
    // se repite hasta que se publique la app: si el mensaje no lo dice,
    // se reautoriza cada semana sin entender por qué.
    expect(msg).toContain('Prueba');
  });

  it('invalid_client: NO son las credenciales del token, y no manda a reautorizar', () => {
    const msg = motivoDelRechazo(401, 'invalid_client');
    expect(msg).toContain('CLIENT_ID');
    expect(msg).not.toContain('scripts/autorizar-drive-oauth.ts');
  });

  it('un motivo desconocido conserva el código de Google en vez de tragárselo', () => {
    expect(motivoDelRechazo(400, 'rate_limit_exceeded')).toContain('rate_limit_exceeded');
    expect(motivoDelRechazo(503, '')).toContain('503');
  });
});
