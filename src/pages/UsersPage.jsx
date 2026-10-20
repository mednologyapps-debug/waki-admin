import { useState } from "react";
import {
  AdminPage,
  AdminDialog,
  Pager,
  Feedback,
} from "../components/admin/AdminUI";
import { useAdminQuery } from "../lib/useAdminQuery";
import { useAdminSession } from "../lib/adminSession";
import {
  roles,
  accounts,
  staffRoles,
  adminAction,
  controlError,
} from "../lib/adminControl";
export default function UsersPage() {
  const q = useAdminQuery("users"),
    session = useAdminSession(),
    [edit, setEdit] = useState(null),
    [role, setRole] = useState("user"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const superAdmin = session?.profile?.role === "super_admin";
  function open(row, action) {
    setError("");
    setRole(row?.role || "user");
    setEdit({ row, action });
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await adminAction(edit.action, {
        ...f,
        id: edit.row?.id,
        updated_at: edit.row?.updated_at,
      });
      setNotice(
        edit.action === "send_activation"
          ? result.email_sent
            ? "Enlace enviado al correo del usuario."
            : "No se pudo enviar el enlace. Revisa el servicio de correo de Supabase."
          : edit.action === "create_user"
            ? result.email_sent
              ? "Cuenta creada pendiente de aprobación. Se envió el enlace para definir su contraseña."
              : "Cuenta creada pendiente de aprobación, pero no se pudo enviar el enlace. Revisa la configuración de correo de Supabase."
            : "Cambios guardados y registrados en auditoría.",
      );
      setEdit(null);
      q.refresh();
    } catch (err) {
      setError(controlError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminPage
      title="Usuarios"
      subtitle="Revisa accesos, aprueba cuentas y asigna permisos por hotel."
      actions={
        <button
          className="control-btn primary"
          onClick={() => open(null, "create_user")}
        >
          Crear usuario
        </button>
      }
    >
      <Feedback error={q.error} notice={notice} />
      <form
        className="control-filters"
        onSubmit={(e) => {
          e.preventDefault();
          q.apply({
            ...Object.fromEntries(new FormData(e.currentTarget)),
            page: 0,
          });
        }}
      >
        <input
          name="search"
          placeholder="Buscar nombre o correo"
          aria-label="Nombre o correo"
        />
        <select name="role" aria-label="Rol">
          <option value="">Todos los roles</option>
          {Object.entries(roles).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="status" aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(accounts).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="control-check">
          <input type="checkbox" name="guests" value="true" /> Incluir invitados
        </label>
        <button className="control-btn primary">Buscar</button>
      </form>
      <section className="control-card">
        <div className="control-table-wrap" aria-busy={q.loading}>
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol y hotel</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!q.loading &&
                q.data?.rows?.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.full_name || "Sin nombre"}</strong>
                      <small>{row.email || "Invitado sin correo"}</small>
                    </td>
                    <td>
                      {roles[row.role]}
                      {row.hotels?.map((h) => (
                        <small key={h.hotel_id}>
                          {h.hotel_name} · {staffRoles[h.staff_role]}
                        </small>
                      ))}
                    </td>
                    <td>
                      <span className={"control-badge " + row.display_status}>
                        {accounts[row.display_status]}
                      </span>
                    </td>
                    <td>
                      <div className="control-actions">
                        {row.id === session?.user?.id ? (
                          <small>Tu cuenta</small>
                        ) : (
                          (superAdmin ||
                            !["admin", "super_admin"].includes(row.role)) && (
                            <>
                              {row.display_status === "pending" && (
                                <>
                                  <button
                                    className="control-btn"
                                    onClick={() => open(row, "approve_user")}
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    className="control-btn danger"
                                    onClick={() => open(row, "reject_user")}
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                              <button
                                className="control-btn"
                                onClick={() => open(row, "update_user")}
                              >
                                Gestionar
                              </button>
                              {row.email && (
                                <button
                                  className="control-btn"
                                  onClick={() => open(row, "send_activation")}
                                >
                                  Enviar acceso
                                </button>
                              )}
                            </>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {(q.loading || !q.data?.rows?.length) && (
                <tr>
                  <td colSpan="4">
                    {q.loading
                      ? "Cargando usuarios…"
                      : "No hay usuarios con estos filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.filter.page}
          total={q.data?.total || 0}
          onPage={(page) => q.apply({ ...q.filter, page })}
        />
      </section>
      {edit && (
        <AdminDialog
          title={
            {
              create_user: "Crear usuario",
              update_user: "Gestionar usuario",
              approve_user: "Aprobar cuenta",
              reject_user: "Rechazar cuenta",
              send_activation: "Enviar enlace de acceso",
            }[edit.action]
          }
          onClose={() => setEdit(null)}
          busy={busy}
        >
          <form onSubmit={save} className="control-form">
            <Feedback error={error} />
            {edit.row && (
              <p>
                <strong>{edit.row.full_name}</strong>
                <br />
                {edit.row.email}
              </p>
            )}
            {["create_user", "update_user"].includes(edit.action) ? (
              <>
                <label>
                  Nombre completo
                  <input
                    name="full_name"
                    required
                    minLength="2"
                    maxLength="160"
                    defaultValue={edit.row?.full_name || ""}
                  />
                </label>
                {edit.action === "create_user" && (
                  <label>
                    Correo electrónico
                    <input name="email" type="email" required maxLength="254" />
                  </label>
                )}
                <label>
                  Rol
                  <select
                    name="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {Object.entries(roles)
                      .filter(
                        ([v]) =>
                          superAdmin || !["admin", "super_admin"].includes(v),
                      )
                      .map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                  </select>
                </label>
                {edit.action === "update_user" && (
                  <label>
                    Estado de acceso
                    <select
                      name="account_status"
                      defaultValue={edit.row.account_status}
                    >
                      {Object.entries(accounts)
                        .filter(
                          ([v]) =>
                            v !== "pending" &&
                            (edit.row.display_status !== "pending" ||
                              v !== "active"),
                        )
                        .map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                <input type="hidden" name="role" value={role} />
                <p>
                  {edit.action === "approve_user"
                    ? "La cuenta tendrá acceso según su rol."
                    : edit.action === "send_activation"
                      ? "Se enviará un enlace al correo registrado para definir o recuperar su contraseña."
                      : "La cuenta quedará bloqueada y no podrá acceder."}
                </p>
              </>
            )}
            {role === "hotel" &&
              !["reject_user", "send_activation"].includes(edit.action) && (
                <>
                  <label>
                    Hotel
                    <select
                      name="hotel_id"
                      required
                      defaultValue={edit.row?.hotels?.[0]?.hotel_id || ""}
                    >
                      <option value="">Seleccionar hotel</option>
                      {q.data?.hotels?.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Permiso en hotel
                    <select
                      name="staff_role"
                      defaultValue={
                        edit.row?.hotels?.[0]?.staff_role || "reception"
                      }
                    >
                      {Object.entries(staffRoles).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            {edit.action === "create_user" && (
              <p className="control-hint">
                Se enviará un enlace para definir su contraseña. La cuenta
                permanecerá suspendida hasta su aprobación.
              </p>
            )}
            <label>
              Motivo del cambio
              <textarea
                name="reason"
                required
                minLength="5"
                maxLength="500"
                rows="3"
              />
            </label>
            <label className="control-check">
              <input type="checkbox" required /> He revisado el usuario, rol y
              alcance de este cambio.
            </label>
            <button className="control-btn primary" disabled={busy}>
              {busy ? "Guardando…" : "Confirmar"}
            </button>
          </form>
        </AdminDialog>
      )}
    </AdminPage>
  );
}
