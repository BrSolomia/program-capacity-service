import { isObject } from './type-guard.helpers.js';

/** One entry of what a schema refused, as the pipe and the message parsers both report it. */
export type SchemaIssue = {
  path: string;
  message: string;
};

/** What a standard schema reports: a message, and a path whose segments may be keys or wrappers. */
type ReportedIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
};

const PATH_SEPARATOR = '.';

export function toSchemaIssues(issues: readonly ReportedIssue[]): SchemaIssue[] {
  return issues.map((issue) => ({
    path: (issue.path ?? []).map(toPathSegment).join(PATH_SEPARATOR),
    message: issue.message,
  }));
}

function toPathSegment(segment: PropertyKey | { readonly key: PropertyKey }): string {
  return String(isObject(segment) ? segment.key : segment);
}

/** An issue with the payload as a whole, which has no field to point at. */
export function toPayloadIssues(message: string): SchemaIssue[] {
  return [{ path: '', message }];
}
