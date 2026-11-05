'use client';
import {useEffect,useRef,useState} from 'react';
import {roster,parisDay,summarize,validateExercise,pushupCredit,exerciseEffect,exerciseDescription,formatNumber} from '../lib/domain.mjs';

type ExerciseType='pushups'|'plank'|'crunches';
type Declaration={id:string;player:string;type:ExerciseType;count:number;day:string};
type State={results:any[];exercises:(Declaration&{created:string})[];collectors:{last_seen:string}[]};

export default function Dashboard(){
 const [data,setData]=useState<State|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [day,setDay]=useState(parisDay()),[player,setPlayer]=useState(roster[0]),[type,setType]=useState<ExerciseType>('pushups'),[count,setCount]=useState(5);
 const [busy,setBusy]=useState(false),[test,setTest]=useState(false),[pending,setPending]=useState<Declaration|null>(null);
 const refreshRequest=useRef(0);
 const submissionInFlight=useRef(false);
 async function refresh(){
  const request=++refreshRequest.current;
  try{const r=await fetch('/api/state');if(!r.ok)throw Error('Impossible de charger les résultats. Vérifie ta connexion.');const state=await r.json() as State;if(request!==refreshRequest.current)return null;setData(state);setError('');return state;}
  catch(e){if(request===refreshRequest.current)setError((e as Error).message);return null;}
 }
 useEffect(()=>{
  refresh();const t=setInterval(refresh,15000);
  try{
   const stored=localStorage.getItem('rl-pending');
   if(stored){const p=validateExercise(JSON.parse(stored)) as Declaration;setPending(p);setPlayer(p.player);setType(p.type);setCount(p.type==='plank'?p.count/60:p.count);}
  }catch{}
  return()=>clearInterval(t);
 },[]);
 async function submit(){
  if(submissionInFlight.current)return;
  submissionInFlight.current=true;
  setBusy(true);setNotice('');setError('');
  try{
   const payload=pending||{id:crypto.randomUUID(),player,type,count:type==='plank'?count*60:count,day:parisDay()};
   setPending(payload);
   // A storage restriction must not prevent saving the exercise on the server.
   try{localStorage.setItem('rl-pending',JSON.stringify(payload));}catch{}
   const r=await fetch('/api/exercise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const j=await r.json() as {error?:string};if(!r.ok)throw Error(j.error||'Impossible d’enregistrer cet exercice.');
   setPending(null);try{localStorage.removeItem('rl-pending');}catch{}
   setNotice(`Exercice enregistré pour ${payload.player} : ${exerciseDescription(payload)}.`);
   const state=await refresh();
   if(state){const updated=summarize(state.results,state.exercises,'').find((p:any)=>p.name===payload.player)!;setNotice(`Exercice enregistré pour ${payload.player} : ${exerciseDescription(payload)}. Solde restant : ${formatNumber(updated.remaining)} pompes.`);}
  }catch(e){setError((e as Error).message);}finally{submissionInFlight.current=false;setBusy(false);}
 }
 const stats=data?summarize(data.results,data.exercises,day):[];
 const rows=data?.results.filter((r:any)=>(!day||r.day===day)&&(test||r.kind==='match'))||[];
 const exercises=data?.exercises.filter((e:any)=>!day||e.day===day)||[];
 const draft=pending||{type,count:type==='plank'?count*60:count};
 const selected=stats.find((p:any)=>p.name===(pending?.player||player));
 const effect=selected&&Number.isFinite(draft.count)&&draft.count>0?exerciseEffect(selected.remaining,draft):null;
 return <main>
  <header><a className="brand" href="/">RL<span> / </span>POMPES</a><span className="pill">LE CLUB DES MAUVAIS PERDANTS</span></header>
  <section className="intro"><div><p className="eyebrow">ROCKET LEAGUE · NOTRE ÉQUIPE</p><h1>On perd ensemble.<br/><em>On pousse ensemble.</em></h1><p className="muted">Une défaite, 5 pompes. Pompes, gainage ou abdos : chaque effort compte.</p></div><div className="rule"><strong>5</strong><span>POMPES / DÉFAITE</span><small>Bonus dernier aux points désactivé</small></div></section>
  {error&&<p className="alert" role="alert">{error} <button onClick={refresh}>Actualiser</button></p>}
  <section>
   <div className="section-title"><h2>Le tableau de l’équipe</h2><div className="filters"><label>Date <input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><button onClick={()=>setDay('')}>Tout</button><button onClick={()=>setDay(parisDay())}>Aujourd’hui</button></div></div>
   <p className="muted small">Matchs et historique sur la date choisie · Dette et totaux d’exercices cumulés depuis le début.</p>
   <div className="cards">{!data?<p>Chargement de l’équipe…</p>:stats.map((p:any,i:number)=><article className="card" key={p.name}>
    <div className="card-top"><span className="avatar">{['CT','NK','K7'][i]}</span><span className="platform">{i===2?'PS5':'PC'}</span></div>
    <h3>{p.name}</h3><div className="results"><span><b>{p.played}</b> parties</span><span className="win"><b>{p.wins}</b> victoires</span><span><b>{p.losses}</b> défaites</span></div>
    <div className="debt"><strong>{formatNumber(p.remaining)}</strong><span>pompes restantes</span></div>
    <div className="progress"><i style={{width:`${p.due?Math.min(100,p.done/p.due*100):100}%`}}/></div>
    <p className="small muted">{formatNumber(p.done)} équiv. pompes réalisés · {p.due} dues au total</p>
    <dl className="exercise-totals"><div><dt>Pompes</dt><dd>{formatNumber(p.pushups)}</dd></div><div><dt>Gainage (min)</dt><dd>{formatNumber(p.plankSeconds/60)}</dd></div><div><dt>Abdos</dt><dd>{formatNumber(p.crunches)}</dd></div></dl>
    <button onClick={()=>{if(!pending&&!busy)setPlayer(p.name);document.getElementById('exercise')?.scrollIntoView({behavior:'smooth'});}}>Déclarer un exercice ↗</button>
   </article>)}</div>
  </section>
  <div className="bottom">
   <div className="histories">
    <section className="history"><div className="section-title"><h2>Les derniers matchs</h2><label className="small"><input type="checkbox" checked={test} onChange={e=>setTest(e.target.checked)}/> Inclure les tests bots</label></div><div className="table-wrap"><table><thead><tr><th>Date / joueur</th><th>Résultat</th><th>Points</th><th>Pompes</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.match_guid+r.player_id}><td><b>{r.name}</b><small>{r.day} {r.kind==='test'?'· Test bots':''}</small></td><td><span className={r.team===r.winner?'badge victory':'badge defeat'}>{r.team===r.winner?'Victoire':'Défaite'}</span></td><td>{r.score}</td><td>{r.kind==='match'&&r.team!==r.winner?'+5':'0'}</td></tr>)}</tbody></table>{!rows.length&&<p className="empty">Aucun match enregistré pour cette période.</p>}</div></section>
    <section className="history exercise-history"><h2>Historique des exercices</h2><p className="small muted">Toutes les séries sont conservées, même une fois la dette réglée.</p><div className="table-wrap"><table><thead><tr><th>Date / joueur</th><th>Exercice réalisé</th><th>Équiv. pompes</th></tr></thead><tbody>{exercises.map((e:any)=><tr key={e.id}><td><b>{e.player}</b><small>{e.day} · {new Date(e.created).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'})}</small></td><td>{exerciseDescription(e)}</td><td className="win">−{formatNumber(pushupCredit(e))}</td></tr>)}</tbody></table>{!exercises.length&&<p className="empty">Aucun exercice enregistré pour cette période.</p>}</div></section>
   </div>
   <section id="exercise" className="exercise">
    <p className="eyebrow">À TOI DE JOUER</p><h2>Déclarer un exercice</h2><p className="muted">Choisis ton effort pour réduire ta dette.</p>
    <div className="equivalences"><p>1 min de gainage = <b>15 pompes</b></p><p>20 abdos = <b>10 pompes</b></p></div>
    <form onSubmit={e=>{e.preventDefault();submit();}}>
     <label>Joueur<select value={player} disabled={!!pending||busy} onChange={e=>setPlayer(e.target.value)}>{roster.map((p:string)=><option key={p}>{p}</option>)}</select></label>
     <label>Exercice<select value={type} disabled={!!pending||busy} onChange={e=>{const next=e.target.value as ExerciseType;setType(next);setCount(next==='plank'?1:next==='crunches'?20:5);}}><option value="pushups">Pompes</option><option value="plank">Gainage</option><option value="crunches">Abdos</option></select></label>
     <label>{type==='plank'?'Durée de gainage (minutes)':type==='crunches'?'Nombre d’abdos':'Nombre de pompes'}<input type="number" min={type==='plank'?0.25:1} step={type==='plank'?0.25:1} max={type==='plank'?1000:10000} required value={Number.isNaN(count)?'':count} disabled={!!pending||busy} onChange={e=>setCount(e.target.valueAsNumber)} aria-describedby="exercise-credit"/></label>
     {type==='plank'&&<p className="small muted">Par tranches de 15 secondes : 0,25 min = 15 s ; 0,5 min = 30 s.</p>}
     <div id="exercise-credit" className="credit" aria-live="polite">{effect?<><p>Équivalent : {formatNumber(effect.equivalent)} pompes.</p><p>Dette actuelle : {formatNumber(selected?.remaining??0)} pompes · Réduction : {formatNumber(effect.reduction)} · Restant : {formatNumber(effect.remaining)}.</p>{effect.excess>0&&<p className="small muted">Cette série dépasse la dette actuelle de {formatNumber(effect.excess)} équiv. pompes. Le solde restera à zéro et toute la série sera conservée dans l’historique et les totaux.</p>}</>:<p>{Number.isFinite(draft.count)&&draft.count>0?'Chargement du solde…':'Saisis une quantité pour voir l’équivalence.'}</p>}</div>
     <button className="primary" disabled={busy}>{busy?'Enregistrement…':pending?'Réessayer la déclaration':'Valider mon exercice →'}</button>
     {pending&&<p className="small">Déclaration en attente : {exerciseDescription(pending)} pour {pending.player}. Réessayer ne la comptera pas deux fois.</p>}
    </form>
    {notice&&<p role="status" className="win">{notice}</p>}
    <p className="small muted">Déclaration pour aujourd’hui. Le solde reste à zéro minimum ; tous les efforts sont comptabilisés et conservés.</p>
   </section>
  </div>
  <footer><span>RL-POMPES · {data?.collectors.length?`Dernière synchronisation : ${new Date(data.collectors[0].last_seen).toLocaleString('fr-FR')}`:'En attente du premier collecteur PC'}</span><p>Kevin : collecte PS5 à vérifier lors d’une partie avec un joueur PC. Tests bots exclus du bilan. Actualisation toutes les 15 secondes.</p><a href="/signout-with-chatgpt?return_to=%2F" target="_top">Se déconnecter</a></footer>
 </main>;
}
