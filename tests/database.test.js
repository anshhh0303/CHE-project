import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';

test('cloud deployments refuse temporary SQLite and incomplete credentials', async () => {
  const root = import.meta.dirname;
  for (const env of [{RENDER:'true'}, {REQUIRE_TURSO:'1'}]) {
    await assert.rejects(openDatabase({root,env}), /requires Turso/);
  }
  await assert.rejects(openDatabase({root,env:{TURSO_DATABASE_URL:'libsql://example.turso.io'}}), /AUTH_TOKEN is required/);
  await assert.rejects(openDatabase({root,env:{TURSO_AUTH_TOKEN:'test'}}), /DATABASE_URL is required/);
  await assert.rejects(openDatabase({root,env:{TURSO_DATABASE_URL:'file:test.sqlite',TURSO_AUTH_TOKEN:'test'}}), /URL supplied by Turso/);
  await assert.rejects(openDatabase({root,env:{DB_DRIVER:'libsql-local',NODE_ENV:'production'}}), /only available/);
});
