import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const root = path.dirname(fileURLToPath(import.meta.url));
const derive = promisify(scrypt);
mkdirSync(path.join(root, 'data'), { recursive: true });
const db = new DatabaseSync(process.env.DB_PATH || path.join(root, 'data/ecoquest.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE, salt TEXT, password TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), expires INTEGER);
CREATE TABLE IF NOT EXISTS quizzes (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), questions TEXT, answers TEXT DEFAULT '[]', lifelines TEXT DEFAULT '{}', score INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP, completed TEXT);
CREATE INDEX IF NOT EXISTS quiz_user ON quizzes(user_id);`);
const bank = JSON.parse(readFileSync(path.join(root, 'data/questions.json'), 'utf8'));
const byId = new Map(bank.map(q => [q.id, q]));
const limited = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function board() {
  return db.prepare(`WITH stats AS (SELECT u.id, u.username, MAX(q.score) best, COUNT(*) quizzes, SUM(q.score) xp FROM users u JOIN quizzes q ON q.user_id=u.id WHERE q.completed IS NOT NULL GROUP BY u.id)
  SELECT *, RANK() OVER (ORDER BY best DESC) rank FROM stats ORDER BY best DESC, username COLLATE NOCASE`).all();
}
function profile(user) {
  const history = db.prepare('SELECT id, score, completed, lifelines FROM quizzes WHERE user_id=? AND completed IS NOT NULL ORDER BY completed DESC, rowid DESC LIMIT 30').all(user.id);
  const totals = db.prepare('SELECT COUNT(*) quizzes, COALESCE(SUM(score),0) xp, COALESCE(MAX(score),0) best FROM quizzes WHERE user_id=? AND completed IS NOT NULL').get(user.id);
  const ranking = board().find(r => r.id === user.id);
  const badges = [
    { name: 'First steps', icon: 'sprout', description: 'Finish your first quiz', unlocked: totals.quizzes >= 1 },
    { name: 'Perfect planet', icon: 'star', description: 'Score 100 in one quiz', unlocked: totals.best === 100 },
    { name: 'Eco explorer', icon: 'compass', description: 'Complete 5 quizzes', unlocked: totals.quizzes >= 5 },
    { name: 'Planet guardian', icon: 'shield', description: 'Collect 500 XP', unlocked: totals.xp >= 500 }
  ];
  const active = db.prepare('SELECT id FROM quizzes WHERE user_id=? AND completed IS NULL ORDER BY rowid DESC LIMIT 1').get(user.id);
  return { username: user.username, ...totals, rank: ranking?.rank ?? null, players: board().length, history: history.map(h => ({ ...h, lifelines: Object.keys(JSON.parse(h.lifelines)).length })), badges, activeQuiz: active?.id, level: Math.floor(totals.xp / 200) + 1 };
}
function quizView(row) {
  const entries = JSON.parse(row.questions), answers = JSON.parse(row.answers), lifelines = JSON.parse(row.lifelines);
  const questions = entries.map(entry => { const q = byId.get(entry.id); return { id: q.id, question: q.question, category: q.category, difficulty: q.difficulty, choices: entry.order.map(i => q.choices[i]) }; });
  return { id: row.id, questions, answers, lifelines, completed: !!row.completed, score: row.score };
}
function result(row, user) {
  const entries = JSON.parse(row.questions), answers = JSON.parse(row.answers);
  const prior = db.prepare('SELECT COUNT(*) attempts, MAX(score) best FROM quizzes WHERE user_id=? AND completed IS NOT NULL AND rowid < (SELECT rowid FROM quizzes WHERE id=?)').get(user.id, row.id);
  const companion = { mood: prior.attempts === 0 || row.score > prior.best ? 'happy' : row.score < prior.best ? 'angry' : 'calm', firstQuiz: prior.attempts === 0, previousBest: prior.best, attempt: prior.attempts + 1 };
  return { score: row.score, companion, lifelines: Object.keys(JSON.parse(row.lifelines)), profile: profile(user), review: entries.map((entry, i) => {
    const q = byId.get(entry.id); return { question: q.question, choices: entry.order.map(j => q.choices[j]), selected: answers[i], correct: entry.order.indexOf(q.correct), explanation: q.explanation, source: q.source, sourceUrl: q.sourceUrl, category: q.category };
  }) };
}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 16000) fail(413, 'Request too large.'); }
  try { return JSON.parse(raw || '{}'); } catch { fail(400, 'Invalid JSON.'); }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url, `http://${req.headers.host}`), route = url.pathname;
    if (!route.startsWith('/api/')) {
      if (req.method !== 'GET') fail(405, 'Method not allowed.');
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/arcade.js': ['arcade.js', 'text/javascript'], '/companion.js': ['companion.js', 'text/javascript'], '/arcade.css': ['arcade.css', 'text/css'], '/micro.css': ['micro.css', 'text/css'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      const file = files[route]; if (!file) fail(404, 'Page not found.');
      res.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8' }); res.end(readFileSync(path.join(root, 'public', file[0]))); return;
    }
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail(403, 'Request origin rejected.');
    const cookie = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('eco_session='))?.slice(12);
    const user = cookie ? db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash(cookie), Date.now()) : null;
    if (route === '/api/meta' && req.method === 'GET') return send(200, { questions: bank.length, categories: [...new Set(bank.map(q => q.category))], source: 'SciQ', license: 'CC BY-NC 3.0', mix: { easy: 4, medium: 4, hard: 2 } });
    if (route === '/api/leaderboard' && req.method === 'GET') return send(200, { players: board().slice(0, 100), total: board().length, mine: user ? board().find(p => p.id === user.id) : null });
    if (route === '/api/me' && req.method === 'GET') return send(200, { user: user ? profile(user) : null });
    if (['/api/register', '/api/login'].includes(route) && req.method === 'POST') {
      const ip = req.socket.remoteAddress, now = Date.now();
      const limit = limited.get(ip) || { start: now, count: 0 }; if (now - limit.start > 60000) { limit.start = now; limit.count = 0; }
      limited.set(ip, limit); if (++limit.count > 20) fail(429, 'Too many attempts. Try again in a minute.');
      const data = await body(req), username = typeof data.username === 'string' ? data.username.trim() : '', password = data.password;
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) fail(400, 'Use 3–20 letters, numbers, or underscores for your username.');
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400, 'Your password must be 8–128 characters.');
      let account = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      if (route === '/api/register') {
        if (account) fail(409, 'That username is already taken.');
        const salt = randomBytes(16).toString('hex'), derived = (await derive(password, salt, 64)).toString('hex');
        try { db.prepare('INSERT INTO users(username,salt,password) VALUES(?,?,?)').run(username, salt, derived); } catch { fail(409, 'That username is already taken.'); }
        account = db.prepare('SELECT * FROM users WHERE username=?').get(username);
      } else {
        const derived = await derive(password, account?.salt || 'unknown-account', 64);
        if (!account || !timingSafeEqual(derived, Buffer.from(account.password, 'hex'))) fail(401, 'Username or password is incorrect.');
      }
      const token = randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), account.id, now + 30 * 86400000);
      res.setHeader('Set-Cookie', `eco_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
      return send(200, { user: profile(account) });
    }
    if (!user) fail(401, 'Log in to play and save your progress.');
    if (route === '/api/logout' && req.method === 'POST') {
      db.prepare('DELETE FROM sessions WHERE token=?').run(hash(cookie));
      res.setHeader('Set-Cookie', 'eco_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return send(200, { ok: true });
    }
    if (route === '/api/quizzes' && req.method === 'POST') {
      const existing = db.prepare('SELECT * FROM quizzes WHERE user_id=? AND completed IS NULL ORDER BY rowid DESC LIMIT 1').get(user.id);
      if (existing) return send(200, quizView(existing));
      const selected = shuffle(['easy','easy','easy','easy','medium','medium','medium','medium','hard','hard'].reduce((out, difficulty) => {
        out.push(shuffle(bank.filter(q => q.difficulty === difficulty && !out.some(s => s.id === q.id)))[0]); return out;
      }, []));
      const id = randomBytes(16).toString('hex'), entries = selected.map(q => ({ id: q.id, order: shuffle([0,1,2,3]) }));
      db.prepare('INSERT INTO quizzes(id,user_id,questions) VALUES(?,?,?)').run(id, user.id, JSON.stringify(entries));
      return send(200, quizView(db.prepare('SELECT * FROM quizzes WHERE id=?').get(id)));
    }
    const match = route.match(/^\/api\/quizzes\/([a-f0-9]{32})(?:\/(answer|lifeline|submit|result))?$/);
    if (!match) fail(404, 'Endpoint not found.');
    // Read state after the asynchronous request body, so concurrent requests cannot reuse stale lifelines or answers.
    const data = req.method === 'POST' ? await body(req) : {};
    const row = db.prepare('SELECT * FROM quizzes WHERE id=? AND user_id=?').get(match[1], user.id);
    if (!row) fail(404, 'Quiz not found.');
    if (!match[2] && req.method === 'GET') return send(200, quizView(row));
    if (match[2] === 'result' && req.method === 'GET') { if (!row.completed) fail(409, 'Finish the quiz first.'); return send(200, result(row, user)); }
    if (req.method !== 'POST') fail(405, 'Method not allowed.');
    if (row.completed) { if (match[2] === 'submit') return send(200, result(row, user)); fail(409, 'This quiz is already finished.'); }
    const answers = JSON.parse(row.answers), entries = JSON.parse(row.questions), lifelines = JSON.parse(row.lifelines);
    if (match[2] === 'answer') {
      if (data.index !== answers.length || !Number.isInteger(data.choice) || data.choice < 0 || data.choice > 3) fail(400, 'Choose an answer for the current question.');
      if (answers.length >= 10) fail(409, 'All questions are answered.');
      if (lifelines.fifty?.index === data.index && lifelines.fifty.removed.includes(data.choice)) fail(400, 'That option was removed by 50:50.');
      answers.push(data.choice); db.prepare('UPDATE quizzes SET answers=? WHERE id=?').run(JSON.stringify(answers), row.id); return send(200, { answers });
    }
    if (match[2] === 'lifeline') {
      if (!['fifty','hint'].includes(data.type) || data.index !== answers.length || answers.length >= 10) fail(400, 'Choose an available lifeline for the current question.');
      if (lifelines[data.type]) fail(409, 'You already used this lifeline.');
      const entry = entries[data.index], q = byId.get(entry.id);
      const value = data.type === 'fifty' ? { index: data.index, removed: shuffle([0,1,2,3].filter(i => entry.order[i] !== q.correct)).slice(0,2) } : { index: data.index, text: q.hint };
      lifelines[data.type] = value; db.prepare('UPDATE quizzes SET lifelines=? WHERE id=?').run(JSON.stringify(lifelines), row.id); return send(200, { lifelines });
    }
    if (match[2] === 'submit') {
      if (answers.length !== 10) fail(400, 'Answer all 10 questions before submitting.');
      const score = entries.reduce((sum, e, i) => sum + (e.order[answers[i]] === byId.get(e.id).correct ? 10 : 0), 0);
      db.prepare('UPDATE quizzes SET score=?,completed=CURRENT_TIMESTAMP WHERE id=?').run(score, row.id);
      return send(200, result(db.prepare('SELECT * FROM quizzes WHERE id=?').get(row.id), user));
    }
    fail(404, 'Endpoint not found.');
  } catch (error) { if (!error.status) console.error(error); send(error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' }); }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Groot Mode is running at http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3000}`));
