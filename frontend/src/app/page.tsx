'use client';

import Link from 'next/link';
import { Shell } from '../components/layout/shell';
import { Search, Library, Camera, Layers, TrendingUp, Package, Star, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

import { Card } from '@/components/ui/card'; // Import Card component
import { Button } from '@/components/ui/button'; // Import Button component

export default function HomePage() {
  const { user, tokens, hydrated } = useAuthStore();
  const isAuthenticated = hydrated && Boolean(tokens?.access_token && user);

  // Fetch collection stats if authenticated
  const statsQuery = useQuery({
    queryKey: ['collection-stats'],
    queryFn: () => api.collections.stats(),
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
          <Card className="p-8 text-center"> {/* Replaced div with Card */}
            <p className="text-foreground-muted">
              Your recent activity will appear here
            </p>
          </Card>
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
    <Card className={cn(`relative p-5 overflow-hidden transition-all hover:border-primary/30 card-hover-glow`, accent ? 'bg-gradient-to-br from-primary/5 to-transparent' : '')}> {/* Replaced div with Card, changed accent to primary */}
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(`w-10 h-10 rounded-lg flex items-center justify-center`, accent ? 'bg-primary/15 border border-primary/20' : 'bg-background-tertiary border border-border')}> {/* Changed accent to primary */}
          <Icon className={cn(`w-5 h-5`, accent ? 'text-primary' : 'text-foreground-muted')} />
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 skeleton rounded" />
      ) : (
        <p className={cn(`text-2xl font-bold`, accent ? 'text-gradient' : 'text-foreground')}>
          {value}
        </p>
      )}
      <p className="text-sm text-foreground-muted mt-1">{label}</p>
    </Card>
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
      className="group relative bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-all card-hover-glow overflow-hidden" // Changed accent to primary
    >
      {/* Hover gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-3 group-hover:shadow-glow transition-shadow"> {/* Changed accent to primary */}
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-foreground-muted mt-1">{description}</p>
      </div>
    </Link>
  );
}

// Landing Page for unauthenticated users
function LandingPage() {
  return (
    <div className="min-h-screen bg-mystic noise-overlay">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Animated background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-mana-gold/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 relative">
          <div className="text-center">
            {/* Logo badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8"> {/* Changed accent to primary */}
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Magic: The Gathering Collection Manager</span> {/* Changed accent to primary */}
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
              Your Magic Collection,
              <span className="text-gradient"> Organized</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto">
              Track your cards, build decks, and manage your collection with ease. 
              The ultimate tool for Magic: The Gathering collectors.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild> {/* Use Button component */}
                <Link
                  href="/register"
                  className="px-8 py-3.5 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-all shadow-glow hover:shadow-glow-lg inline-flex items-center justify-center gap-2" // Changed accent to primary
                >
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary"> {/* Use Button component */}
                <Link
                  href="/login"
                  className="px-8 py-3.5 bg-card hover:bg-card-hover border border-border hover:border-primary/30 text-foreground font-medium rounded-xl transition-all card-hover-glow" // Changed accent to primary
                >
                  Sign In
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-foreground">Everything you need</h2>
          <p className="mt-4 text-foreground-muted">
            Powerful features to help you manage your collection
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={Search}
            title="Card Search"
            description="Search through the entire Magic: The Gathering database with powerful filters and instant results."
            gradient="from-mana-blue/20 to-transparent"
          />
          <FeatureCard
            icon={Library}
            title="Collection Tracking"
            description="Keep track of every card you own, with quantity tracking and condition notes."
            gradient="from-primary/20 to-transparent" // Changed accent to primary
          />
          <FeatureCard
            icon={Camera}
            title="Card Scanning"
            description="Quickly add cards to your collection by scanning them with your phone's camera."
            gradient="from-mana-green/20 to-transparent"
          />
        </div>
        
        {/* Mana symbols decoration */}
        <div className="flex justify-center gap-6 mt-16 opacity-30">
          <div className="w-12 h-12 rounded-full bg-mana-white/20 border border-mana-white/30" />
          <div className="w-12 h-12 rounded-full bg-mana-blue/20 border border-mana-blue/30" />
          <div className="w-12 h-12 rounded-full bg-mana-black/20 border border-mana-black/30" />
          <div className="w-12 h-12 rounded-full bg-mana-red/20 border border-mana-red/30" />
          <div className="w-12 h-12 rounded-full bg-mana-green/20 border border-mana-green/30" />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 bg-background-secondary/50">
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
  description,
  gradient = "from-primary/20 to-transparent" // Changed accent to primary
}: { 
  icon: React.ElementType;
  title: string;
  description: string;
  gradient?: string;
}) {
  return (
    <Link href="#" className="group relative bg-card border border-border rounded-2xl p-6 hover:border-primary/30 transition-all card-hover-glow overflow-hidden"> {/* Changed accent to primary, wrapped in Link for consistency with QuickAction */}
      {/* Gradient background */}
      <div className={cn(`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity`)} />
      
      <div className="relative">
        <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:shadow-glow transition-shadow"> {/* Changed accent to primary */}
          <Icon className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-foreground-muted">{description}</p>
      </div>
    </Link>
  );
}
