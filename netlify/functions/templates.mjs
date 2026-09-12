import handlerModule from '../lib/templates-handler.cjs';
import { adaptHandler } from '../lib/function-adapter.mjs';

// Native Request/Response functions retain Netlify's complete Blobs context,
// including the uncached endpoint required for strong consistency.
export default adaptHandler(handlerModule.handler);
