import { Paperclip, FileText } from 'lucide-react';

export type CommAttachment = { id: string; fileName: string; fileUrl: string; kind: string };

/**
 * Adjuntos de un comunicado.
 *
 * `layout="side"` coloca las imágenes en una columna a la derecha del
 * texto, para que el comunicado no crezca hacia abajo — es el que usa
 * el portal del residente. `layout="stack"` los apila debajo.
 */
export function CommAttachments({
  attachments,
  layout = 'stack',
}: {
  attachments: CommAttachment[];
  layout?: 'stack' | 'side';
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === 'imagen');
  const videos = attachments.filter((a) => a.kind === 'video');
  const docs = attachments.filter((a) => a.kind === 'documento');

  if (layout === 'side') {
    return (
      <div className="flex w-24 flex-none flex-col gap-2">
        {images.map((a) => (
          <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" title={a.fileName}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              loading="lazy"
              decoding="async"
              src={a.fileUrl}
              alt={a.fileName}
              className="w-full rounded-lg border border-line object-cover transition hover:opacity-90"
            />
          </a>
        ))}
        {videos.map((a) => (
          <video key={a.id} src={a.fileUrl} controls preload="metadata" className="w-full rounded-lg border border-line bg-black" />
        ))}
        {docs.map((a) => (
          <a
            key={a.id}
            href={a.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 truncate text-xs font-medium text-royal hover:underline"
          >
            <FileText size={13} className="flex-none" /> <span className="truncate">{a.fileName}</span>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" title={a.fileName}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy" decoding="async" src={a.fileUrl} alt={a.fileName} className="h-28 w-40 rounded-lg border border-line object-cover" />
            </a>
          ))}
        </div>
      )}
      {videos.map((a) => (
        <video key={a.id} src={a.fileUrl} controls preload="metadata" className="max-h-72 w-full rounded-lg border border-line bg-black" />
      ))}
      {docs.length > 0 && (
        <ul className="space-y-1">
          {docs.map((a) => (
            <li key={a.id}>
              <a
                href={a.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-royal hover:underline"
              >
                <FileText size={14} /> {a.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-1 text-xs text-muted">
        <Paperclip size={11} /> {attachments.length} adjunto(s)
      </p>
    </div>
  );
}
