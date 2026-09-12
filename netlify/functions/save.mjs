import { getStore } from '@netlify/blobs';
import handlerModule from '../lib/save-handler.cjs';
import { adaptHandler } from '../lib/function-adapter.mjs';

// Native Request/Response functions retain Netlify's complete Blobs context,
// including the uncached endpoint required for strong consistency.
export default adaptHandler(handlerModule.createHandler(getStore));
