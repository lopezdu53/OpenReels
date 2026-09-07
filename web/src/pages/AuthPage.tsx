import { Clapperboard, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") await register(name, email, password);
      else await login(email, password);
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
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-glow-sm shadow-primary/10"
      >
        <div className="mb-5 flex items-center gap-2">
          <Clapperboard className="size-6 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">OpenReels</h1>
            <p className="text-[12px] text-muted-foreground">Tu estudio, con tu cuenta</p>
          </div>
        </div>
        {mode === "register" ? (
          <label htmlFor="auth-name" className="mb-3 block text-[12px] text-muted-foreground">
            Nombre
            <Input
              id="auth-name"
              className="mt-1 h-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label htmlFor="auth-email" className="mb-3 block text-[12px] text-muted-foreground">
          Email
          <Input
            id="auth-email"
            type="email"
            className="mt-1 h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label htmlFor="auth-pass" className="mb-4 block text-[12px] text-muted-foreground">
          Contraseña {mode === "register" ? "(mín. 8)" : ""}
          <Input
            id="auth-pass"
            type="password"
            className="mt-1 h-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={mode === "register" ? 8 : 1}
          />
        </label>
        {error ? (
          <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "login" ? "Entrar" : "Crear cuenta"}
        </Button>
        <button
          type="button"
          className="mt-4 w-full text-center text-[12px] text-primary hover:underline"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta"}
        </button>
      </form>
    </div>
  );
}
