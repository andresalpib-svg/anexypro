/**
 * Envío de correos transaccionales vía Resend (https://resend.com).
 *
 * Configuración (.env):
 *   RESEND_API_KEY  — API key de la cuenta de Resend de la administración.
 *   EMAIL_FROM      — remitente, p. ej. "AnexyPRO <notificaciones@anexypro.com>".
 *   APP_URL         — dirección pública desde la que se entra a la
 *                     aplicación. Es el enlace que se le manda a los
 *                     residentes en el correo de bienvenida y en el de
 *                     recuperación de contraseña, así que si apunta a
 *                     un dominio equivocado NADIE lo nota desde adentro:
 *                     el sistema funciona y los correos llevan a la
 *                     nada. Pasó: quedó apuntando a app.anexypro.com,
 *                     que no responde, mientras la plataforma vive en
 *                     api.anexypro.com. Lo vigila el Estado del Sistema.
 *
 * Anti-spam: el dominio del remitente DEBE estar verificado en Resend
 * (Domains → Add Domain → agregar los registros SPF y DKIM que Resend
 * indica en el DNS de anexypro.com, y un registro DMARC). Sin esa
 * verificación los correos salen de un dominio compartido y los
 * filtros de spam los castigan. Con SPF+DKIM+DMARC alineados, la
 * entregabilidad es la normal de un proveedor transaccional.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function appUrl(): string {
  return process.env.APP_URL || 'https://api.anexypro.com';
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      'El envío de correos no está configurado: falta RESEND_API_KEY y/o EMAIL_FROM en el archivo .env.'
    );
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [input.to], subject: input.subject, html: input.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`El proveedor de correo rechazó el envío (${res.status}): ${body.slice(0, 300)}`);
  }
}

export function welcomeEmailHtml(input: {
  fullName: string;
  email: string;
  password: string;
  condominiumName: string;
}): string {
  const url = appUrl();
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e2a3a">
    <div style="margin-bottom:20px"><b style="font-size:18px">Anexy<span style="color:#3b6ef5">PRO</span></b></div>
    <h2 style="margin:0 0 8px;font-size:20px">Bienvenido(a), ${input.fullName}</h2>
    <p style="margin:0 0 16px;line-height:1.5">
      La administración de <b>${input.condominiumName}</b> te creó una cuenta en el
      Ecosistema Condómino de ANEXYpro: tu estado de cuenta, reservas de áreas
      comunes, comunicados y más, en un solo lugar.
    </p>
    <div style="background:#f4f6fb;border-radius:10px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 6px"><b>Usuario:</b> ${input.email}</p>
      <p style="margin:0"><b>Contraseña temporal:</b> <code style="font-size:15px">${input.password}</code></p>
    </div>
    <p style="margin:0 0 20px;line-height:1.5">
      Ingresa en <a href="${url}" style="color:#3b6ef5;font-weight:600">${url.replace(/^https?:\/\//, '')}</a>
      y cambia tu contraseña después del primer acceso.
    </p>
    <a href="${url}" style="display:inline-block;background:#3b6ef5;color:#fff;text-decoration:none;font-weight:600;border-radius:10px;padding:12px 22px">Ir a mi portal</a>
    <p style="margin:24px 0 0;font-size:12px;color:#8a94a6">
      Si no esperabas este correo, ignóralo o contacta a la administración de tu condominio.
    </p>
  </div>`;
}

/**
 * Estado de cuenta de UNA filial, enviado por administración/supervisión
 * desde el módulo "Estados de Cuenta". El correo lleva la foto
 * financiera completa (no un enlace) porque el destinatario puede no
 * tener cuenta en el portal todavía — igual que la notificación de
 * incumplimientos (`violations.ts`).
 */
export function accountStatementEmailHtml(input: {
  condominiumName: string;
  propertyCode: string;
  currency: string;
  snapshot: { charged: number; paid: number; balance: number; overdueCount: number; overdueAmount: number; isCurrent: boolean };
  movements: { date: string; desc: string; charge: number; credit: number }[];
}): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: input.currency, maximumFractionDigits: 2 }).format(n);

  let running = 0;
  const rows = input.movements
    .map((m) => {
      running += m.charge - m.credit;
      return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eef0f4;color:#5b6472">${m.date}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef0f4;color:#1e2a3a">${m.desc}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef0f4;text-align:right;color:#1e2a3a">${m.charge > 0 ? fmt(m.charge) : ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef0f4;text-align:right;color:#1d9a6c">${m.credit > 0 ? fmt(m.credit) : ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eef0f4;text-align:right;font-weight:600;color:#1e2a3a">${fmt(running)}</td>
      </tr>`;
    })
    .join('');

  const estadoColor = input.snapshot.isCurrent ? '#1d9a6c' : '#d1453b';
  const estadoTexto = input.snapshot.isCurrent ? 'AL DÍA' : 'EN ATRASO';

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1e2a3a">
    <div style="margin-bottom:20px"><b style="font-size:18px">Anexy<span style="color:#3b6ef5">PRO</span></b></div>
    <h2 style="margin:0 0 4px;font-size:20px">Estado de cuenta</h2>
    <p style="margin:0 0 16px;color:#5b6472">${input.propertyCode} · ${input.condominiumName}</p>

    <div style="background:#f4f6fb;border-radius:10px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 6px">
        Situación:
        <b style="color:${estadoColor}">${estadoTexto}</b>
        ${!input.snapshot.isCurrent ? ` — ${input.snapshot.overdueCount} cobro(s) vencido(s) por ${fmt(input.snapshot.overdueAmount)}` : ''}
      </p>
      <p style="margin:0 0 4px"><b>Monto cobrado:</b> ${fmt(input.snapshot.charged)}</p>
      <p style="margin:0 0 4px"><b>Monto pagado:</b> ${fmt(input.snapshot.paid)}</p>
      <p style="margin:0"><b>Saldo actual:</b> <span style="color:${input.snapshot.balance > 0 ? '#d1453b' : '#1d9a6c'}">${fmt(input.snapshot.balance)}</span></p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="text-align:left;color:#8a94a6;text-transform:uppercase;font-size:11px">
          <th style="padding:6px 8px">Fecha</th>
          <th style="padding:6px 8px">Descripción</th>
          <th style="padding:6px 8px;text-align:right">Cobro</th>
          <th style="padding:6px 8px;text-align:right">Pago</th>
          <th style="padding:6px 8px;text-align:right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="padding:16px 8px;color:#8a94a6;text-align:center">Sin movimientos todavía.</td></tr>'}
      </tbody>
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#8a94a6">
      Este estado de cuenta corresponde únicamente a la filial ${input.propertyCode} de ${input.condominiumName}.
      Ante cualquier duda, contacte a la administración de su condominio.
    </p>
  </div>`;
}
