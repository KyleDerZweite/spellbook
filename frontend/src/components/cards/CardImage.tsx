'use client';

import { Card } from '@/types/card';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface CardImageProps {
  card: Card;
  onClick?: () => void;
  className?: string;
}

export function CardImage({ card, onClick, className }: CardImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg bg-card cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg',
        className
      )}
      onClick={onClick}
    >
      <div className="aspect-[3/4] relative">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 skeleton rounded-lg" />
        )}
        
        {imageError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-card text-muted-foreground">
            <div className="text-center p-4">
              <div className="text-2xl mb-2">🃏</div>
              <div className="text-sm font-medium">{card.name}</div>
              <div className="text-xs mt-1">{card.type_line}</div>
            </div>
          </div>
        ) : (
          <img
            src={card.image_uris?.normal || card.image_uris?.small || '/placeholder-card.png'}
            alt={card.name}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-opacity duration-200',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
      </div>
      
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
        <div className="p-3 text-white">
          <div className="font-medium text-sm mb-1">{card.name}</div>
          <div className="text-xs text-gray-300">{card.type_line}</div>
        </div>
      </div>
    </div>
  );
}