'use client';

import React, { useState } from 'react';

export interface ImageWithFallbackProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallbackText?: string;
  fallbackIcon?: React.ReactNode;
}

export function ImageWithFallback({
  src,
  alt = '',
  className = '',
  fallbackText,
  fallbackIcon,
  ...props
}: ImageWithFallbackProps) {
  const [prevSrc, setPrevSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  // React 19 pattern: reset error state during render when src changes
  if (prevSrc !== src) {
    setPrevSrc(src);
    setHasError(false);
  }

  if (!src || hasError) {
    const initials =
      fallbackText ||
      (alt
        ? alt
            .split(' ')
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase()
        : '?');

    return (
      <div
        className={`bg-[#0d1b4b] text-white flex items-center justify-center font-black select-none ${className}`}
        role="img"
        aria-label={alt || 'Image placeholder'}
      >
        {fallbackIcon || <span>{initials}</span>}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}
