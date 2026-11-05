import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { readMerged } from '../../../lib/reconcile.mjs';
import { readDoublesRanks } from '../../../lib/doubles-ranks.mjs';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 const db=env.DB!;const [merged,exercises,collectors,doublesRanks,reactions,me]=await Promise.all([readMerged(db),db.prepare('SELECT * FROM exercises ORDER BY created DESC').all(),db.prepare('SELECT * FROM collectors ORDER BY last_seen DESC').all(),readDoublesRanks(db),db.prepare('SELECT exercise_id,emoji,COUNT(*) AS count,MAX(author=?) AS mine FROM exercise_reactions GROUP BY exercise_id,emoji').bind(user.userId).all().catch(()=>({results:[]})),db.prepare('SELECT player FROM exercises WHERE author=? GROUP BY player ORDER BY COUNT(*) DESC,MAX(created) DESC LIMIT 1').bind(user.userId).first()]);
 const ownExercises=exercises.results.map(row=>{const {author,...e}=row as Record<string,unknown>;return {...e,mine:author===user.userId};});
 return Response.json({results:merged.rows,exercises:ownExercises,collectors:collectors.results,matchRosters:merged.rosters,reliability:merged.reliability,doublesRanks,reactions:reactions.results,me:me?.player??null},{headers:{'Cache-Control':'no-store'}});
}
