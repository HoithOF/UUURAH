import type { Config } from "@netlify/functions";

// Runs every hour on Netlify: refreshes apps that don't push updates, then sends any alerts that are due.
export default async () => {
  const base = process.env.URL ?? process.env.APP_URL;
  const headers = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  for (const path of ["/api/cron/sync", "/api/cron/alerts"]) {
    const res = await fetch(new URL(path, base), { method: "POST", headers });
    console.log(path, res.status, (await res.text()).slice(0, 300));
  }
};

export const config: Config = { schedule: "@hourly" };
