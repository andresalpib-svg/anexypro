'use client';

import { useState } from 'react';
import { PlayCircle, ExternalLink } from 'lucide-react';
import { videoThumbnail } from '@/lib/video';

/** ID de YouTube a partir de cualquier forma de su URL. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reproduce el video DENTRO de ANEXYpro (iframe de YouTube), sin sacar
 * al residente del sistema. El hipervínculo original se conserva como
 * enlace secundario "Ver en YouTube". El iframe solo se monta al hacer
 * clic — así la lista carga liviana y no se rastrea al usuario hasta
 * que decide reproducir.
 */
export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(url);
  const thumb = videoThumbnail(url);

  if (!id) {
    // Proveedor no embebible: se ofrece el enlace tal cual.
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
      >
        <PlayCircle size={15} /> Ver video
      </a>
    );
  }

  return (
    <div className="w-full max-w-xs">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 h-full w-full"
            aria-label={`Reproducir ${title}`}
          >
            {thumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={thumb} alt="" className="h-full w-full object-cover" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/40">
              <PlayCircle className="text-white drop-shadow-lg" size={40} />
            </span>
          </button>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-royal hover:underline"
      >
        <ExternalLink size={11} /> Ver en YouTube
      </a>
    </div>
  );
}
