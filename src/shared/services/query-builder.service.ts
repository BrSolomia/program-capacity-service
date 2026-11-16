import { and, or, type SQL } from 'drizzle-orm';

type QueryClauseFactory<TClause extends SQL> = () => TClause;
type QueryOrGroupFactory<TClause extends SQL> = () => TClause[];

type DefinedQueryClauseFactory<TClause extends SQL, TValue> = (value: TValue) => TClause;
type DefinedQueryOrGroupFactory<TClause extends SQL, TValue> = (value: TValue) => TClause[];

/**
 * QueryBuilder is a small helper for assembling Drizzle SQL predicates.
 *
 * It keeps repository filters local and readable while supporting:
 * - conditional `AND` filters with `when` / `whenDefined`
 * - root-level `OR` filters with `whenOr` / `whenDefinedOr`
 * - grouped `OR` filters with `whenOrGroup` / `whenDefinedOrGroup`
 *
 * Empty clauses are omitted. The final `value()` is either a single predicate,
 * a combined `AND` / `OR` expression, or `undefined` when no filters were added.
 */
export class QueryBuilder<TClause extends SQL = SQL> {
  private readonly andClauses: SQL[] = [];
  private readonly orClauses: TClause[] = [];

  public static create<TClause extends SQL = SQL>(): QueryBuilder<TClause> {
    return new QueryBuilder<TClause>();
  }

  /**
   * Appends a clause to root `AND` unconditionally.
   *
   * Use this for predicates that always apply, avoiding a misleading `when(true, ...)`.
   */
  public apply(clauseFactory: QueryClauseFactory<TClause>): this {
    this.andClauses.push(clauseFactory());

    return this;
  }

  /**
   * Appends a clause to root `AND` when `condition` is truthy.
   */
  public when(condition: unknown, clauseFactory: QueryClauseFactory<TClause>): this {
    if (condition) {
      this.andClauses.push(clauseFactory());
    }

    return this;
  }

  /**
   * Builds and appends a clause to root `AND` when `value` is not `undefined`.
   */
  public whenDefined<TValue>(
    value: TValue | undefined,
    clauseFactory: DefinedQueryClauseFactory<TClause, TValue>,
  ): this {
    if (value !== undefined) {
      this.andClauses.push(clauseFactory(value));
    }

    return this;
  }

  /**
   * Appends a clause to root `OR` unconditionally.
   *
   * Use this for the alternative that is always on the table, avoiding a misleading `whenOr(true, ...)`.
   */
  public applyOr(clauseFactory: QueryClauseFactory<TClause>): this {
    this.orClauses.push(clauseFactory());

    return this;
  }

  /**
   * Appends a clause to root `OR` when `condition` is truthy.
   *
   * Use this for shared OR logic, for example: `email OR sub`.
   */
  public whenOr(condition: unknown, clauseFactory: QueryClauseFactory<TClause>): this {
    if (condition) {
      this.orClauses.push(clauseFactory());
    }

    return this;
  }

  /**
   * Builds and appends a clause to root `OR` when `value` is not `undefined`.
   *
   * Use this for shared OR logic, for example: `email OR sub`.
   */
  public whenDefinedOr<TValue>(
    value: TValue | undefined,
    clauseFactory: DefinedQueryClauseFactory<TClause, TValue>,
  ): this {
    if (value !== undefined) {
      this.orClauses.push(clauseFactory(value));
    }

    return this;
  }

  /**
   * Appends clauses as one OR group inside root `AND` when `condition` is truthy.
   *
   * Use this for required OR groups, for example:
   * `(firstName OR lastName) AND (locationId OR workspaceId)`.
   */
  public whenOrGroup(condition: unknown, clauseFactory: QueryOrGroupFactory<TClause>): this {
    if (condition) {
      this.appendOrGroup(clauseFactory());
    }

    return this;
  }

  /**
   * Builds and appends an OR group inside root `AND` when `value` is not `undefined`.
   */
  public whenDefinedOrGroup<TValue>(
    value: TValue | undefined,
    clauseFactory: DefinedQueryOrGroupFactory<TClause, TValue>,
  ): this {
    if (value !== undefined) {
      this.appendOrGroup(clauseFactory(value));
    }

    return this;
  }

  /**
   * Returns the built SQL condition.
   */
  public value(): SQL | undefined {
    const andClause = this.buildAndClause();
    const orClause = this.buildOrClause();

    if (andClause && orClause) {
      return and(andClause, orClause);
    }

    return andClause ?? orClause;
  }

  private buildAndClause(): SQL | undefined {
    if (this.andClauses.length === 0) {
      return;
    }

    if (this.andClauses.length === 1) {
      return this.andClauses[0];
    }

    return and(...this.andClauses);
  }

  private buildOrClause(): SQL | undefined {
    if (this.orClauses.length === 0) {
      return;
    }

    if (this.orClauses.length === 1) {
      return this.orClauses[0];
    }

    return or(...this.orClauses);
  }

  /**
   * Appends clauses as one OR group into root `AND`.
   */
  private appendOrGroup(clauses: TClause[]): void {
    if (clauses.length === 0) {
      return;
    }

    if (clauses.length === 1) {
      const [clause] = clauses;
      this.andClauses.push(clause);
      return;
    }

    const orGroup = or(...clauses);
    if (orGroup) {
      this.andClauses.push(orGroup);
    }
  }
}
