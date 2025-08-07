'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import type { Card } from '../../lib/types';
import { CardTile } from './card-tile';

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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />
          
          {/* Modal Content */}
          <motion.div
            className={`relative w-full max-w-6xl max-h-[90vh] glass rounded-xl p-6 overflow-hidden ${className}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                All Versions & Printings
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-surface-variant transition-colors"
                aria-label="Close version selector"
              >
                <svg 
                  className="w-5 h-5 text-text-secondary" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-8rem)]">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="ml-3 text-text-secondary">Loading versions...</span>
                </div>
              )}

              {error && (
                <div className="text-center py-12">
                  <div className="glass rounded-xl p-6 max-w-md mx-auto border border-error/20">
                    <p className="text-error mb-2">Error Loading Versions</p>
                    <p className="text-text-muted text-sm">{error}</p>
                    <button
                      onClick={fetchVersions}
                      className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {!loading && !error && versions.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-text-secondary">No versions found</p>
                </div>
              )}

              {!loading && !error && versions.length > 0 && (
                <>
                  <div className="mb-4 text-sm text-text-secondary">
                    Found {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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