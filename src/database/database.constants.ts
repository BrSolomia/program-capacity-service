/** Injection token for the database handle. */
export const DATABASE = Symbol('DATABASE');

/** Where drizzle-kit writes migrations; tests apply the very same files a deploy does. */
export const MIGRATIONS_FOLDER = './src/database/migrations';
