'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import type { Card } from '../../lib/types';
import { CardTile } from './card-tile';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button'; // Import Button component
import { Card as UICard, CardContent } from '@/components/ui/card'; // Import Card component for error state
import { cn } from '@/lib/utils'; // Import cn utility

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
          className="fixed inset-0 z-50 flex items-center justify-center p-4" // p-md changed to p-4
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
            className={cn(`relative w-full max-w-6xl max-h-[90vh] bg-card border border-border rounded-2xl p-6 overflow-hidden`, className)} // glass-panel p-lg changed to bg-card border border-border rounded-2xl p-6
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="flex items-center justify-between mb-6"> {/* mb-lg changed to mb-6 */}
              <h2 className="text-2xl font-bold text-foreground"> {/* text-h2 text-text-primary changed to text-2xl font-bold text-foreground */}
                All Versions & Printings
              </h2>
              <Button
                variant="ghost" // Use Button component
                onClick={onClose}
                className="p-2 rounded-md hover:bg-card-hover transition-colors" // hover:bg-ui-bg/50 changed to hover:bg-card-hover
                aria-label="Close version selector"
              >
                <X size={20} className="text-foreground-muted" />
              </Button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-8rem)]">
              {loading && (
                <div className="flex items-center justify-center py-8"> {/* py-xl changed to py-8 */}
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div> {/* border-accent-primary changed to border-primary */}
                  <span className="ml-4 text-foreground-muted">Loading versions...</span> {/* ml-md text-text-secondary changed to ml-4 text-foreground-muted */}
                </div>
              )}

              {error && (
                <div className="text-center py-8"> {/* py-xl changed to py-8 */}
                  <UICard className="p-6 max-w-md mx-auto border border-error/20"> {/* glass-panel p-lg border border-red-500/20 changed to Card with p-6 border border-error/20 */}
                    <p className="text-error mb-4">Error Loading Versions</p> {/* text-red-500 mb-sm changed to text-error mb-4 */}
                    <p className="text-foreground-muted text-sm">{error}</p> {/* text-text-secondary changed to text-foreground-muted */}
                    <Button
                      onClick={fetchVersions}
                      className="mt-4" // mt-md px-md py-sm bg-accent-primary text-text-primary rounded-md hover:bg-accent-hover changed to mt-4
                    >
                      Retry
                    </Button>
                  </UICard>
                </div>
              )}

              {!loading && !error && versions.length === 0 && (
                <div className="text-center py-8"> {/* py-xl changed to py-8 */}
                  <p className="text-foreground-muted">No versions found</p> {/* text-text-secondary changed to text-foreground-muted */}
                </div>
              )}

              {!loading && !error && versions.length > 0 && (
                <>
                  <div className="mb-4 text-sm text-foreground-muted"> {/* mb-md text-text-secondary changed to mb-4 text-sm text-foreground-muted */}
                    Found {versions.length} version{versions.length !== 1 ? 's' : ''}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"> {/* gap-md changed to gap-4 */}
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