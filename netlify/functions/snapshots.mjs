import { getStore } from '@netlify/blobs';
import handlerModule from '../lib/snapshots-handler.cjs';
import { adaptHandler } from '../lib/function-adapter.mjs';

export default adaptHandler(handlerModule.createHandler(getStore));
