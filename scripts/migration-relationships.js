/* Target-system contact cards, restored only on copies after all Actor IDs exist. */
(() => {
  const key=value=>String(value||'').normalize('NFC').trim().toLocaleLowerCase();
  async function restore(env,{rows,identities,source,packageId,signal,progress}) {
    const result={contacts:0,linked:0,unlinked:0,levelsRestored:0};
    if(source.systemId!=='taf'||env.systemId()!=='realm-guard')return result;
    const actors=rows.filter(row=>row.type==='Actor'&&!row.packId&&identities[row.sourceUuid]);
    const copy=async row=>{
      if(!env.user()?.isGM)throw Error('Only a GM can restore migration sheet data.');
      if(signal?.aborted)throw new DOMException('Sheet restoration cancelled. Retry resumes using saved copies.','AbortError');
      const actor=await env.actor(identities[row.sourceUuid]);
      if(actor?.flags?.['adventurers-tome']?.migrationV1?.packageId!==packageId)throw Error('Sheet restoration can only change this package’s imported Actor copies.');
      return actor;
    };
    for(const row of actors.filter(row=>row.data?.type==='character'&&Number.isSafeInteger(row.data.system?.progression?.spentFate)&&Number.isSafeInteger(row.data.system?.progression?.spentPersona))){
      const actor=await copy(row);
      if(!env.progression)throw Error('Target-system progression restoration is unavailable. Retry with the complete updated module.');
      const outcome=await env.progression(actor,row.data.system.progression.spentFate,row.data.system.progression.spentPersona);
      if(outcome?.ok)result.levelsRestored++;
      else (result.progressionNotes??=[]).push({actor:row.name,reason:outcome?.reason||'The target Rules Profile did not authorize lifetime Level tracking.'});
    }
    const owners=actors.filter(row=>row.data?.type==='character'&&row.storyPreview?.contacts?.length);
    if(!owners.length)return result;
    const api=env.api();if(!api?.migrateActor||!api.social?.createContact||!api.social?.updatePerson||!api.social?.linkActor)throw Error('PC Relationships restoration needs Realm Guard Social Network support. Imported copies remain GM-only; update the target system and retry.');
    for(const row of owners){
      if(!env.user()?.isGM)throw Error('Only a GM can restore migration contacts.');
      if(signal?.aborted)throw new DOMException('Contact restoration cancelled. Retry resumes using saved copies.','AbortError');
      const actor=await copy(row);
      const contacts=row.storyPreview.contacts.filter(contact=>key(contact.name)!==key(row.name));
      for(const [role,flag] of [['mother','recruitmentMother'],['father','recruitmentFather']]){
        const names=[...new Set(contacts.filter(contact=>contact.parentRole===role).map(contact=>contact.name))];
        if(names.length===1&&!actor.getFlag('realm-guard',flag))await actor.setFlag('realm-guard',flag,names[0]);
      }
      await api.migrateActor(actor);
      for(const contact of contacts){
        if(signal?.aborted)throw new DOMException('Contact restoration cancelled.','AbortError');
        const people=api.social.people(actor),matches=people.filter(person=>key(person.name)===key(contact.name));
        let person=matches.length===1?matches[0]:null;
        if(matches.length>1){
          // Legacy sheets may have a separate person record for each role.
          // Only an explicit source identity authorizes linking all those role cards.
          const explicit=contact.sourceUuid?identities[contact.sourceUuid]:null;
          if(!explicit?.startsWith('Actor.')){result.unlinked++;continue;}
          for(const match of matches){
            result.contacts++;
            if(match.actorUuid&&match.actorUuid!==explicit){result.unlinked++;continue;}
            if(!match.notes)await api.social.updatePerson(actor,match.id,{notes:contact.details});
            await api.social.linkActor(actor,match.id,explicit);result.linked++;
          }
          continue;
        }
        if(!person)person=(await api.social.createContact(actor,{name:contact.name,notes:contact.details,origin:'IMPORT',status:'UNKNOWN',createdBy:env.user().id})).person;
        else if(!person.notes)person=await api.social.updatePerson(actor,person.id,{notes:contact.details});
        result.contacts++;
        const candidates=actors.filter(candidate=>candidate.sourceUuid!==row.sourceUuid&&key(candidate.name)===key(contact.name));
        const explicit=contact.sourceUuid?identities[contact.sourceUuid]:null;
        const target=explicit?.startsWith('Actor.')?explicit:!contact.sourceUuid&&candidates.length===1?identities[candidates[0].sourceUuid]:null;
        if(target&&(!person.actorUuid||person.actorUuid===target)){await api.social.linkActor(actor,person.id,target);result.linked++;}
        else if(!person.actorUuid)result.unlinked++;
      }
      progress?.({phase:'private',message:`Restored PC Relationships for ${row.name}`});
    }
    return result;
  }
  globalThis.AdventurersTomeMigrationRelationships=Object.freeze({restore});
})();
