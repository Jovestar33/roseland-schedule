import { getStore } from "@netlify/blobs";

export default async (req) => {
  const { name, data } = await req.json();
  if (!name || !data) {
    return new Response(JSON.stringify({ error: "Missing name or data" }), { status: 400 });
  }
  const store = getStore("schedules");
  await store.setJSON(name, data);
  return new Response(JSON.stringify({ ok: true, name }), {
    headers: { "Content-Type": "application/json" }
  });
};

export const config = { path: "/api/save" };
