export const PLAN_OPTIONS = [
  {code: "socio", title: "Socio WAKI", rate: 8, monthly: 99},
  {code: "flexible", title: "Flexible", rate: 12, monthly: 0},
];
export const planTitle = code => PLAN_OPTIONS.find(p => p.code === code)?.title || "Sin plan definido";
export const nextCutoff = (today) => {
  const d = new Date(today + "T12:00:00Z");
  if (!Number.isFinite(d.getTime())) return null;
  const weekday = d.getUTCDay();
  const days = [0,3].map(day => (day-weekday+7)%7);
  d.setUTCDate(d.getUTCDate()+Math.min(...days));
  return d.toISOString().slice(0,10);
};
export const formatPEN = n => new Intl.NumberFormat("es-PE", {style:"currency",currency:"PEN"}).format(Number(n||0));
export const planCost = (plan, gross) => plan === "socio" ? Number(gross)*.08+99 : Number(gross)*.12;
