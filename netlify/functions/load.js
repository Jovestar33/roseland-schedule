import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) {
    return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
  }
  const store = getStore("schedules");
  const data = await store.getJSON(name);
  if (!data) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
};

export const config = { path: "/api/load" };
