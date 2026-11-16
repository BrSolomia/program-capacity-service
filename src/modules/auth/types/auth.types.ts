export type BasicCredentials = {
  clientId: string;
  secret: string;
};

export type RequestHeaders = Record<string, string | string[] | undefined>;
