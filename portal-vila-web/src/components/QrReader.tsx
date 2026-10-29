import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

/** A Pix QR code carries a "copia e cola" code (EMV), which always starts like this. */
export function isPixCode(text: string) {
  return text.trim().startsWith('000201');
}

function decode(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  return jsQR(pixels.data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/**
 * The text of the QR code in a picture (a photo of the card machine, a screenshot of the store's page), or null. A big
 * photo is tried smaller first, which reads faster and often better, then at its own size.
 */
export async function readQrFromFile(file: File): Promise<string | null> {
  const address = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = address;
    await image.decode();
    const canvas = document.createElement('canvas');
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    for (const size of [1000, 1600, longest]) {
      const scale = Math.min(1, size / longest);
      const found = decode(image, Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale), canvas);
      if (found) return found;
      if (scale === 1) break;
    }
    return null;
  } finally {
    URL.revokeObjectURL(address);
  }
}

/**
 * The phone's back camera, reading a QR code a few times a second until it finds one. The camera is let go as soon as
 * a code is read or the reader closes. Opening it needs the person's permission and a secure page (https).
 */
export function QrCamera({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const result = useRef(onResult);
  result.current = onResult;
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador não abre a câmera. Use uma foto do QR Code.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (reason) {
        const denied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError');
        setError(
          denied
            ? 'O navegador não deixou abrir a câmera. Permita o acesso à câmera para este site e tente de novo, ou use uma foto do QR Code.'
            : 'Não consegui abrir a câmera. Use uma foto do QR Code.'
        );
        return;
      }
      const element = video.current;
      if (stopped || !element) {
        stop();
        return;
      }
      element.srcObject = stream;
      await element.play().catch(() => undefined);
      setReady(true);
      let last = 0;
      const tick = (time: number) => {
        if (stopped) return;
        if (time - last > 250 && element.readyState >= 2 && element.videoWidth > 0) {
          last = time;
          const scale = Math.min(1, 720 / Math.max(element.videoWidth, element.videoHeight));
          const found = decode(element, Math.round(element.videoWidth * scale), Math.round(element.videoHeight * scale), canvas);
          if (found) {
            stop();
            result.current(found);
            return;
          }
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    start();
    return stop;
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          {error}
        </p>
      ) : (
        <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-ink">
          <video ref={video} playsInline muted className="size-full object-cover" aria-label="Imagem da câmera" />
          <div aria-hidden className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-white/80" />
          {!ready && (
            <p className="absolute inset-0 grid place-items-center text-sm text-white/80">
              <span className="flex items-center gap-2">
                <Camera aria-hidden className="size-4" /> Abrindo a câmera…
              </span>
            </p>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{error ? '' : 'Aponte para o QR Code do Pix, sem reflexo. Ele é lido sozinho.'}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X aria-hidden className="size-4" />
          Fechar a câmera
        </Button>
      </div>
    </div>
  );
}
