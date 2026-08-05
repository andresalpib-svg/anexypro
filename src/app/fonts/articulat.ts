import localFont from 'next/font/local';

/**
 * Articulat CF — la tipografía de la marca AnexyPRO.
 *
 * Reemplaza a Geist, que era la elección provisional mientras no había
 * tipografía definida.
 *
 * QUÉ SE INCLUYE Y POR QUÉ: solo los cinco pesos que la aplicación usa
 * de verdad (400 normal, 500 medium, 600 semibold, 700 bold, 800
 * extrabold). La familia trae diecisiete pesos más sus oblicuas; cargar
 * todo serían 675 KB que el navegador descarga y nunca dibuja. Estos
 * cinco pesan 176 KB en total.
 *
 * NO SE INCLUYEN LAS OBLICUAS: ninguna pantalla usa `italic`. Si algún
 * día se usa, el navegador la sintetiza inclinando el peso recto —
 * aceptable— y si se quiere la real, se agregan aquí los archivos
 * `*Oblique` con `style: 'italic'`.
 *
 * LOS .ttf SE CONVIRTIERON A .woff2: mismo dibujo, un cuarto del peso.
 * Los originales del zip quedan fuera del repositorio.
 *
 * OJO CON EL SÍMBOLO DE COLÓN (₡): Articulat CF **no lo trae**. El
 * navegador lo dibuja con la siguiente familia de la lista de respaldo,
 * así que se ve pero con un trazo distinto al resto del monto. No es un
 * error de configuración: es la cobertura de la tipografía.
 */
export const articulat = localFont({
  src: [
    { path: './ArticulatCF-Normal.woff2', weight: '400', style: 'normal' },
    { path: './ArticulatCF-Medium.woff2', weight: '500', style: 'normal' },
    { path: './ArticulatCF-DemiBold.woff2', weight: '600', style: 'normal' },
    { path: './ArticulatCF-Bold.woff2', weight: '700', style: 'normal' },
    { path: './ArticulatCF-ExtraBold.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-articulat',
  display: 'swap',
  // Ajusta las métricas de la fuente de respaldo a las de Articulat para
  // que el texto no salte de tamaño cuando termina de cargar.
  adjustFontFallback: 'Arial',
});
