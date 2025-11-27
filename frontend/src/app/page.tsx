'use client';

import Link from 'next/link';
import { Shell } from '../components/layout/shell';
import { motion } from 'framer-motion';
import { Search, Library, Shield, Users, TrendingUp, Star } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

export default function HomePage() {
  const { user, tokens, hydrated } = useAuthStore();
  
  const isAuthenticated = hydrated && Boolean(tokens?.access_token && user);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel p-lg text-center">
          <div className="inline-flex items-center gap-3 text-text-secondary">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent-primary"></div>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <Shell>
        <div className="space-y-xl">
          <div className="text-center space-y-sm">
            <h1 className="text-h1 font-bold text-text-primary">
              Welcome back, {user.username}!
            </h1>
            <p className="text-body text-text-secondary">
              Ready to manage your card collection?
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-md">
            <motion.div 
              className="glass-panel p-lg text-center"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-center mb-sm">
                <Library className="text-accent-primary" size={32} />
              </div>
              <h3 className="text-small text-text-secondary mb-xs">Total Cards</h3>
              <p className="text-h3 font-bold text-text-primary">—</p>
              <p className="text-small text-text-secondary mt-xs">Loading...</p>
            </motion.div>

            <motion.div 
              className="glass-panel p-lg text-center"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-center mb-sm">
                <TrendingUp className="text-green-500" size={32} />
              </div>
              <h3 className="text-small text-text-secondary mb-xs">Collection Value</h3>
              <p className="text-h3 font-bold text-text-primary">—</p>
              <p className="text-small text-text-secondary mt-xs">Loading...</p>
            </motion.div>

            <motion.div 
              className="glass-panel p-lg text-center"
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="flex items-center justify-center mb-sm">
                <Star className="text-yellow-500" size={32} />
              </div>
              <h3 className="text-small text-text-secondary mb-xs">Unique Cards</h3>
              <p className="text-h3 font-bold text-text-primary">—</p>
              <p className="text-small text-text-secondary mt-xs">Loading...</p>
            </motion.div>
          </div>

          <div className="glass-panel p-lg">
            <h2 className="text-h2 font-semibold text-text-primary mb-md">Quick Actions</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-md">
              <Link
                href="/search"
                className="p-md rounded-md bg-accent-primary hover:bg-accent-hover transition-colors text-center group"
              >
                <Search className="mx-auto mb-sm group-hover:scale-110 transition-transform" size={24} />
                <p className="font-medium">Search Cards</p>
                <p className="text-small opacity-80 mt-xs">Discover new cards</p>
              </Link>

              <Link
                href="/collection"
                className="p-md rounded-md bg-ui-bg hover:bg-ui-bg/80 border border-border hover:border-focus-border transition-all text-center group"
              >
                <Library className="mx-auto mb-sm group-hover:scale-110 transition-transform" size={24} />
                <p className="font-medium">My Collection</p>
                <p className="text-small text-text-secondary mt-xs">View your cards</p>
              </Link>

              <Link
                href="/decks"
                className="p-md rounded-md bg-ui-bg hover:bg-ui-bg/80 border border-border hover:border-focus-border transition-all text-center group"
              >
                <Users className="mx-auto mb-sm group-hover:scale-110 transition-transform" size={24} />
                <p className="font-medium">Deck Builder</p>
                <p className="text-small text-text-secondary mt-xs">Build decks</p>
              </Link>

              {user.is_admin && (
                <Link
                  href="/admin"
                  className="p-md rounded-md bg-accent-primary hover:bg-accent-hover transition-colors text-center group"
                >
                  <Shield className="mx-auto mb-sm group-hover:scale-110 transition-transform" size={24} />
                  <p className="font-medium">Admin Panel</p>
                  <p className="text-small opacity-80 mt-xs">Manage users</p>
                </Link>
              )}
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-md py-xl">
        <div className="text-center space-y-xl max-w-4xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-md"
          >
            <h1 className="text-h1 font-bold text-text-primary">
              Welcome to{' '}
              <span className="text-accent-primary font-bold">
                Spellbook
              </span>
            </h1>
            <p className="text-h3 text-text-secondary max-w-2xl mx-auto leading-body">
              The modern way to manage, search, and cherish your trading card collection
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-md justify-center items-center"
          >
            <Link
              href="/register"
              className="px-lg py-md bg-accent-primary hover:bg-accent-hover rounded-md font-semibold text-lg transition-all hover:scale-105"
            >
              Get Started Free
            </Link>
            <Link
              href="/login"
              className="px-lg py-md bg-ui-bg border border-border hover:border-focus-border rounded-md font-semibold text-lg transition-all hover:scale-105"
            >
              Sign In
            </Link>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid md:grid-cols-3 gap-lg mt-xl"
          >
            <div className="glass-panel p-lg text-center">
              <Search className="mx-auto mb-md text-accent-primary" size={48} />
              <h3 className="text-h3 font-semibold mb-sm">Advanced Search</h3>
              <p className="text-text-secondary">
                Find cards by name, type, color, rarity, or any attribute with our powerful search engine
              </p>
            </div>

            <div className="glass-panel p-lg text-center">
              <Library className="mx-auto mb-md text-accent-primary" size={48} />
              <h3 className="text-h3 font-semibold mb-sm">Collection Management</h3>
              <p className="text-text-secondary">
                Track quantities, conditions, prices, and organize with custom tags and notes
              </p>
            </div>

            <div className="glass-panel p-lg text-center">
              <TrendingUp className="mx-auto mb-md text-accent-primary" size={48} />
              <h3 className="text-h3 font-semibold mb-sm">Value Tracking</h3>
              <p className="text-text-secondary">
                Monitor your collection's value with real-time pricing data and analytics
              </p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="glass-panel p-lg mt-xl"
          >
            <h2 className="text-h2 font-semibold mb-md">Built for Collectors</h2>
            <p className="text-text-secondary leading-body">
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