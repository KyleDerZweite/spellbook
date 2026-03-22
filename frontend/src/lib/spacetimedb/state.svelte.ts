import type { Collection, CollectionCard, UserProfile } from '$bindings/types';

class SpacetimeState {
  collections = $state<Collection[]>([]);
  collectionCards = $state<CollectionCard[]>([]);
  userProfile = $state<UserProfile | null>(null);
  connected = $state(false);
  error = $state<string | null>(null);
}

export const state = new SpacetimeState();
