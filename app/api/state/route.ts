import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { readMerged } from '../../../lib/reconcile.mjs';
import { readDoublesRanks } from '../../../lib/doubles-ranks.mjs';
import { collectionPaused } from '../../../lib/epic-sync.mjs';
import {readMonthlyMmr} from '../../../lib/monthly-mmr.mjs';
export async function GET(request?:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 const db=env.DB!;const [merged,exercises,collectors,doublesRanks,reactions,me,epic]=await Promise.all([readMerged(db),db.prepare('SELECT * FROM exercises ORDER BY created DESC').all(),db.prepare('SELECT * FROM collectors ORDER BY last_seen DESC').all(),readDoublesRanks(db),db.prepare('SELECT exercise_id,emoji,COUNT(*) AS count,MAX(author=?) AS mine FROM exercise_reactions GROUP BY exercise_id,emoji').bind(user.userId).all().catch(()=>({results:[]})),db.prepare('SELECT player FROM exercises WHERE author=? GROUP BY player ORDER BY COUNT(*) DESC,MAX(created) DESC LIMIT 1').bind(user.userId).first(),db.prepare("SELECT slot,'retired' AS status,last_sync,last_attempt FROM player_identities ORDER BY last_sync DESC").all()]);
 const ownExercises=exercises.results.map(row=>{const {author,...e}=row as Record<string,unknown>;return {...e,mine:author===user.userId};});
 const monthly=await readMonthlyMmr(db,user.userId);
 const body=JSON.stringify({results:merged.rows,exercises:ownExercises,collectors:collectors.results,matchRosters:merged.rosters,reliability:merged.reliability,doublesRanks,reactions:reactions.results,me:me?.player??null,epic:epic.results,epicPaused:collectionPaused(),epicRetired:true,monthly});
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)));
 const etag=`"${Array.from(digest.slice(0,16),b=>b.toString(16).padStart(2,'0')).join('')}"`;
 // Revalidated on every poll: an unchanged state is answered with an empty 304.
 const headers={'Content-Type':'application/json','Cache-Control':'private, no-cache',ETag:etag};
 if(request?.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
 return new Response(body,{headers});
}
