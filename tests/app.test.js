import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const bank = JSON.parse(readFileSync(path.join(root, 'data/questions.json'), 'utf8'));
for (const driver of ['sqlite', 'libsql-local']) test(`${driver}: accounts, private quizzes, lifelines, scoring, shared ranks, and persistence`, async () => {
  const temp = mkdtempSync(path.join(tmpdir(),'ecoquest-test-'));
  const dbPath = path.join(temp,'test.sqlite');
  const port = 3200 + Math.floor(Math.random()*500);
  let processHandle;
  async function start() { processHandle = spawn(process.execPath, ['server.js'], { cwd:root, env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_PATH:dbPath,NODE_ENV:'test',DB_DRIVER:driver,TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:'',RENDER:'',REQUIRE_TURSO:''},stdio:['ignore','pipe','pipe'] });
    await new Promise((resolve,reject) => { const timer = setTimeout(() => reject(new Error('Server did not start')),10000); processHandle.stdout.on('data', data => { if (data.toString().includes('running')) { clearTimeout(timer); resolve(); } }); processHandle.on('error',reject); processHandle.on('exit',code => { if(code) reject(new Error('Server exited '+code)); }); }); }
  async function stop() { if (!processHandle || processHandle.exitCode !== null) return; const exited = new Promise(resolve => processHandle.once('exit', resolve)); processHandle.kill(); await exited; }
  async function request(route, data, cookie) { const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, {method:data === undefined ? 'GET':'POST',headers:{...(data === undefined ? {} : {'Content-Type':'application/json'}),...(cookie ? {Cookie:cookie}:{})},body:data === undefined ? undefined:JSON.stringify(data)}); return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}; }
  async function register(username) { const r = await request('register',{username,password:'GreenPlanet123!'}); assert.equal(r.status,200); assert.match(r.cookie,/eco_session=/); return r.cookie; }
  async function finish(cookie,score) { let r = await request('quizzes',{},cookie); assert.equal(r.status,200); const quiz = r.data;
    assert.equal(quiz.questions.length,10); assert.equal(new Set(quiz.questions.map(q=>q.id)).size,10);
    assert.deepEqual(quiz.questions.reduce((a,q)=>(a[q.difficulty]++,a),{easy:0,medium:0,hard:0}),{easy:4,medium:4,hard:2});
    assert.ok(quiz.questions.every(q=>!('correct' in q) && !('explanation' in q) && !('hint' in q)));
    for(let i=0;i<10;i++) { const q=quiz.questions[i], original=bank.find(b=>b.id===q.id), correct=q.choices.indexOf(original.choices[original.correct]); const choice=i<score/10?correct:(correct+1)%4; r=await request(`quizzes/${quiz.id}/answer`,{index:i,choice},cookie); assert.equal(r.status,200); }
    const submissions=await Promise.all([request(`quizzes/${quiz.id}/submit`,{score:100000},cookie),request(`quizzes/${quiz.id}/submit`,{},cookie)]);
    assert.ok(submissions.every(s=>s.status===200 && s.data.score===score)); return quiz.id;
  }
  try { await start();
    assert.deepEqual((await request('health')).data,{status:'ok',database:driver === 'sqlite' ? 'sqlite' : 'libsql-local-test'});
    assert.equal((await request('register',null)).status,400);
    assert.ok(bank.length>=800); assert.equal((await request('quizzes',{})).status,401);
    assert.equal((await request('register',{username:'ab',password:'short'})).status,400);
    const alice=await register('EcoAlice');
    assert.equal((await request('register',{username:'ecoalice',password:'GreenPlanet123!'})).status,409);
    assert.equal((await request('login',{username:'EcoAlice',password:'wrong-password'})).status,401);
    const logged=await request('login',{username:'ecoalice',password:'GreenPlanet123!'}); assert.equal(logged.status,200);
    const started=await Promise.all([request('quizzes',{},alice),request('quizzes',{},alice)]);
    assert.ok(started.every(r=>r.status===200)); assert.equal(started[0].data.id,started[1].data.id);
    let q=started[0].data;
    assert.equal((await request('quizzes',{},alice)).data.id,q.id);
    assert.equal((await request(`quizzes/${q.id}/submit`,{},alice)).status,400);
    assert.equal((await request(`quizzes/${q.id}/result`,undefined,alice)).status,409);
    const attempts=await Promise.all([request(`quizzes/${q.id}/lifeline`,{type:'fifty',index:0},alice),request(`quizzes/${q.id}/lifeline`,{type:'fifty',index:0},alice)]);
    assert.deepEqual(attempts.map(a=>a.status).sort(),[200,409]);
    const fifty=attempts.find(a=>a.status===200).data.lifelines.fifty;
    assert.equal(fifty.removed.length,2);
    const original=bank.find(b=>b.id===q.questions[0].id), correct=q.questions[0].choices.indexOf(original.choices[0]);
    assert.ok(!fifty.removed.includes(correct));
    assert.equal((await request(`quizzes/${q.id}/answer`,{index:0,choice:fifty.removed[0]},alice)).status,400);
    assert.equal((await request(`quizzes/${q.id}/lifeline`,{type:'hint',index:0},alice)).status,200);
    assert.equal((await request(`quizzes/${q.id}/lifeline`,{type:'hint',index:0},alice)).status,409);
    assert.equal((await request(`quizzes/${q.id}/lifeline`,{type:'skip',index:0},alice)).status,400);
    const bob=await register('EcoBob');
    assert.equal((await request(`quizzes/${q.id}`,undefined,bob)).status,404);
    const bobQuiz=(await request('quizzes',{},bob)).data;
    const differentLifelines=await Promise.all(['fifty','hint'].map(type=>request(`quizzes/${bobQuiz.id}/lifeline`,{type,index:0},bob)));
    assert.ok(differentLifelines.every(r=>r.status===200));
    assert.deepEqual(Object.keys((await request(`quizzes/${bobQuiz.id}`,undefined,bob)).data.lifelines).sort(),['fifty','hint']);
    const aliceQuiz=await finish(alice,100);
    const repeated=await request(`quizzes/${aliceQuiz}/submit`,{},alice); assert.equal(repeated.data.profile.quizzes,1);
    const concurrentSubmits=await Promise.all([request(`quizzes/${aliceQuiz}/submit`,{},alice),request(`quizzes/${aliceQuiz}/submit`,{},alice)]);
    assert.ok(concurrentSubmits.every(r=>r.status===200 && r.data.profile.quizzes===1 && r.data.profile.xp===100));
    await finish(bob,100);
    const carol=await register('EcoCarol'); await finish(carol,80);
    const leaders=(await request('leaderboard')).data.players;
    assert.deepEqual(leaders.map(p=>[p.username,p.rank,p.best]),[['EcoAlice',1,100],['EcoBob',1,100],['EcoCarol',3,80]]);
    await finish(alice,40); const profile=(await request('me',undefined,alice)).data.user;
    assert.equal(profile.quizzes,2); assert.equal(profile.best,100); assert.equal(profile.xp,140); assert.equal(profile.rank,1);
    const historyResult=(await request(`quizzes/${aliceQuiz}/result`,undefined,alice)).data;
    assert.equal(historyResult.companion.firstQuiz,true); assert.equal(historyResult.companion.mood,'happy');
    const lower=(await request(`quizzes/${profile.history[0].id}/result`,undefined,alice)).data;
    assert.equal(lower.companion.mood,'angry'); assert.equal(lower.companion.previousBest,100);
    const improvedId=await finish(carol,90); const improved=(await request(`quizzes/${improvedId}/result`,undefined,carol)).data;
    assert.equal(improved.companion.mood,'happy'); assert.equal(improved.companion.firstQuiz,false); assert.equal(improved.companion.previousBest,80);
    const tieId=await finish(carol,90); assert.equal((await request(`quizzes/${tieId}/result`,undefined,carol)).data.companion.mood,'calm');
    const sqlite=new DatabaseSync(dbPath); const saved=sqlite.prepare('SELECT password,salt FROM users WHERE username=?').get('EcoAlice'); assert.notEqual(saved.password,'GreenPlanet123!'); assert.equal(saved.password.length,128); assert.equal(saved.salt.length,32); sqlite.close();
    await stop(); await start(); assert.equal((await request('me',undefined,alice)).data.user.xp,140);
    assert.equal((await request(`quizzes/${aliceQuiz}/result`,undefined,alice)).data.review.length,10);
    assert.equal((await request('logout',{},alice)).status,200); assert.equal((await request('me',undefined,alice)).data.user,null);
    assert.equal((await request('quizzes',{},alice)).status,401);
  } finally { await stop(); rmSync(temp,{recursive:true,force:true}); }
});
