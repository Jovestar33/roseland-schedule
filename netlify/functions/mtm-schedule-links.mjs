import { getStore } from '@netlify/blobs';
import sync from '../lib/mtm-schedule-links.cjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const targets = require('../lib/mtm-overview-targets.json');

export const config = { schedule: '*/15 * * * *' };

export default async () => {
  // Only the published production site may access the live Zoho project.
  if (process.env.CONTEXT !== 'production' || process.env.MTM_LINK_SYNC_ENABLED !== 'true') return;
  const deadline = Date.now() + 24000;
  const signal = AbortSignal.timeout(24000);
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal, redirect: 'error' });
    if (!response.ok) throw new Error(`remote_http_${response.status}`);
    const data = await response.json();
    if (data.error || data.error_code) throw new Error('remote_api_error');
    return data;
  };
  try {
    for (const key of ['MTM_ZOHO_CLIENT_ID', 'MTM_ZOHO_CLIENT_SECRET', 'MTM_ZOHO_REFRESH_TOKEN']) {
      if (!process.env[key]) throw new Error('missing_zoho_configuration');
    }
    const auth = await request('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: process.env.MTM_ZOHO_CLIENT_ID,
        client_secret: process.env.MTM_ZOHO_CLIENT_SECRET, refresh_token: process.env.MTM_ZOHO_REFRESH_TOKEN })
    });
    if (!auth.access_token) throw new Error('zoho_access_token_missing');
    const headers = { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
    const base = `https://projectsapi.zoho.com/api/v3/portal/${sync.PORTAL_ID}/projects/${sync.PROJECT_ID}/tasks`;
    const store = getStore({ name: 'schedules', consistency: 'strong' });
    const result = await sync.runSync({
      targets,
      productionNames: ['Main To Main Trail', 'Main to Main', 'MTM'],
      dryRun: process.env.MTM_LINK_SYNC_WRITE !== 'true',
      deadline,
      readSchedules: async () => {
        const { blobs } = await store.list();
        return sync.mapLimit(blobs, 8, async ({ key }) => {
          if (Date.now() > deadline - 5000) throw new Error('schedule_read_time_budget');
          const data = await store.get(key, { type: 'json' });
          if (!data) throw new Error('schedule_disappeared_during_read');
          return { name: key, data };
        });
      },
      listTasks: async () => {
        const tasks = [];
        for (let page = 1; page <= 20; page++) {
          const payload = await request(`${base}?page=${page}&per_page=200`, { headers });
          const data = payload.data || payload;
          if (!Array.isArray(data.tasks)) throw new Error('unexpected_task_response');
          tasks.push(...data.tasks);
          if (data.page_info?.has_next_page === false || data.tasks.length < 200) return tasks;
        }
        throw new Error('task_pagination_limit');
      },
      patchTask: async (id, fields) => {
        // Fixed project, prevalidated Overview IDs, and only this one URL field.
        await request(`${base}/${id}`, { method: 'PATCH', headers, body: JSON.stringify(fields) });
      }
    });
    console.log('[MTM schedule links]', JSON.stringify(result));
  } catch (error) {
    // Never log request headers, OAuth responses, tokens, or schedule contents.
    const message = /^[a-z_]+(?:_\d+)?$/.test(error.message) ? error.message : 'sync_failed';
    console.error('[MTM schedule links]', message);
    throw new Error(message);
  }
};
