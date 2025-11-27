'use client';

import Link from 'next/link';
import { Shell } from '../components/layout/shell';
import { Search, Library, Camera, Layers, TrendingUp, Package, Star, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function HomePage() {
  const { user, tokens, hydrated } = useAuthStore();
  const isAuthenticated = hydrated && Boolean(tokens?.access_token && user);

  // Fetch collection stats if authenticated
  const statsQuery = useQuery({
    queryKey: ['collection-stats'],
    queryFn: async () => {
      const collections = await api.collections.list();
      if (collections.length > 0) {
        return api.collections.getStats(collections[0].id);
      }
      return null;
    },
    enabled: isAuthenticated,
  });

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-foreground-muted">
          <Loader2 className="w-5 h-5 spinner" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const stats = statsQuery.data;

  return (
    <Shell>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome back, {user?.username}!
          </h1>
          <p className="text-foreground-muted mt-1">
            Here's an overview of your collection
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Package}
            label="Total Cards"
            value={stats?.total_cards?.toLocaleString() ?? '—'}
            loading={statsQuery.isLoading}
          />
          <StatCard
            icon={Star}
            label="Unique Cards"
            value={stats?.unique_cards?.toLocaleString() ?? '—'}
            loading={statsQuery.isLoading}
          />
          <StatCard
            icon={TrendingUp}
            label="Est. Value"
            value={stats?.total_value ? `$${stats.total_value.toFixed(2)}` : '—'}
            loading={statsQuery.isLoading}
            accent
          />
          <StatCard
            icon={Layers}
            label="Decks"
            value="0"
            loading={false}
          />
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickAction
              href="/search"
              icon={Search}
              title="Search Cards"
              description="Find cards in the database"
            />
            <QuickAction
              href="/collection"
              icon={Library}
              title="My Collection"
              description="View and manage your cards"
            />
            <QuickAction
              href="/scans"
              icon={Camera}
              title="Scan Cards"
              description="Add cards by scanning"
            />
            <QuickAction
              href="/decks"
              icon={Layers}
              title="Build Decks"
              description="Create and edit decks"
            />
          </div>
        </div>

        {/* Recent Activity Placeholder */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-foreground-muted">
              Your recent activity will appear here
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// Stat Card Component
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  loading,
  accent 
}: { 
  icon: React.ElementType;
  label: string;
  value: string;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ? 'bg-accent/10' : 'bg-background-tertiary'}`}>
          <Icon className={`w-5 h-5 ${accent ? 'text-accent' : 'text-foreground-muted'}`} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 skeleton rounded" />
      ) : (
        <p className={`text-2xl font-bold ${accent ? 'text-accent' : 'text-foreground'}`}>
          {value}
        </p>
      )}
      <p className="text-sm text-foreground-muted mt-1">{label}</p>
    </div>
  );
}

// Quick Action Component
function QuickAction({ 
  href, 
  icon: Icon, 
  title, 
  description 
}: { 
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-card border border-border rounded-xl p-5 hover:border-accent/50 hover:bg-card-hover transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <ArrowRight className="w-4 h-4 text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-sm text-foreground-muted mt-1">{description}</p>
    </Link>
  );
}

// Landing Page for unauthenticated users
function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
              Your Magic Collection,
              <span className="text-accent"> Organized</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto">
              Track your cards, build decks, and manage your collection with ease. 
              The ultimate tool for Magic: The Gathering collectors.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="px-8 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="px-8 py-3 bg-background-tertiary hover:bg-card-hover border border-border text-foreground font-medium rounded-lg transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-foreground">Everything you need</h2>
          <p className="mt-4 text-foreground-muted">
            Powerful features to help you manage your collection
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={Search}
            title="Card Search"
            description="Search through the entire Magic: The Gathering database with powerful filters and instant results."
          />
          <FeatureCard
            icon={Library}
            title="Collection Tracking"
            description="Keep track of every card you own, with quantity tracking and condition notes."
          />
          <FeatureCard
            icon={Camera}
            title="Card Scanning"
            description="Quickly add cards to your collection by scanning them with your phone's camera."
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-foreground-muted text-sm">
            © 2025 Spellbook. Built with ❤️ for card collectors.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Feature Card Component
function FeatureCard({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-accent" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-foreground-muted">{description}</p>
    </div>
  );
}
