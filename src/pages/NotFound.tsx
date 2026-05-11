// @ts-nocheck
import { Link } from "wouter";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link href="/dashboard" className="mt-4 inline-block text-primary">Back to dashboard</Link>
    </main>
  );
}