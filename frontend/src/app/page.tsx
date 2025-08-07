'use client';

import Link from 'next/link';
import { Shell } from '../components/layout/shell';
import { motion } from 'framer-motion';
import { Search, Library, Shield, Users, TrendingUp, Star } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

export default function HomePage() {
  const { user, tokens, hydrated } = useAuthStore();
  
  // Simple authentication check without React Query
  const isAuthenticated = hydrated && Boolean(tokens?.access_token && user);

  // Show loading while store is hydrating
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-xl p-8 text-center">
          <div className="inline-flex items-center gap-3 text-text-secondary">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    // Dashboard view for authenticated users
    return (
      <Shell>
        <div className="space-y-8">
          {/* Welcome Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary">
              Welcome back, {user.username}!
            </h1>
            <p className="text-text-secondary">
              Ready to manage your card collection?
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <motion.div 
              className="glass rounded-xl p-6 text-center"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-center mb-3">
                <Library className="text-primary" size={32} />
              </div>
              <h3 className="text-sm text-text-secondary mb-2">Total Cards</h3>
              <p className="text-3xl font-bold text-text-primary">—</p>
              <p className="text-xs text-text-muted mt-1">Loading...</p>
            </motion.div>

            <motion.div 
              className="glass rounded-xl p-6 text-center"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-center mb-3">
                <TrendingUp className="text-green-500" size={32} />
              </div>
              <h3 className="text-sm text-text-secondary mb-2">Collection Value</h3>
              <p className="text-3xl font-bold text-text-primary">—</p>
              <p className="text-xs text-text-muted mt-1">Loading...</p>
            </motion.div>

            <motion.div 
              className="glass rounded-xl p-6 text-center"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-center mb-3">
                <Star className="text-card-rare" size={32} />
              </div>
              <h3 className="text-sm text-text-secondary mb-2">Unique Cards</h3>
              <p className="text-3xl font-bold text-text-primary">—</p>
              <p className="text-xs text-text-muted mt-1">Loading...</p>
            </motion.div>
          </div>

          {/* Quick Actions */}
          <div className="glass rounded-xl p-6">
            <h2 className="text-xl font-semibold text-text-primary mb-4">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                href="/search"
                className="p-4 rounded-lg bg-primary hover:bg-primary/90 transition-colors text-center group"
              >
                <Search className="mx-auto mb-2 group-hover:scale-110 transition-transform" size={24} />
                <p className="font-medium">Search Cards</p>
                <p className="text-xs opacity-80 mt-1">Discover new cards</p>
              </Link>

              <Link
                href="/collection"
                className="p-4 rounded-lg bg-surface-variant hover:bg-surface-variant/80 border border-border hover:border-border-accent transition-all text-center group"
              >
                <Library className="mx-auto mb-2 group-hover:scale-110 transition-transform" size={24} />
                <p className="font-medium">My Collection</p>
                <p className="text-xs text-text-muted mt-1">View your cards</p>
              </Link>

              <Link
                href="/decks"
                className="p-4 rounded-lg bg-surface-variant hover:bg-surface-variant/80 border border-border hover:border-border-accent transition-all text-center group"
              >
                <Users className="mx-auto mb-2 group-hover:scale-110 transition-transform" size={24} />
                <p className="font-medium">Deck Builder</p>
                <p className="text-xs text-text-muted mt-1">Build decks</p>
              </Link>

              {user.is_admin && (
                <Link
                  href="/admin"
                  className="p-4 rounded-lg bg-primary-variant hover:bg-primary-variant/90 transition-colors text-center group"
                >
                  <Shield className="mx-auto mb-2 group-hover:scale-110 transition-transform" size={24} />
                  <p className="font-medium">Admin Panel</p>
                  <p className="text-xs opacity-80 mt-1">Manage users</p>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // Landing page for non-authenticated users
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8 max-w-4xl mx-auto">
          {/* Hero Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <h1 className="text-4xl md:text-6xl font-bold text-text-primary">
              Welcome to{' '}
              <span className="gradient-text font-bold">
                Spellbook
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
              The modern way to manage, search, and cherish your trading card collection
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link
              href="/register"
              className="px-8 py-4 bg-primary hover:bg-primary/90 rounded-lg font-semibold text-lg transition-all hover:scale-105 hover:shadow-glow"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-surface-variant border border-border hover:border-border-accent rounded-lg font-semibold text-lg transition-all hover:scale-105"
            >
              Sign In
            </Link>
          </motion.div>

          {/* Features */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid md:grid-cols-3 gap-8 mt-16"
          >
            <div className="glass rounded-2xl p-8 text-center">
              <Search className="mx-auto mb-4 text-primary" size={48} />
              <h3 className="text-xl font-semibold mb-3">Advanced Search</h3>
              <p className="text-text-secondary">
                Find cards by name, type, color, rarity, or any attribute with our powerful search engine
              </p>
            </div>

            <div className="glass rounded-2xl p-8 text-center">
              <Library className="mx-auto mb-4 text-primary" size={48} />
              <h3 className="text-xl font-semibold mb-3">Collection Management</h3>
              <p className="text-text-secondary">
                Track quantities, conditions, prices, and organize with custom tags and notes
              </p>
            </div>

            <div className="glass rounded-2xl p-8 text-center">
              <TrendingUp className="mx-auto mb-4 text-primary" size={48} />
              <h3 className="text-xl font-semibold mb-3">Value Tracking</h3>
              <p className="text-text-secondary">
                Monitor your collection's value with real-time pricing data and analytics
              </p>
            </div>
          </motion.div>

          {/* Additional Info */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="glass rounded-2xl p-8 mt-16"
          >
            <h2 className="text-2xl font-semibold mb-4">Built for Collectors</h2>
            <p className="text-text-secondary leading-relaxed">
              Spellbook is designed with collectors in mind. Whether you're managing a small personal collection 
              or thousands of cards, our platform scales with you. Dark theme, beautiful UI, and lightning-fast 
              performance make managing your collection a joy.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
