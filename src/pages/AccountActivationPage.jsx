import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Feedback } from "../components/admin/AdminUI";
export default function AccountActivationPage() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user);
        setReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user || null);
        setReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  async function save(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (f.password !== f.confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({
      password: f.password,
    });
    if (err)
      setError(
        "El enlace venció o la contraseña no cumple los requisitos. Solicita un nuevo enlace.",
      );
    else {
      await supabase.auth.signOut();
      setDone(true);
    }
    setBusy(false);
  }
  return (
    <main className="control-activation">
      <section className="control-card">
        <h1>Bienvenido a WAKI</h1>
        {done ? (
          <>
            <p>
              Tu contraseña está lista. El administrador debe aprobar tu cuenta
              antes de que puedas acceder al portal correspondiente a tu rol.
            </p>
            <Link to="/login">Ir al acceso de Admin</Link>
          </>
        ) : !ready ? (
          <p>Verificando enlace…</p>
        ) : user ? (
          <form className="control-form" onSubmit={save}>
            <p>
              Define la contraseña de <strong>{user.email}</strong>.
            </p>
            <Feedback error={error} />
            <label>
              Nueva contraseña
              <input
                name="password"
                type="password"
                required
                minLength="12"
                maxLength="128"
                autoComplete="new-password"
              />
            </label>
            <label>
              Repetir contraseña
              <input
                name="confirm"
                type="password"
                required
                minLength="12"
                autoComplete="new-password"
              />
            </label>
            <button className="control-btn primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        ) : (
          <p>
            Abre el enlace de activación enviado a tu correo. Si venció,
            solicita al administrador un nuevo enlace.
          </p>
        )}
      </section>
    </main>
  );
}
