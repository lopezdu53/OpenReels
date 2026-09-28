import { Loader2 } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";

export function AuthPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="w-full max-w-sm rounded-3xl hf-l-border bg-card p-6 shadow-glow-md shadow-primary/20"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark className="text-foreground" size={28} />
          <div>
            <h1 className="text-lg font-bold tracking-tight">OpenReels</h1>
            <p className="text-[12px] text-muted-foreground">Tu estudio, con tu cuenta</p>
          </div>
        </div>
        <label htmlFor="auth-email" className="mb-3 block text-[12px] text-muted-foreground">
          Email
          <Input
            id="auth-email"
            type="email"
            className="mt-1 h-11 rounded-2xl bg-secondary"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label htmlFor="auth-pass" className="mb-4 block text-[12px] text-muted-foreground">
          Contraseña
          <Input
            id="auth-pass"
            type="password"
            className="mt-1 h-11 rounded-2xl bg-secondary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? (
          <p className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full rounded-2xl text-sm font-semibold" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Entrar
        </Button>
        <p className="mt-4 text-center text-[12px] text-muted-foreground">
          Si no tienes cuenta, pídesela al superadmin. Él crea el usuario y tú entras a generar tu
          contenido.
        </p>
      </form>
    </div>
  );
}
