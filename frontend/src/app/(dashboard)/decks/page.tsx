'use client';

import { motion } from 'framer-motion';
import { Plus, Layers, Users, Trophy } from 'lucide-react';

export default function DecksPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="elevated p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Decks
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Build and manage your decks
            </p>
          </div>
          <button className="px-4 py-2 rounded-md btn-primary flex items-center gap-2 accent-ring">
            <Plus className="h-4 w-4" />
            New Deck
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <motion.div 
          className="elevated p-4"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-text-secondary text-sm">Total Decks</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="elevated p-4"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary-variant/20">
              <Users className="h-5 w-5 text-primary-variant" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-text-secondary text-sm">Shared Decks</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="elevated p-4"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-yellow-500/20">
              <Trophy className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-text-secondary text-sm">Tournament Wins</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Coming Soon */}
      <motion.div 
        className="elevated p-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="max-w-md mx-auto space-y-4">
          <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto">
            <Layers className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Deck Management Coming Soon
            </h3>
            <p className="text-text-secondary">
              Build competitive decks, test strategies, and track your performance. 
              Full deck management features will be available in a future update.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button className="px-4 py-2 rounded-md btn-primary">
              Get Notified
            </button>
            <button className="px-4 py-2 rounded-md bg-surface-variant border border-border hover:border-border-accent transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </motion.div>

      {/* Feature Preview */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div 
          className="elevated p-6"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <h4 className="font-semibold mb-2 text-text-primary">Deck Builder</h4>
          <p className="text-text-secondary text-sm mb-4">
            Visual deck construction with mana curve analysis, format legality checking, and collection integration.
          </p>
          <div className="h-24 bg-surface-variant rounded-md flex items-center justify-center">
            <span className="text-text-muted text-sm">Preview Coming Soon</span>
          </div>
        </motion.div>

        <motion.div 
          className="elevated p-6"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <h4 className="font-semibold mb-2 text-text-primary">Match Tracking</h4>
          <p className="text-text-secondary text-sm mb-4">
            Record wins, losses, and detailed match statistics to improve your gameplay.
          </p>
          <div className="h-24 bg-surface-variant rounded-md flex items-center justify-center">
            <span className="text-text-muted text-sm">Preview Coming Soon</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}