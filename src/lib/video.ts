/**
 * Miniatura de vista previa a partir del hipervínculo del video.
 * YouTube expone las miniaturas como imagen pública sin API key;
 * para otros proveedores no hay miniatura sin llamar a su API,
 * así que se devuelve null y la UI muestra el ícono de video.
 */
export function videoThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    let id: string | null = null;

    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0] || null;
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/'))
        id = u.pathname.split('/')[2] || null;
    }

    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  } catch {
    return null;
  }
}
