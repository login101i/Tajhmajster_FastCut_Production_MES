import mysql from 'mysql2/promise';

function env(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

export function getMysqlConfig() {
  const host = env('MYSQL_HOST', 'MYSQL_CYBERFOLKS_HOST', 'MYSQL_DOCKER_HOST');
  const user = env('MYSQL_USER', 'MYSQL_CYBERFOLKS_USER', 'MYSQL_DOCKER_USER');
  const password = env('MYSQL_PASSWORD', 'MYSQL_CYBERFOLKS_PASSWORD', 'MYSQL_DOCKER_PASSWORD');
  const database = env('MYSQL_DATABASE', 'MYSQL_CYBERFOLKS_DATABASE', 'MYSQL_DOCKER_DATABASE');
  const port = parseInt(
    env('MYSQL_PORT', 'MYSQL_CYBERFOLKS_PORT', 'MYSQL_DOCKER_PORT') || '3306',
    10,
  );

  if (!host || !user || !password || !database) {
    throw new Error(
      'Brak MYSQL_* w env (HOST, USER, PASSWORD, DATABASE). Ustaw w Netlify → Environment variables.',
    );
  }

  return { host, user, password, database, port };
}

/** Short-lived connection — safer for Netlify Functions cold starts. */
export async function withConnection<T>(
  fn: (conn: mysql.Connection) => Promise<T>,
): Promise<T> {
  const config = getMysqlConfig();
  const conn = await mysql.createConnection({
    ...config,
    connectTimeout: 10_000,
    timezone: 'Z',
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}
