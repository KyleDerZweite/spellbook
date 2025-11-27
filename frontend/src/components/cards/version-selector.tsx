'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import type { Card } from '../../lib/types';
import { CardTile } from './card-tile';
import { X } from 'lucide-react';

interface VersionSelectorProps {
  oracleId: string;
  isOpen: boolean;
  onClose: () => void;
  onVersionSelect?: (card: Card) => void;
  className?: string;
}

export function VersionSelector({ 
  oracleId, 
  isOpen, 
  onClose, 
  onVersionSelect, 
  className = '' 
}: VersionSelectorProps) {
  const [versions, setVersions] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && oracleId) {
      fetchVersions();
    }
  }, [isOpen, oracleId]);

  const fetchVersions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const versionData = await api.cards.getVersions(oracleId);
      setVersions(versionData);
    } catch (err) {
      console.error('Failed to fetch card versions:', err);
      setError('Failed to load card versions');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionClick = (card: Card) => {
    if (onVersionSelect) {
      onVersionSelect(card);
    }
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />
          
          <motion.div
            className={`relative w-full max-w-6xl max-h-[90vh] glass-panel p-lg overflow-hidden ${className}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-h2 font-bold text-text-primary">
                All Versions & Printings
              </h2>
              <button
                onClick={onClose}
                className="p-sm rounded-md hover:bg-ui-bg/50 transition-colors"
                aria-label="Close version selector"
              >
                <X size={20} className="text-text-secondary" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-8rem)]">
              {loading && (
                <div className="flex items-center justify-center py-xl">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
                  <span className="ml-md text-text-secondary">Loading versions...</span>
                </div>
              )}

              {error && (
                <div className="text-center py-xl">
                  <div className="glass-panel p-lg max-w-md mx-auto border border-red-500/20">
                    <p className="text-red-500 mb-sm">Error Loading Versions</p>
                    <p className="text-text-secondary text-sm">{error}</p>
                    <button
                      onClick={fetchVersions}
                      className="mt-md px-md py-sm bg-accent-primary text-text-primary rounded-md hover:bg-accent-hover transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {!loading && !error && versions.length === 0 && (
                <div className="text-center py-xl">
                  <p className="text-text-secondary">No versions found</p>
                </div>
              )}

              {!loading && !error && versions.length > 0 && (
                <>
                  <div className="mb-md text-sm text-text-secondary">
                    Found {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-md">
                    {versions.map((version, index) => (
                      <motion.div
                        key={version.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                          duration: 0.3, 
                          delay: index * 0.05,
                          type: "spring",
                          stiffness: 200
                        }}
                      >
                        <CardTile
                          card={version}
                          showAddButton={false}
                          showQuantity={false}
                          onView={handleVersionClick}
                          className="cursor-pointer hover:scale-105 transition-transform"
                          showSetInfo={true}
                        />
                      </motion.div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}