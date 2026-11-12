import {partyAccessPlan} from './party-access-core.mjs';
import {partyRelationPlan} from './party-relations-core.mjs';
globalThis.ATTestAI.assertEnabled();
const ID='adventurers-tome';let timer,tail=Promise.resolve();
const activeGM=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
function sync(){tail=tail.catch(()=>{}).then(async()=>{
  if(!activeGM())return;
  let legacyIds=[];try{legacyIds=JSON.parse(globalThis.ATTestAI.settings.get(ID,'groupActors')||'[]');}catch{}
  for(const {actor,patch} of partyAccessPlan(game.actors.contents,{users:game.users.contents,legacyIds})){
    if(!activeGM())return;
    await actor.update(patch);
  }
  for(const {actor,profile} of partyRelationPlan(game.actors.contents,{legacyIds})){
    if(!activeGM())return;
    await globalThis.ATTestAI.flags(actor).setFlag(ID,'profile',profile);
  }
});return tail;}
function schedule(){if(!activeGM())return;clearTimeout(timer);timer=setTimeout(()=>sync().catch(error=>console.error('Adventurer’s Tome | Party relation sync failed',error)),150);}
Hooks.once('ready',()=>{const api=globalThis.ATTestAI.modules.get(ID)?.api;if(api)api.partyRelations={sync};schedule();});
for(const hook of ['createActor','updateActor','deleteActor','updateUser','updateSetting'])Hooks.on(hook,schedule);
