import { FileText, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetchBlob } from '../lib/api';
import type { Message } from '../lib/types';

/** Mídia recebida do cliente. O arquivo vem pela API, que confere a permissão. */
export function MediaAttachment({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inline = ['image', 'sticker', 'audio', 'video'].includes(message.type);

  useEffect(() => {
    if (!inline) return;
    let objectUrl: string | null = null;
    apiFetchBlob(`/leads/${message.leadId}/messages/${message.id}/media`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [inline, message.id, message.leadId]);

  async function download() {
    try {
      const blob = await apiFetchBlob(`/leads/${message.leadId}/messages/${message.id}/media`);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = message.body ?? 'documento';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <ImageOff size={16} aria-hidden />
        {error}
      </p>
    );
  }

  if (message.type === 'document') {
    return (
      <button type="button" onClick={() => void download()} className="flex items-center gap-2 text-sm underline">
        <FileText size={16} aria-hidden />
        Baixar {message.body ?? 'documento'}
      </button>
    );
  }

  if (!url) return <div className="h-40 w-56 animate-pulse rounded-md bg-paper" aria-label="Carregando mídia" />;
  if (message.type === 'audio') return <audio controls src={url} className="max-w-full" />;
  if (message.type === 'video') return <video controls src={url} className="max-h-72 max-w-full rounded-md" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Imagem enviada pelo cliente" className="max-h-72 max-w-full rounded-md" />
    </a>
  );
}
