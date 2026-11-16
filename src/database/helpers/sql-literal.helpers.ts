import { sql } from 'drizzle-orm';

/**
 * Embeds a string as a SQL literal. Interpolating it into a `sql` template would bind it
 * as a parameter, and DDL — CHECK constraints and defaults — cannot carry parameters.
 */
export function sqlStringLiteral(value: string) {
  return sql.raw(`'${value.replaceAll("'", "''")}'`);
}

/**
 * Embeds a number as a SQL literal, unquoted. Accepts `bigint` because drizzle-kit cannot
 * serialize a BigInt into its snapshot, so a bigint default has to arrive as SQL instead.
 */
export function sqlNumberLiteral(value: bigint | number) {
  return sql.raw(value.toString());
}
