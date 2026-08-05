/**
 * La marca AnexyPRO, en un solo lugar.
 *
 * POR QUÉ EXISTE: el logotipo estaba escrito a mano en seis archivos
 * (las tres barras laterales, la cabecera del panel master, el login y
 * su pantalla de respaldo). Cambiar la marca obligaba a encontrar y
 * editar los seis, y bastaba olvidar uno para que la aplicación
 * mostrara dos logotipos distintos.
 *
 * La marca nueva es un logotipo de texto: "Anexy" en el color del fondo
 * contrario y "PRO" en azul. No lleva el símbolo de hoja que
 * acompañaba a la versión anterior.
 *
 * SI SE QUIERE USAR EL ARCHIVO VECTORIAL EN VEZ DEL TEXTO: reemplazar
 * el contenido de `Logo` por una etiqueta <img> apuntando a
 * `/anexypro.svg` (fondo claro) y `/anexypro-blanco.svg` (fondo
 * oscuro). Es el único archivo que habría que tocar.
 */

type Tono = 'claro' | 'oscuro';

/**
 * `claro` → para fondos oscuros (barras laterales, login): "Anexy" en blanco.
 * `oscuro` → para fondos claros: "Anexy" en el color de texto de la app.
 */
export function Logo({
  tono = 'claro',
  className = 'text-lg',
}: {
  tono?: Tono;
  className?: string;
}) {
  return (
    <b
      className={`font-sans font-extrabold leading-none tracking-tight ${
        tono === 'claro' ? 'text-white' : 'text-ink'
      } ${className}`}
    >
      Anexy<span className="text-royal">PRO</span>
    </b>
  );
}
