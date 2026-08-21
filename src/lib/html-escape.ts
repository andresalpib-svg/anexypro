/**
 * Escapa texto para insertarlo dentro de HTML armado a mano con
 * template strings — los correos de `src/lib/email.ts`,
 * `src/lib/services/password-reset.ts` y `src/lib/services/violations.ts`.
 *
 * POR QUÉ EXISTE: esos correos interpolan directo nombres de persona,
 * de condominio, códigos de filial — texto que en última instancia
 * escribió alguien (un residente al darse de alta, un administrador al
 * nombrar un condominio, un importador de Excel). Sin escapar, un
 * nombre como `<img src=x onerror=...>` viaja tal cual dentro del
 * `<body>` del correo. La mayoría de los clientes de correo filtran
 * `<script>`, pero no todos filtran cada etiqueta — y de todas formas
 * un enlace o botón falso inyectado ahí (phishing dentro de un correo
 * legítimo de ANEXYpro) no necesita JavaScript para funcionar.
 *
 * Nota: React ya escapa esto solo en toda la interfaz — este archivo
 * hace falta ÚNICAMENTE donde el HTML se arma a mano fuera de JSX,
 * como en los correos.
 */
export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
