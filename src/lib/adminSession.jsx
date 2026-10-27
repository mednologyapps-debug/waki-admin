import { createContext, useContext } from "react";
export const AdminSessionContext = createContext(null);
export function useAdminSession() {
  return useContext(AdminSessionContext);
}
