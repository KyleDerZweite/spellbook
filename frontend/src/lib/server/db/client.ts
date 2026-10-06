// Compatibility adapter for persistence callers awaiting their feature migration.
import { application } from '#lib/server/composition.ts';
export const { db, pool } = application;
