import {getStore} from '@netlify/blobs';
import handler from '../lib/trial-sync-handler.cjs';
export default handler.createHandler(getStore);
