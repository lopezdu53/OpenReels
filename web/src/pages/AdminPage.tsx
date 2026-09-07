import { Loader2, Shield } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AdminUserRow, api } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";

export function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dailyGoal, setDailyGoal] = useState(4);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .adminUsers()
      .then((data) => {
        setUsers(data.users);
        setError("");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  async function load() {
    const data = await api.adminUsers();
    setUsers(data.users);
    setError("");
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => u.email.includes(needle) || u.name.toLowerCase().includes(needle));
  }, [users, q]);

  const current = users.find((u) => u.id === selected) ?? null;

  function open(row: AdminUserRow) {
    setSelected(row.id);
    setName(row.name);
    setEmail(row.email);
    setDailyGoal(row.dailyGoal);
    setPassword("");
    setError("");
  }

  async function saveProfile() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.adminUpdateUser(selected, { name, email, dailyGoal });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.adminSetPassword(selected, password);
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "admin") {
    return <p className="px-10 py-8 text-sm text-destructive">Solo el superadmin entra aquí.</p>;
  }

  return (
    <div className="max-w-[1100px] space-y-6 px-4 py-8 sm:px-10">
      <div className="flex items-start gap-3">
        <Shield className="mt-0.5 size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Superadmin</h1>
          <p className="text-[13px] text-muted-foreground">
            {users.length} usuario{users.length === 1 ? "" : "s"}. La clave de la cuenta marcada
            EasyPanel sale de SUPERADMIN_PASSWORD (servicio video).
          </p>
        </div>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o email"
        className="h-10 max-w-md"
      />

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Meta/día</th>
              <th className="px-3 py-2 font-medium">Clones</th>
              <th className="px-3 py-2 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={selected === row.id ? "bg-primary/10" : "hover:bg-muted/30"}
              >
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium" onClick={() => open(row)}>
                    {row.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.email}</td>
                <td className="px-3 py-2">{row.envSuperadmin ? "superadmin" : row.role}</td>
                <td className="px-3 py-2 tabular-nums">{row.dailyGoal}</td>
                <td className="px-3 py-2 tabular-nums">{row.clones}</td>
                <td className="px-3 py-2 text-[12px] text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString("es")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current ? (
        <form
          className="max-w-lg space-y-3 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveProfile();
          }}
        >
          <p className="text-sm font-semibold">Editar {current.email}</p>
          <label htmlFor="admin-name" className="block text-[12px] text-muted-foreground">
            Nombre
            <Input
              id="admin-name"
              className="mt-1 h-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label htmlFor="admin-email" className="block text-[12px] text-muted-foreground">
            Email
            <Input
              id="admin-email"
              type="email"
              className="mt-1 h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={current.envSuperadmin}
            />
          </label>
          <label htmlFor="admin-goal" className="block text-[12px] text-muted-foreground">
            Meta diaria
            <select
              id="admin-goal"
              className="mt-1 h-10 w-full rounded-lg border border-input bg-transparent px-2"
              value={dailyGoal}
              onChange={(e) => setDailyGoal(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={`goal-${n}`} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar perfil
          </Button>

          <label htmlFor="admin-pass" className="block text-[12px] text-muted-foreground">
            Nueva contraseña (mín. 8)
            <Input
              id="admin-pass"
              type="password"
              className="mt-1 h-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {current.envSuperadmin ? (
            <p className="text-[11px] text-muted-foreground">
              Esta cuenta se reescribe al reiniciar video con SUPERADMIN_PASSWORD. Para un cambio
              permanente, edita esa variable en EasyPanel.
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={saving || password.length < 8}
            onClick={() => void savePassword()}
          >
            Cambiar contraseña
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Toca un nombre para editarlo.</p>
      )}
    </div>
  );
}
