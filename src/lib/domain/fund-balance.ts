/**
 * Saldo de un fondo (Etapa 5 — Fondos, reservas e inversiones).
 *
 * Un fondo mezcla 3 estados del mismo dinero: lo que está libre
 * (operativo), lo que ya está apartado para un fin conocido pero
 * todavía no se gastó (comprometido), y lo que salió a una inversión
 * (invertido). Ninguno de los tres es una cifra independiente — son
 * una RECLASIFICACIÓN del mismo total, no una creación ni destrucción
 * de dinero: comprometer o invertir no cambia cuánto vale el fondo en
 * total, solo cuánto de ese total sigue disponible para gastar hoy
 * mismo.
 */

import { round2 } from './late-interest';

export type FundMovementType = 'aporte' | 'uso' | 'compromiso' | 'liberacion' | 'inversion' | 'retorno';

export type FundMovementInput = {
  movType: FundMovementType;
  amount: number;
};

export type FundBalance = {
  /** Dinero libre, sin comprometer ni invertir — lo que se puede gastar hoy. */
  operativo: number;
  /** Apartado para un fin conocido (compromiso − liberación). */
  comprometido: number;
  /** Colocado en una inversión activa (inversión − retorno). */
  invertido: number;
  /** aporte − uso. Es el valor total del fondo; los otros 3 campos son una reclasificación de este mismo número. */
  total: number;
};

export function buildFundBalance(movements: FundMovementInput[]): FundBalance {
  let aporte = 0;
  let uso = 0;
  let compromiso = 0;
  let liberacion = 0;
  let inversion = 0;
  let retorno = 0;

  for (const m of movements) {
    switch (m.movType) {
      case 'aporte':
        aporte += m.amount;
        break;
      case 'uso':
        uso += m.amount;
        break;
      case 'compromiso':
        compromiso += m.amount;
        break;
      case 'liberacion':
        liberacion += m.amount;
        break;
      case 'inversion':
        inversion += m.amount;
        break;
      case 'retorno':
        retorno += m.amount;
        break;
    }
  }

  const total = round2(aporte - uso);
  const comprometidoNeto = round2(compromiso - liberacion);
  const invertidoNeto = round2(inversion - retorno);
  const operativo = round2(total - comprometidoNeto - invertidoNeto);

  return { operativo, comprometido: comprometidoNeto, invertido: invertidoNeto, total };
}
