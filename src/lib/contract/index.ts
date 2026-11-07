// What the API accepts and answers, shared by the Worker and the web app. Each input has its French messages;
// each answer, the schema the app parses it with. The routes are typed from these (Hono RPC: `AppType`).

export * from './auth';
export * from './board';
export * from './club';
export * from './collectors';
export * from './exercises';
export * from './health';
export * from './identities';
export * from './live';
export * from './members';
export * from './monthly';
export * from './profile';
export * from './ranks';
export * from './shared';
