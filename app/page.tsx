export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Roseland Production Schedule</h1>
      <p>Next app migration is working.</p>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #ddd",
          borderRadius: 12,
          maxWidth: 700,
        }}
      >
        <h2>Migration Test Screen</h2>
        <p>
          This is the first visible change inside the new Next.js version of the
          scheduling app.
        </p>
      </section>
    </main>
  );
}