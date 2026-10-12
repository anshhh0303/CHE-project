import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export async function openDatabase({ root, env = process.env }) {
  const url = env.TURSO_DATABASE_URL?.trim(), token = env.TURSO_AUTH_TOKEN?.trim();
  const sdkTest = env.DB_DRIVER === 'libsql-local';
  if (sdkTest && env.NODE_ENV !== 'test') throw new Error('libsql-local is only available in NODE_ENV=test.');
  if (url && !token) throw new Error('TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set.');
  if (token && !url) throw new Error('TURSO_DATABASE_URL is required when TURSO_AUTH_TOKEN is set.');
  if (url && !/^(libsql|https):\/\//.test(url)) throw new Error('Use the libsql:// or https:// URL supplied by Turso.');
  if ((env.RENDER || env.REQUIRE_TURSO === '1') && !url) throw new Error('This deployment requires Turso. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN; refusing ephemeral local storage.');
  const localPath = env.DB_PATH || path.join(root, 'data/ecoquest.sqlite');
  let connection, local;
  if (url || sdkTest) {
    const { createClient } = await import('@libsql/client');
    if (sdkTest) mkdirSync(path.dirname(localPath), { recursive: true });
    connection = createClient({ url: url || `file:${localPath.replaceAll('\\', '/')}`, authToken: token, intMode: 'number' });
  } else {
    mkdirSync(path.dirname(localPath), { recursive: true });
    local = new DatabaseSync(localPath, { timeout: 5000 });
    local.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  }
  // Queue operations on this connection. A transaction owns the queue until commit.
  // Remote write transactions also protect against requests from other processes.
  let tail = Promise.resolve();
  const queue = fn => { const task = tail.then(fn); tail = task.catch(() => {}); return task; };
  const handle = target => ({
    all: async (sql, ...args) => local ? target.prepare(sql).all(...args) : (await target.execute({ sql, args })).rows.map(row => ({ ...row })),
    get: async (sql, ...args) => local ? target.prepare(sql).get(...args) : ((await target.execute({ sql, args })).rows.map(row => ({ ...row })))[0],
    run: async (sql, ...args) => local ? target.prepare(sql).run(...args) : target.execute({ sql, args }),
  });
  const direct = handle(local || connection);
  const db = {
    mode: url ? 'turso' : sdkTest ? 'libsql-local-test' : 'sqlite',
    all: (...args) => queue(() => direct.all(...args)),
    get: (...args) => queue(() => direct.get(...args)),
    run: (...args) => queue(() => direct.run(...args)),
    transaction: fn => queue(async () => {
      let tx;
      try {
        if (local) { local.exec('BEGIN IMMEDIATE'); tx = local; }
        else tx = await connection.transaction('write');
        const result = await fn(handle(tx));
        if (local) local.exec('COMMIT'); else await tx.commit();
        return result;
      } catch (error) {
        if (local && local.isTransaction) local.exec('ROLLBACK');
        else if (tx && !tx.closed) await tx.rollback().catch(() => {});
        throw error;
      } finally { if (!local) tx?.close(); }
    }),
    close: () => queue(() => (local || connection).close()),
  };
  await db.transaction(async tx => {
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, salt TEXT, password TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER)',
      "CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), questions TEXT, answers TEXT DEFAULT '[]', lifelines TEXT DEFAULT '{}', score INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, completed TEXT)",
      'CREATE INDEX IF NOT EXISTS quiz_user ON quizzes(user_id)',
      'CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires)',
      'CREATE UNIQUE INDEX IF NOT EXISTS one_active_quiz ON quizzes(user_id) WHERE completed IS NULL',
    ]) await tx.run(sql);
  });
  return db;
}
