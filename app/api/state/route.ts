import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { readMerged } from '../../../lib/reconcile.mjs';
export async function GET(){
 if(!await getChatGPTUser())return Response.json({error:'Connexion requise.'},{status:401});
 const db=env.DB!;const [merged,exercises,collectors]=await Promise.all([readMerged(db),db.prepare('SELECT * FROM exercises ORDER BY created DESC').all(),db.prepare('SELECT * FROM collectors ORDER BY last_seen DESC').all()]);
 return Response.json({results:merged.rows,exercises:exercises.results,collectors:collectors.results,matchRosters:merged.rosters,reliability:merged.reliability},{headers:{'Cache-Control':'no-store'}});
}
