// Keep the existing endpoint contracts while using Netlify's native runtime.
// Do not call connectLambda here: it replaces the native Blobs context and
// discards the uncached endpoint that version checks need.
export function adaptHandler(handler) {
  return async function (request) {
    const url = new URL(request.url);
    const result = await handler({
      httpMethod: request.method,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: ['GET', 'HEAD'].includes(request.method) ? '' : await request.text(),
    });
    return new Response(result.body ?? null, {
      status: result.statusCode,
      headers: result.headers,
    });
  };
}
