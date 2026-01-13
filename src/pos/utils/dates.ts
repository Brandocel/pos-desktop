export function getTodayCancunISO() {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Cancun" }));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
  