import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

export function QrCode({ value, className = '' }: { value: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b1033', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      className={`bg-white rounded-[0.5em] p-[0.4em] sticker [&_svg]:w-full [&_svg]:h-full ${className}`}
      role="img"
      aria-label={`QR code for ${value}`}
      data-qr-value={value}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
