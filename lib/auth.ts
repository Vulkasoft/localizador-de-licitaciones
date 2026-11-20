// Unified auth entry point. The canonical NextAuth configuration lives in
// `auth-options.ts`. Modules migrated from Gestión DJI import `@/lib/auth`,
// so we re-export the same `authOptions` here to keep a single source of truth.
export { authOptions } from './auth-options';
