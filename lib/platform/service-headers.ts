// Legacy service-role keys are JWTs and need a bearer header. New sb_secret_
// keys belong only in apikey; forwarding those as bearer tokens is invalid.
export function serviceApiHeaders(secretKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: secretKey };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secretKey)) {
    headers.authorization = `Bearer ${secretKey}`;
  }
  return headers;
}
