'use client';
import {useEffect,useRef,useState} from 'react';
import {doublesRankOptions} from '../lib/doubles-ranks.mjs';

type MonthlyRow={player:string;mmr:number|null;recordedAt:string|null;confirmedForClose:boolean;source?:string;sourceUrl?:string|null};
type MonthResult={month:string;cutoffAt:string;lastDay:string;rows:MonthlyRow[];status:string;missing:string[];losers?:string[];closedAt?:string};
type DrinkDebt={id:string;month:string;payer:string;recipient:string;paidAt:string|null;canSettle:boolean;canUndo:boolean};
export type MonthlyState={startsMonth:string;current:MonthResult;closed:MonthResult[];allowedPlayers:string[];debts:DrinkDebt[];publicSync?:{status:string;lastAttempt:string|null;nextAttempt:string|null;profiles:{player:string;url:string}[];errors?:{player:string;error:string}[]}};
type Pending={id:string;player:string;mmr:number;tier:number|null;division:number|null};
const pendingKey='rl-monthly-mmr-pending';
const dateLabel=(date:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
const monthLabel=(month:string)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',month:'long',year:'numeric'}).format(new Date(month+'-15T12:00:00Z'));

export default function MonthlyMmr({data,onRefresh}:{data:MonthlyState;onRefresh:()=>Promise<unknown>}){
 const [player,setPlayer]=useState(data.allowedPlayers[0]||''),[mmr,setMmr]=useState(''),[tier,setTier]=useState(''),[division,setDivision]=useState('1');
 const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const writing=useRef(false);
 useEffect(()=>{
  try{const raw=JSON.parse(localStorage.getItem(pendingKey)||'null') as Pending|null;if(raw?.id&&data.allowedPlayers.includes(raw.player)){setPending(raw);setPlayer(raw.player);setMmr(String(raw.mmr));setTier(raw.tier===null?'':String(raw.tier));setDivision(String(raw.division||1));}}catch{}
  let active=true,running=false;
  const closeDue=async()=>{if(!active||running||(typeof document!=='undefined'&&document.hidden))return;running=true;try{const r=await fetch('/api/monthly',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh'})});const result=r.ok?await r.json() as {closed?:number}:null;if(active&&result?.closed)await onRefresh();}catch{}finally{running=false;}};
  closeDue();const timer=setInterval(closeDue,60000);
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',closeDue);
  return()=>{active=false;clearInterval(timer);if(typeof document!=='undefined')document.removeEventListener('visibilitychange',closeDue);};
 },[]);
 async function action(body:Record<string,unknown>,done:string){
  if(writing.current)return;writing.current=true;setBusy(true);setError('');setMessage('');
  try{const r=await fetch('/api/monthly',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await r.json() as {error?:string;ok?:boolean};if(!r.ok||!result.ok)throw Error(result.error||'Action impossible.');
   if(body.action==='record'){setPending(null);try{localStorage.removeItem(pendingKey);}catch{}setMmr('');}
   setMessage(done);await onRefresh();
  }catch(e){setError((e as Error).message);}finally{writing.current=false;setBusy(false);}
 }
 function submit(){
  if(writing.current)return;
  const selectedTier=tier===''?null:Number(tier);
  const value=pending||{id:crypto.randomUUID(),player,mmr:Number(mmr),tier:selectedTier,division:selectedTier!==null&&selectedTier>0&&selectedTier<22?Number(division):null};
  setPending(value);try{localStorage.setItem(pendingKey,JSON.stringify(value));}catch{}
  action({action:'record',...value},'MMR 2v2 enregistré. Il faudra le confirmer après tes dernières parties du dernier jour du mois.');
 }
 const outstanding=data.debts.filter(d=>!d.paidAt);
 return <section id="monthly-mmr" className="monthly-mmr" aria-labelledby="monthly-mmr-title">
  <div className="section-title"><div><p className="eyebrow">LE DÉFI DU MOIS · 2V2</p><h2 id="monthly-mmr-title">Classement MMR de {monthLabel(data.current.month)}</h2></div><span className="pill">{outstanding.length} boisson{outstanding.length>1?'s':''} à offrir</span></div>
  <p className="monthly-rule">Le dernier doit <b>une boisson à chacun des deux autres joueurs</b>, soft ou alcool au choix. Ex æquo à la dernière place : aucune dette pour ce mois.</p>
  <p className="small muted">Clôture le <b>{dateLabel(data.current.cutoffAt)}</b>, heure de Paris. Le classement reste provisoire jusque-là ; le bilan est archivé quelques minutes après.</p>
  <div className="table-wrap"><table aria-label="Classement MMR mensuel"><thead><tr><th>Joueur</th><th>MMR 2v2</th><th>Dernier relevé</th></tr></thead><tbody>{data.current.rows.map(row=><tr key={row.player}><td><b>{row.player}</b></td><td>{row.mmr??'À renseigner'}</td><td>{row.recordedAt?<>{dateLabel(row.recordedAt)}<small>{row.source==='rlstats'?<a href={row.sourceUrl||undefined} target="_blank" rel="noopener noreferrer">RLStats.net · profil public ↗</a>:'Déclaration du joueur'}</small><small>{row.confirmedForClose?'Confirmé pour la clôture':row.source==='rlstats'?'Nouveau relevé prévu en fin de mois':'À confirmer le dernier jour'}</small></>:'Aucun relevé de ce mois'}</td></tr>)}</tbody></table></div>
  <p className="small muted">Les MMR 2v2 sont relevés sur les profils publics RLStats.net le dernier jour du mois ({data.current.lastDay.split('-').reverse().join('/')}) à 23 h 59, heure de Paris. Aucune connexion à vos comptes Epic ni logiciel à laisser tourner. Le résultat utilise les derniers relevés reçus avant la clôture ; la date affichée est celle de la source.</p>
  <p className="small muted">Les trois relevés publics doivent dater des 15 dernières minutes du mois. S’il manque une valeur récente, aucune dette automatique ne sera créée. Tu peux aussi confirmer ton propre MMR manuellement après tes dernières parties du dernier jour. Les anciennes valeurs figées ne décident pas du résultat.</p>
  {data.publicSync&&<div className="public-mmr-source"><p className="small muted">Profils suivis : {data.publicSync.profiles.map((p,i)=><span key={p.player}>{i>0?' · ':''}<a href={p.url} target="_blank" rel="noopener noreferrer">{p.player} ↗</a></span>)}. Si tu changes de pseudo sur cette plateforme, signale-le pour mettre à jour le profil suivi.</p>{data.publicSync.lastAttempt&&<p className="small muted">Dernière tentative : {dateLabel(data.publicSync.lastAttempt)}.</p>}{data.publicSync.errors?.map(e=><p className="small muted" key={e.player}>{e.player} : {e.error} Dernière valeur conservée.</p>)}<p className="small muted">L’agent consulte les pages publiques puis enregistre les relevés ; le site ne se connecte pas à vos comptes.</p></div>}
  {error&&<p className="alert" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
  {data.allowedPlayers.length>0?<details><summary className="small muted">Saisir ou confirmer mon MMR manuellement</summary><form aria-label="Déclarer mon MMR 2v2" onSubmit={e=>{e.preventDefault();submit();}}>
   <div className="monthly-fields"><label>Mon joueur<select value={player} disabled={busy||!!pending} onChange={e=>setPlayer(e.target.value)}>{data.allowedPlayers.map(name=><option key={name}>{name}</option>)}</select></label><label>MMR 2v2 actuel<input type="number" required min={0} max={10000} step={1} value={mmr} disabled={busy||!!pending} onChange={e=>setMmr(e.target.value)}/></label></div>
   <details><summary className="small muted">Préciser le rang et la division (facultatif)</summary><div className="monthly-fields"><label>Rang<select value={tier} disabled={busy||!!pending} onChange={e=>setTier(e.target.value)}><option value="">Non renseigné</option>{doublesRankOptions.map(r=><option key={r.tier} value={r.tier}>{r.label}</option>)}</select></label>{tier!==''&&Number(tier)>0&&Number(tier)<22&&<label>Division<select value={division} disabled={busy||!!pending} onChange={e=>setDivision(e.target.value)}>{['I','II','III','IV'].map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>}</div></details>
   <button className="primary" disabled={busy}>{busy?'Enregistrement…':pending?'Réessayer le même envoi':'Enregistrer mon MMR'}</button>
   {pending&&<button type="button" disabled={busy} onClick={()=>{setPending(null);setError('');try{localStorage.removeItem(pendingKey);}catch{}setMessage('Nouvelle saisie possible. Si l’envoi précédent avait abouti, son relevé reste dans le classement.');}}>Modifier la saisie</button>}
  </form></details>:<p className="small muted">Pour déclarer ton MMR, utilise le compte ChatGPT associé à <a href="/connexions">ton identité de joueur</a>.</p>}
  <details className="monthly-history"><summary>Bilans mensuels et boissons</summary>
   {!data.closed.length&&<p className="small muted">Le premier bilan apparaîtra à la fin de ce mois.</p>}
   {data.closed.map(result=><article className="monthly-result" key={result.month}><h3>{monthLabel(result.month)}</h3><p>{result.status==='final'?<><b>{result.losers?.[0]}</b> termine dernier : une boisson à chacun des deux autres.</>:result.status==='tied'?'Ex æquo à la dernière place : aucune dette.':`Pas de dette automatique : MMR de fin de mois manquants pour ${result.missing.join(', ')}.`}</p><p className="small muted">Classement arrêté au {dateLabel(result.cutoffAt)}, heure de Paris.</p><p className="small muted">{result.rows.map(r=>`${r.player} : ${r.mmr??'non renseigné'}`).join(' · ')}</p>
    {data.debts.filter(d=>d.month===result.month).map(debt=><div className="drink-debt" key={debt.id}><span><b>{debt.payer}</b> → {debt.recipient}<small>1 boisson · {debt.paidAt?'Offerte le '+dateLabel(debt.paidAt):'À offrir'}</small></span>{!debt.paidAt&&debt.canSettle&&<button disabled={busy} onClick={()=>action({action:'settle',id:debt.id},'Boisson marquée comme offerte.')}>Boisson offerte</button>}{debt.paidAt&&debt.canUndo&&<button disabled={busy} onClick={()=>action({action:'undo',id:debt.id},'Paiement annulé.')}>Annuler</button>}</div>)}
   </article>)}
  </details>
 </section>;
}
