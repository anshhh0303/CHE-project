import { monster } from './companion.js';
// All effects are local: no animation libraries, trackers, or external assets.
const preference = key => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Private browser modes can disable storage. */ } };
const media = matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = preference('eq-motion') === 'off' || media.matches;
let soundOn = preference('eq-sound') === 'on', audio, lastFrame = 0, animationId;
let volume = Math.max(0,Math.min(1,Number(preference('eq-volume') ?? '.7'))), lastTone=0;
let orb = null, orbAngle = 0, boost = 0, lastScene = '', particleWidth = 0, particleHeight = 0;
const pointer = { x: -1000, y: -1000 }, particles = [], sparks = [];
const canvas = document.querySelector('#ambient-field'), context = canvas.getContext('2d');
const facts = [
  ['Ocean network', 'Oceans absorb heat and carbon dioxide. Protecting marine ecosystems supports the systems that help regulate our climate.'],
  ['Forest network', 'Trees store carbon in their tissues. Protecting existing forests matters alongside planting new trees.'],
  ['Water network', 'Groundwater is stored in the pores and cracks of rock. Saving water helps protect a resource that replenishes at different rates.'],
  ['Biodiversity network', 'A food web links many organisms. Changes to one population can affect the rest of an ecosystem.'],
  ['Resource network', 'Repair and reuse can extend a product’s life, reducing the demand for new raw materials.'],
];
let scans = 0;
export function arcadeDashboard(state, icon, escape, stats, lifeCards, boardRows, emptyBoard) {
  return `<div class="arcade-intro"><div class="eyebrow"><span class="status-light"></span> EARTH IS ONLINE. ARE YOU?</div><span class="arcade-coordinate">MISSION CONTROL <span>01 / EARTH</span></span></div>
  <section class="hero arcade-hero"><div class="hero-copy"><div class="hero-tag">${icon('bolt')} ENVIRONMENTAL KNOWLEDGE / RELOADED</div><h1 class="arcade-title">SMALL PLANET.<br><span class="outline-word">BIG</span> <span class="glitch-word" data-text="ENERGY.">ENERGY.</span></h1><p>Outsmart the questions. Unlock your potential.<br>The next generation of planet people starts here.</p><div class="hero-actions"><button class="button lime launch-button" data-action="start"><span>${state.user?.activeQuiz ? 'RESUME MISSION' : 'ENTER THE QUIZ'}</span>${icon('arrow')}</button><span class="hero-time">10 QUESTIONS<br>2 LIFELINES / 100 POINTS</span></div><div class="hero-bottom"><span class="tiny-cross">+</span><span>${state.user ? `PILOT: ${escape(state.user.username.toUpperCase())}` : 'YOUR CURIOSITY IS THE ONLY ENTRY REQUIREMENT.'}</span></div></div>
  <div class="hero-art holo-system"><div class="orb-coordinate">TARGET: HOME<br><span>23.4° / AXIAL TILT</span></div><div class="orb-ring ring-a"></div><div class="orb-ring ring-b"></div><button class="planet-scanner" data-action="scan" aria-label="Scan the holographic Earth for an environmental fact"><canvas class="orb-canvas" aria-hidden="true"></canvas><span class="orb-reticle" aria-hidden="true">⌖</span></button><span class="orb-hint">[ CLICK THE PLANET TO SCAN ]</span><div class="orbit-readout"><span class="status-light"></span> BIOSPHERE CONNECTED<span>LIVE VISUAL / NOT SENSOR DATA</span></div><span class="orb-star" aria-hidden="true">✳</span></div></section>
  <div class="signal-feed"><span class="signal-label">${icon('globe')} PLANET SIGNAL</span><p id="scan-message" aria-live="polite">Tap the hologram. Pick up a little knowledge from home.</p><span id="scan-count">00 / 05</span></div>
  <div class="marquee" aria-hidden="true"><div>${Array.from({length:4},()=>'<span>STAY CURIOUS</span> ✳ <span>PLAY FOR THE PLANET</span> ✳ <span>KNOW MORE. DO BETTER.</span> ✳ ').join('')}</div></div>
  <div class="section-divider"><h2>YOUR PLAYER STATS</h2><span>PROGRESS, NOT GUESSWORK. ${state.user ? '' : 'LOG IN TO SAVE YOURS.'}</span></div>${stats()}
  <div class="content-grid arcade-grid"><section class="panel"><div class="section-top"><h2><span class="section-index">01 /</span> YOUR POWER-UPS</h2><span class="text-link">USE WISELY</span></div><p class="panel-desc">A little backup when your brain hits a loading screen.</p>${lifeCards()}<div class="panel-bottom">${icon('shield')} One of each. No penalties. No skip button.</div></section><section class="panel league-panel"><div class="section-top"><h2><span class="section-index">02 /</span> THE GREEN LEAGUE</h2><a class="text-link" href="#leaderboard">ALL PLAYERS ↗</a></div><p class="panel-desc">Real players. Best scores. Your next rival could be a friend.</p>${state.board.length ? boardRows(state.board.slice(0,3)) : emptyBoard()}</section></div>
  <section class="field-notes"><div class="section-divider"><h2>OFF-SCREEN SIDE QUESTS</h2><span>CLICK A CARD. TAKE THE IDEA INTO REAL LIFE.</span></div><div class="field-grid">${[
    ['water','01','WATER','Make every drop count.','Repair a leaking tap. Small leaks add up over time; fix the source instead of just collecting the drips.'],
    ['recycle','02','WASTE','Break the throwaway loop.','Before replacing an item, ask: can I repair it, reuse it, or pass it on? Check local recycling rules when disposal is necessary.'],
    ['bolt','03','ENERGY','Power down. Level up.','Turn off unused lights and equipment. Choose efficient appliances and use only the energy you need.']
  ].map(([i,n,t,h,f])=>`<button class="field-card" data-action="field" aria-expanded="false"><span class="field-meta">${icon(i)} ${t}<span>${n} ↗</span></span><span class="field-front">${h}</span><span class="field-back">${f}</span><span class="field-bottom">REVEAL YOUR SIDE QUEST <span>+</span></span></button>`).join('')}</div></section>
  <div class="topic-strip"><span class="topic-strip-label">THE QUESTION NETWORK</span><div class="topic-tags">${['Climate','Biodiversity','Water','Energy','Waste'].map((t,i)=>`<span class="topic-tag">${icon(['wind','leaf','water','bolt','recycle'][i])}${t}</span>`).join('')}</div><span>${state.meta.questions.toLocaleString()} QUESTIONS / RANDOM EVERY ROUND</span></div>`;
}

