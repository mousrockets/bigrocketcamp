import {requireChatGPTUser} from '../chatgpt-auth';
import Connections from './client';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/connexions');return <Connections/>;}
