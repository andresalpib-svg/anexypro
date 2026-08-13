import { describe, it, expect } from 'vitest';
import {
  canReadFolder,
  canReadObject,
  canWriteFolder,
  canDeleteObject,
  type Actor,
  type FolderTarget,
} from '@/lib/storage/permissions';

const EMPRESA = 'empresa-1';
const CONDO = 'condo-1';

const carpeta = (over: Partial<FolderTarget> = {}): FolderTarget => ({
  companyId: EMPRESA,
  condominiumId: CONDO,
  personId: null,
  kind: 'seccion',
  slug: 'administracion/actas',
  allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'junta_directiva'],
  ...over,
});

const master: Actor = { role: 'master', companyId: 'otra' };
const admin: Actor = { role: 'admin_owner', companyId: EMPRESA };
const supervisor: Actor = { role: 'admin_staff', companyId: EMPRESA, assignedCondoIds: [CONDO] };
const supervisorAjeno: Actor = { role: 'admin_staff', companyId: EMPRESA, assignedCondoIds: ['otro-condo'] };
const contador: Actor = { role: 'contador', companyId: EMPRESA };
const junta: Actor = { role: 'junta_directiva', companyId: EMPRESA, isBoardMember: true };
const juntaFalsa: Actor = { role: 'junta_directiva', companyId: EMPRESA, isBoardMember: false };
const guarda: Actor = { role: 'seguridad', companyId: EMPRESA };
const laura: Actor = { role: 'condomino', companyId: EMPRESA, personId: 'persona-laura' };
const carlos: Actor = { role: 'condomino', companyId: EMPRESA, personId: 'persona-carlos' };

describe('acceso del master', () => {
  it('entra a todo, incluso a otra empresa', () => {
    expect(canReadFolder(master, carpeta({ companyId: 'empresa-9' })).allowed).toBe(true);
    expect(canWriteFolder(master, carpeta({ slug: 'respaldos', allowedRoles: ['master'] })).allowed).toBe(true);
  });
});

describe('aislamiento entre empresas administradoras', () => {
  // Es la garantía más importante del sistema multi-inquilino.
  it('un administrador NO entra a la carpeta de otra empresa', () => {
    const r = canReadFolder(admin, carpeta({ companyId: 'empresa-9' }));
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/otra empresa/);
  });
});

describe('carpeta individual del residente', () => {
  const suya = carpeta({ personId: 'persona-laura', slug: 'residentes/persona-laura', kind: 'residente', allowedRoles: [] });

  it('el residente entra a su propia carpeta', () => {
    expect(canReadFolder(laura, suya).allowed).toBe(true);
  });

  // La prueba más importante del módulo: nunca mezclar residentes.
  it('un residente NO entra a la carpeta de otro', () => {
    const r = canReadFolder(carlos, suya);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/su propia carpeta/);
  });

  it('la administración sí entra, para depositarle documentos', () => {
    expect(canReadFolder(admin, suya).allowed).toBe(true);
  });

  it('el supervisor entra solo si tiene ese condominio asignado', () => {
    expect(canReadFolder(supervisor, suya).allowed).toBe(true);
    expect(canReadFolder(supervisorAjeno, suya).allowed).toBe(false);
  });

  it('seguridad NO entra a las carpetas de residentes', () => {
    expect(canReadFolder(guarda, suya).allowed).toBe(false);
  });

  it('la junta directiva NO entra a las carpetas de residentes', () => {
    expect(canReadFolder(junta, suya).allowed).toBe(false);
  });

  it('el residente consulta pero no deposita', () => {
    expect(canReadFolder(laura, suya).allowed).toBe(true);
    expect(canWriteFolder(laura, suya).allowed).toBe(false);
  });
});

describe('alcance del supervisor', () => {
  it('solo llega a los condominios que le asignaron', () => {
    expect(canReadFolder(supervisor, carpeta()).allowed).toBe(true);
    const r = canReadFolder(supervisorAjeno, carpeta());
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/no tiene ese condominio/);
  });

  it('puede subir pero NO eliminar', () => {
    expect(canWriteFolder(supervisor, carpeta()).allowed).toBe(true);
    const r = canDeleteObject(supervisor, carpeta());
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/no eliminarlos/);
  });
});

describe('junta directiva', () => {
  it('entra a las carpetas autorizadas', () => {
    expect(canReadFolder(junta, carpeta({ slug: 'junta-directiva' })).allowed).toBe(true);
  });

  it('NO entra a una carpeta que no la incluye', () => {
    expect(canReadFolder(junta, carpeta({ allowedRoles: ['master', 'admin_owner'] })).allowed).toBe(false);
  });

  it('consulta pero no modifica', () => {
    expect(canReadFolder(junta, carpeta()).allowed).toBe(true);
    expect(canWriteFolder(junta, carpeta()).allowed).toBe(false);
  });

  it('el rol sin ser miembro real de la junta no sirve', () => {
    const r = canReadFolder(juntaFalsa, carpeta());
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/miembro de la junta/);
  });
});

