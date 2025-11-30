'use client';

import { motion } from 'framer-motion';
import { Plus, Layers, Users, Trophy } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DecksPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Decks
            </CardTitle>
            <p className="text-foreground-muted text-sm mt-1">
              Build and manage your decks
            </p>
          </div>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Deck
          </Button>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <motion.div 
          className="p-4 bg-card border border-border rounded-xl"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/20">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-foreground-muted text-sm">Total Decks</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="p-4 bg-card border border-border rounded-xl"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-mana-gold/20">
              <Users className="h-5 w-5 text-mana-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-foreground-muted text-sm">Shared Decks</p>
            </div>
          </div>
        </motion.div>

        <motion.div 
          className="p-4 bg-card border border-border rounded-xl"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-warning/20">
              <Trophy className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">0</p>
              <p className="text-foreground-muted text-sm">Tournament Wins</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Coming Soon */}
      <motion.div 
        className="p-8 text-center bg-card border border-border rounded-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="max-w-md mx-auto space-y-4">
          <div className="p-4 rounded-full bg-primary/10 w-fit mx-auto">
            <Layers className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold mb-2">
              Deck Management Coming Soon
            </CardTitle>
            <p className="text-foreground-muted">
              Build competitive decks, test strategies, and track your performance. 
              Full deck management features will be available in a future update.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button>
              Get Notified
            </Button>
            <Button variant="secondary" className="border border-border hover:border-accent/30">
              Learn More
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Feature Preview */}
      <div className="grid md:grid-cols-2 gap-6">
        <motion.div 
          className="p-6 bg-card border border-border rounded-xl"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <CardTitle className="font-semibold mb-2 text-foreground">Deck Builder</CardTitle>
          <p className="text-foreground-muted text-sm mb-4">
            Visual deck construction with mana curve analysis, format legality checking, and collection integration.
          </p>
          <div className="h-24 bg-background-tertiary rounded-md flex items-center justify-center">
            <span className="text-foreground-muted text-sm">Preview Coming Soon</span>
          </div>
        </motion.div>

        <motion.div 
          className="p-6 bg-card border border-border rounded-xl"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <CardTitle className="font-semibold mb-2 text-foreground">Match Tracking</CardTitle>
          <p className="text-foreground-muted text-sm mb-4">
            Record wins, losses, and detailed match statistics to improve your gameplay.
          </p>
          <div className="h-24 bg-background-tertiary rounded-md flex items-center justify-center">
            <span className="text-foreground-muted text-sm">Preview Coming Soon</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}