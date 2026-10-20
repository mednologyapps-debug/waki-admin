import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { controlError } from "./adminControl";
export function useAdminQuery(mode, initial = { page: 0 }) {
  const [filter, setFilter] = useState(initial),
    [revision, setRevision] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: result, error: err } = await supabase.rpc(
          "admin_control_read",
          { p_mode: mode, p_filter: filter },
        );
        if (err) throw err;
        if (!cancelled) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(controlError(err));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mode, filter, revision]);
  const apply = (next) => {
    setLoading(true);
    setFilter(next);
  };
  const refresh = () => {
    setLoading(true);
    setRevision((v) => v + 1);
  };
  return { data, error, loading, filter, apply, refresh };
}
