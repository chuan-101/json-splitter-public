export const fmtDate = (sec) => {
  const d = new Date((sec || Date.now() / 1000) * 1000);
  const iso = d.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return { d, iso };
};