function resize() {
  particleWidth = innerWidth; particleHeight = innerHeight;
  const ratio = Math.min(devicePixelRatio || 1, 1.5);
  canvas.width = particleWidth * ratio; canvas.height = particleHeight * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  particles.length = 0;
  for (let i = 0; i < (innerWidth < 620 ? 24 : 54); i++) particles.push({x:Math.random()*particleWidth,y:Math.random()*particleHeight,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3});
}
// Stylised continent silhouettes; this visual is decorative, not a geographic dataset.
const continents = [
  [[-168,65],[-135,70],[-108,58],[-60,50],[-78,25],[-100,15],[-120,32],[-155,55]],
  [[-82,12],[-47,0],[-36,-10],[-57,-54],[-75,-30]],
  [[-18,35],[10,37],[40,12],[48,-15],[20,-35],[5,-25],[-15,8]],
  [[-10,38],[10,70],[60,72],[100,58],[145,60],[160,45],[118,20],[105,5],[80,8],[65,30],[30,40]],
  [[112,-12],[138,-10],[154,-25],[145,-40],[115,-32]],
  [[-55,80],[-22,78],[-40,60]],
];
function inside(lon,lat,polygon) { let inLand=false; for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) { const a=polygon[i],b=polygon[j]; if((a[1]>lat)!==(b[1]>lat)&&lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]) inLand=!inLand; } return inLand; }
const land = [];
for(let lat=-60;lat<=78;lat+=4) for(let lon=-180;lon<180;lon+=4) if(continents.some(p=>inside(lon,lat,p))) land.push([lon*Math.PI/180,lat*Math.PI/180]);
function drawGlobe() {
  const c = orb?.getContext('2d'); if (!c) return;
  const w=orb.clientWidth,h=orb.clientHeight,ratio=Math.min(devicePixelRatio || 1,1.5);
  if(orb.width!==Math.round(w*ratio)||orb.height!==Math.round(h*ratio)) {orb.width=Math.round(w*ratio);orb.height=Math.round(h*ratio);}
  c.setTransform(ratio,0,0,ratio,0,0); c.clearRect(0,0,w,h);
  const r=Math.min(w,h)*.34,cx=w/2,cy=h/2;
  const project=(lon,lat)=> {const x=Math.cos(lat)*Math.sin(lon+orbAngle),z=Math.cos(lat)*Math.cos(lon+orbAngle),y=Math.sin(lat); const tilt=-.21; return [cx+r*(x*Math.cos(tilt)-y*Math.sin(tilt)),cy-r*(x*Math.sin(tilt)+y*Math.cos(tilt)),z];};
  const glow=c.createRadialGradient(cx,cy,0,cx,cy,r*1.35);glow.addColorStop(0,'#10362988');glow.addColorStop(.7,'#072c2b55');glow.addColorStop(1,'#07101d00');c.fillStyle=glow;c.fillRect(0,0,w,h);
  c.strokeStyle='#8fffba55';c.lineWidth=1;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();
  function line(points) {c.beginPath(); let visible=false; for(const [x,y,z] of points) {if(z<0){visible=false;continue;}if(!visible)c.moveTo(x,y);else c.lineTo(x,y);visible=true;}c.stroke();}
  c.strokeStyle='#54dccb24';c.lineWidth=.7;
  for(let lat=-60;lat<=60;lat+=20) line(Array.from({length:121},(_,i)=>project(i/120*Math.PI*2,lat*Math.PI/180)));
  for(let lon=0;lon<360;lon+=20) line(Array.from({length:61},(_,i)=>project(lon*Math.PI/180,(-90+i*3)*Math.PI/180)));
  for(const [lon,lat] of land){const[x,y,z]=project(lon,lat);if(z<0)continue;c.fillStyle=`rgba(180,255,91,${.25+.75*z})`;c.fillRect(x-1,y-1,2.1,2.1);}
  c.strokeStyle='#bcff6733';c.beginPath();c.ellipse(cx,cy,r*1.24,r*.25,-.32,0,Math.PI*2);c.stroke();
  if(boost>0){c.strokeStyle=`rgba(90,243,241,${boost/35})`;c.beginPath();c.arc(cx,cy,r*(1.1+(35-boost)/45),0,Math.PI*2);c.stroke();boost--;}
}
function tick(time) {
  animationId = requestAnimationFrame(tick);
  if (document.hidden || time-lastFrame < 32) return;
  lastFrame=time;
  if (!motionPaused) {
    context.clearRect(0,0,particleWidth,particleHeight);
    for(const p of particles) {p.x=(p.x+p.vx+particleWidth)%particleWidth;p.y=(p.y+p.vy+particleHeight)%particleHeight;context.fillStyle='#86efbb60';context.fillRect(p.x,p.y,1.5,1.5);}
    for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){const a=particles[i],b=particles[j],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance<110){context.strokeStyle=`rgba(80,218,216,${(1-distance/110)*.07})`;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}}
    for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.04;p.life--;context.fillStyle=p.color;context.globalAlpha=p.life/50;context.fillRect(p.x,p.y,3,3);if(p.life<=0)sparks.splice(i,1);}context.globalAlpha=1;
    orbAngle+=.0035+(boost>0?.014:0);
    drawGlobe();
  }
}
export function burst(x=innerWidth/2,y=innerHeight*.4,count=28) {
  if(motionPaused)return;
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=1+Math.random()*5;sparks.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1,life:50,color:['#b9ff66','#57e9e7','#ff67bc'][i%3]});}
  if(sparks.length>180)sparks.splice(0,sparks.length-180);
}
export function tone(kind='click') {
  if(!soundOn||volume===0)return;
  const nowMs=performance.now();if(kind==='hover'&&nowMs-lastTone<160)return;lastTone=nowMs;
  const tunes={click:[330,440],hover:[740],scan:[220,440,880],field:[392,523],lifeline:[262,392,523],answer:[440,660],success:[523,659,784,1047],happy:[523,784,1047,1319],angry:[220,185,147],calm:[392,523,392],toggle:[440,880]};
  try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const notes=tunes[kind]||tunes.click,now=audio.currentTime;
    notes.forEach((frequency,i)=>{const oscillator=audio.createOscillator(),gain=audio.createGain(),start=now+i*.085;oscillator.connect(gain);gain.connect(audio.destination);oscillator.type=kind==='angry'?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,start);const peak=volume*(kind==='hover'?.07:.19);gain.gain.setValueAtTime(.001,start);gain.gain.linearRampToValueAtTime(peak,start+.012);gain.gain.exponentialRampToValueAtTime(.001,start+.16);oscillator.start(start);oscillator.stop(start+.18);});
  }catch{/* Sound is optional on unsupported browsers. */}
}
function syncControls(){document.body.classList.toggle('motion-paused',motionPaused);const m=document.querySelector('#motion-toggle'),s=document.querySelector('#sound-toggle');m.textContent=motionPaused?'FX: OFF':'FX: ON';m.setAttribute('aria-pressed',String(motionPaused));m.title=motionPaused?'Enable decorative animations':'Pause decorative animations';s.textContent=soundOn?'SOUND: ON':'SOUND: OFF';s.setAttribute('aria-pressed',String(soundOn));s.title=soundOn?'Mute arcade sounds':'Enable optional arcade sounds';if(motionPaused){context.clearRect(0,0,particleWidth,particleHeight);drawGlobe();}}
export function mountScene() {
  document.querySelectorAll('.choice').forEach(choice=>{choice.insertAdjacentHTML('beforeend',`<span class="option-monster" aria-hidden="true">${monster('thinking')}<span class="monster-whisper">hmm…</span></span>`);});
  orb=document.querySelector('.orb-canvas');
  const question=document.querySelector('.quiz-meta strong')?.textContent || '';
  const key=location.hash+question;
  if(lastScene!==key){lastScene=key;const main=document.querySelector('#main');if(!motionPaused)main.animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}],{duration:420,easing:'cubic-bezier(.2,.7,.2,1)'});}
  drawGlobe();
  if(orb){scans=0;boost=0;}
  const score=document.querySelector('.result-score');
  if(score&&!score.dataset.animated){score.dataset.animated='true';if(!motionPaused){score.animate([{transform:'scale(.8)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:650,easing:'cubic-bezier(.2,.8,.2,1)'});const rect=score.getBoundingClientRect();burst(rect.x+rect.width/2,rect.y,70);
    const text=score.firstChild,target=parseInt(text.nodeValue,10),start=performance.now();score.setAttribute('aria-label',`${target} out of 100`);
    const count=time=>{if(!score.isConnected)return;const progress=Math.min((time-start)/800,1);text.nodeValue=String(Math.round(target*(1-(1-progress)**3)));if(progress<1&&!motionPaused)requestAnimationFrame(count);else text.nodeValue=String(target);};requestAnimationFrame(count);
  } }
}
document.querySelector('#motion-toggle').addEventListener('click',()=>{motionPaused=!motionPaused;save('eq-motion',motionPaused?'off':'on');syncControls();});
document.querySelector('#sound-toggle').addEventListener('click',()=>{soundOn=!soundOn;save('eq-sound',soundOn?'on':'off');syncControls();tone('toggle');});
const volumeInput=document.querySelector('#sound-volume');volumeInput.value=Math.round(volume*100);document.querySelector('#volume-value').textContent=`${volumeInput.value}%`;
volumeInput.addEventListener('input',()=>{volume=Number(volumeInput.value)/100;save('eq-volume',String(volume));document.querySelector('#volume-value').textContent=`${volumeInput.value}%`;});
volumeInput.addEventListener('change',()=>tone('toggle'));
document.addEventListener('pointerover',event=>{const target=event.target.closest('.choice:not(:disabled),nav a');if(target&&!target.contains(event.relatedTarget))tone('hover');});
document.addEventListener('focusin',event=>{if(event.target.matches('.choice:not(:disabled),nav a'))tone('hover');});
media.addEventListener('change',event=>{if(event.matches){motionPaused=true;syncControls();}});
document.addEventListener('pointermove',event=>{pointer.x=event.clientX;pointer.y=event.clientY;if(motionPaused||event.pointerType!=='mouse')return;const card=event.target.closest('.field-card,.lifeline-card,.holo-system');if(card){const r=card.getBoundingClientRect();card.style.setProperty('--rx',`${-(event.clientY-r.y-r.height/2)/25}deg`);card.style.setProperty('--ry',`${(event.clientX-r.x-r.width/2)/25}deg`);}});
document.addEventListener('pointerout',event=>{const card=event.target.closest?.('.field-card,.lifeline-card,.holo-system');if(card&&!card.contains(event.relatedTarget)){card.style.setProperty('--rx','0deg');card.style.setProperty('--ry','0deg');}});
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a');if(!button||button.disabled)return;
  if(!button.id.endsWith('-toggle'))tone(button.dataset.life?'lifeline':button.dataset.action==='scan'?'scan':button.dataset.action==='field'?'field':button.dataset.action==='answer'?'answer':'click');
  if(button.dataset.action==='scan'){const fact=facts[scans%facts.length];scans++;boost=35;document.querySelector('#scan-message').textContent=`${fact[0].toUpperCase()} / ${fact[1]}`;document.querySelector('#scan-count').textContent=`${String((scans-1)%5+1).padStart(2,'0')} / 05`;const r=button.getBoundingClientRect();burst(r.x+r.width/2,r.y+r.height/2,24);if(!motionPaused)button.animate([{transform:'scale(1)'},{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:400});}
  if(button.dataset.action==='field'){const expanded=button.classList.toggle('is-flipped');button.setAttribute('aria-expanded',String(expanded));button.querySelector('.field-bottom').innerHTML=expanded?'SIDE QUEST ACCEPTED <span>✓</span>':'REVEAL YOUR SIDE QUEST <span>+</span>';if(!motionPaused)button.animate([{opacity:.65,transform:'rotateY(-7deg)'},{opacity:1,transform:'rotateY(0)'}],{duration:350});}
  if(button.dataset.choice!==undefined||button.dataset.life){const r=button.getBoundingClientRect();burst(r.right-20,r.y+r.height/2,12);}
});
window.addEventListener('resize',resize);
window.addEventListener('pagehide',()=>cancelAnimationFrame(animationId));
window.addEventListener('pageshow',event=>{if(event.persisted)animationId=requestAnimationFrame(tick);});
resize();syncControls();animationId=requestAnimationFrame(tick);