describe('seguridad', () => {
  const suya = carpeta({ slug: 'seguridad/visitas', allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad'] });

  it('entra y escribe en su propia documentación', () => {
    expect(canReadFolder(guarda, suya).allowed).toBe(true);
    expect(canWriteFolder(guarda, suya).allowed).toBe(true);
  });

  it('NO escribe fuera de su ámbito', () => {
    const facturas = carpeta({ slug: 'facturas', allowedRoles: ['master', 'admin_owner', 'seguridad'] });
    expect(canWriteFolder(guarda, facturas).allowed).toBe(false);
  });
});

describe('contador', () => {
  it('escribe en la documentación financiera', () => {
    expect(canWriteFolder(contador, carpeta({ slug: 'facturas/cobros' })).allowed).toBe(true);
    expect(canWriteFolder(contador, carpeta({ slug: 'administracion/estados-de-cuenta' })).allowed).toBe(true);
  });

  it('NO escribe fuera de lo financiero', () => {
    expect(canWriteFolder(contador, carpeta({ slug: 'administracion/actas' })).allowed).toBe(false);
  });
});

describe('respaldos de plataforma', () => {
  it('solo el master los administra', () => {
    const respaldos = carpeta({ slug: 'respaldos', allowedRoles: ['master'] });
    expect(canReadFolder(admin, respaldos).allowed).toBe(false);
    expect(canWriteFolder(master, respaldos).allowed).toBe(true);
  });
});

describe('regla de fondo', () => {
  it('una carpeta sin roles autorizados no la abre nadie salvo el master', () => {
    const cerrada = carpeta({ allowedRoles: [] });
    expect(canReadFolder(admin, cerrada).allowed).toBe(false);
    expect(canReadFolder(supervisor, cerrada).allowed).toBe(false);
    expect(canReadFolder(guarda, cerrada).allowed).toBe(false);
    expect(canReadFolder(master, cerrada).allowed).toBe(true);
  });
});

describe('buzón de envíos del residente (reservas y visitas)', () => {
  const reservas = carpeta({ slug: 'seguridad/reservas', allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad'] });
  const visitas = carpeta({ slug: 'seguridad/visitas', allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad'] });

  it('el residente puede enviar el comprobante de una reserva o la foto de un visitante', () => {
    expect(canWriteFolder(laura, reservas).allowed).toBe(true);
    expect(canWriteFolder(laura, visitas).allowed).toBe(true);
  });

  it('pero sigue sin poder navegar o listar esas carpetas', () => {
    expect(canReadFolder(laura, reservas).allowed).toBe(false);
    expect(canReadFolder(laura, visitas).allowed).toBe(false);
  });

  it('ni eliminar lo que hay ahí, ni siquiera lo que él mismo envió', () => {
    expect(canDeleteObject(laura, reservas).allowed).toBe(false);
  });

  it('no cruza empresas: no envía a la carpeta de otra administradora', () => {
    const ajena = carpeta({ slug: 'seguridad/reservas', companyId: 'empresa-9' });
    expect(canWriteFolder(laura, ajena).allowed).toBe(false);
  });

  it('el buzón no se extiende a otras carpetas de administración', () => {
    expect(canWriteFolder(laura, carpeta({ slug: 'facturas' })).allowed).toBe(false);
  });
});

describe('fotos de áreas comunes ("multimedia/fotografias")', () => {
  const fotografias = carpeta({
    slug: 'multimedia/fotografias',
    allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'condomino'],
  });

  it('el residente ve la foto de la amenidad al ir a reservar', () => {
    expect(canReadFolder(laura, fotografias).allowed).toBe(true);
  });

  it('pero no puede subir ni reemplazar fotos ahí', () => {
    expect(canWriteFolder(laura, fotografias).allowed).toBe(false);
  });
});

describe('fotografía de perfil del residente ("empresa/perfiles")', () => {
  const perfiles = carpeta({
    companyId: EMPRESA,
    condominiumId: null,
    slug: 'empresa/perfiles',
    kind: 'seccion',
    allowedRoles: ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad', 'condomino'],
  });

  it('el residente ve y actualiza su propia fotografía', () => {
    expect(canReadFolder(laura, perfiles).allowed).toBe(true);
    expect(canWriteFolder(laura, perfiles).allowed).toBe(true);
  });
});

describe('lectura de un archivo dirigido a una persona (canReadObject)', () => {
  const incumplimientos = () =>
    carpeta({ slug: 'incumplimientos', allowedRoles: ['master', 'admin_owner', 'admin_staff'] });

  it('el destinatario abre SU aviso aunque la carpeta sea de la administración', () => {
    const d = canReadObject(laura, incumplimientos(), { ownerPersonId: 'persona-laura' });
    expect(d.allowed).toBe(true);
  });

  it('otro residente NO abre un aviso ajeno', () => {
    expect(canReadObject(carlos, incumplimientos(), { ownerPersonId: 'persona-laura' }).allowed).toBe(false);
  });

  it('un archivo sin destinatario sigue las reglas de la carpeta', () => {
    expect(canReadObject(laura, incumplimientos(), { ownerPersonId: null }).allowed).toBe(false);
    expect(canReadObject(admin, incumplimientos(), { ownerPersonId: null }).allowed).toBe(true);
  });

  it('la regla del destinatario no cruza empresas', () => {
    const ajena = carpeta({ slug: 'incumplimientos', companyId: 'empresa-9', allowedRoles: ['admin_owner'] });
    expect(canReadObject(laura, ajena, { ownerPersonId: 'persona-laura' }).allowed).toBe(false);
  });

  it('no amplía permisos de escritura ni de borrado', () => {
    expect(canWriteFolder(laura, incumplimientos()).allowed).toBe(false);
    expect(canDeleteObject(laura, incumplimientos()).allowed).toBe(false);
  });
});
