import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  UsersRound,
  CircleDollarSign,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Activity,
  MessageSquare,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAdminSession } from "../../lib/adminSession";
import logo from "../../assets/admin-logo-white.webp";
import background from "../../assets/admin-sidebar-bg.webp";
import "./AdminSidebar.css";
const links = [
  ["/dashboard", "Resumen", LayoutDashboard],
  ["/hoteles", "Hoteles", Building2],
  ["/reservas", "Reservas", CalendarDays],
  ["/usuarios", "Usuarios", UsersRound],
  ["/finanzas", "Ventas y liquidaciones", CircleDollarSign],
  ["/analitica", "Analítica de negocio", ChartNoAxesCombined],
  ["/monitoreo", "Monitoreo y correos", Activity],
  ["/reclamos", "Reclamaciones", MessageSquare],
  ["/reportes", "Reportes", ChartNoAxesCombined],
  ["/configuracion", "Configuración", Settings],
];
export default function AdminSidebar() {
  const session = useAdminSession();
  const navigate = useNavigate();
  const drawer = useRef(null);
  const toggle = useRef(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector("a")?.focus();
    function key(e) {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
      if (e.key === "Tab") {
        const nodes = drawer.current.querySelectorAll("a,button");
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes[nodes.length - 1].focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === nodes[nodes.length - 1]
        ) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  async function logout() {
    setBusy(true);
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }
  return (
    <>
      <header className="admin-mobile-bar">
        <img src={logo} alt="WAKI" />
        <span>ADMIN</span>
        <button
          ref={toggle}
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="global-admin-navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && (
        <button
          className="admin-drawer-overlay"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        ref={drawer}
        id="global-admin-navigation"
        className={`admin-canonical-sidebar ${open ? "is-open" : ""}`}
        style={{ backgroundImage: `url(${background})` }}
      >
        <div>
          <div className="admin-canonical-brand">
            <img src={logo} alt="WAKI" />
            <span>ADMIN</span>
          </div>
          <div className="admin-canonical-account">
            <ShieldCheck size={25} />
            <div>
              <strong>Administración global</strong>
              <small>Todos los hoteles · WAKI</small>
            </div>
          </div>
          <nav aria-label="Administración">
            {links.map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => (isActive ? "is-active" : "")}
              >
                <Icon size={21} strokeWidth={1.7} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="admin-canonical-bottom">
          <strong>{session?.profile?.full_name || "Admin WAKI"}</strong>
          <small>
            {session?.profile?.role === "super_admin"
              ? "Superadministrador"
              : "Administrador global"}
          </small>
          <button disabled={busy} onClick={logout}>
            <LogOut size={20} />
            {busy ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </aside>
    </>
  );
}
