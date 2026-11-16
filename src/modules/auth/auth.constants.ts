/** Injection token for the clients' secret hashes, keyed by client id. */
export const API_CLIENT_SECRET_HASHES = Symbol('API_CLIENT_SECRET_HASHES');

/** Scheme the credentials arrive under, so `curl -u id:secret` works unchanged. */
export const BASIC_SCHEME_PREFIX = 'Basic ';

/** Separates the id from the secret inside the decoded credentials. */
export const CREDENTIALS_SEPARATOR = ':';

/** How the stored digest is written in the environment. */
export const SECRET_DIGEST_ENCODING = 'hex';

/** How the credentials travel in the header, and what they decode to. */
export const CREDENTIALS_ENCODING = 'base64';
export const CREDENTIALS_TEXT_ENCODING = 'utf8';

/** Digest the stored hash is taken with, and its length, which the comparison relies on. */
export const SECRET_DIGEST = 'sha256';
export const SECRET_DIGEST_BYTES = 32;
