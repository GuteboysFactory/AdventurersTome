// Lab-only review surface. It renders plans and evidence; it never calls a
// Foundry document writer, deletes a document or enables automatic decisions.
import {deletionPlan,feedbackRecord} from './interpretation-feedback.js';
export function mountInterpretationPreview(host,{result,entity,links=[],feedbackLedger=null}){
 const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 host.replaceChildren();host.className='interpretation-lab';
 host.append(el('h1','Interpretation laboratory'),el('p','Read-only comparison. Campaign documents and links are unchanged.'));
 const summary=el('p',`${result.map.nodes.length} source blocks · ${result.decisions.length} identity decisions · ${result.diagnostics.length} diagnostic observations`);summary.dataset.summary='';host.append(summary);
 const table=el('table');table.append(el('caption','Proposed identities and their supporting evidence'));
 for(const decision of result.decisions){const row=el('tr');for(const value of [decision.text,decision.action,decision.reason])row.append(el('td',value));const detail=el('details'),title=el('summary','Inspect evidence');detail.append(title,el('pre',JSON.stringify(decision.evidence,null,2)));const cell=el('td');cell.append(detail);row.append(cell);table.append(row);}host.append(table);
 if(!entity)return;
 const area=el('section');area.append(el('h2','Remove an incorrectly created entry'),el('p',`${entity.name} · ${entity.uuid}`));
 const label=el('label','Why was this entry incorrect? '),select=el('select');select.dataset.correctionRole='';
 for(const [value,text]of [['heading','Heading / document label'],['metadata','Report metadata'],['status','Status value'],['mechanic','Game mechanic'],['editorial','Editorial note']]){const option=el('option',text);option.value=value;select.append(option);}label.append(select);area.append(label);
 const button=el('button','Preview removal and correction');button.dataset.previewDeletion='';area.append(button);const output=el('pre');output.dataset.deletionPlan='';area.append(output);
 button.addEventListener('click',()=>{
  const block=result.map.nodes.find(n=>n.text.includes(entity.name));if(!block){output.textContent='No exact source context is available for a correction.';return;}
  const correction=feedbackRecord({map:result.map,nodeId:block.id,text:entity.name,role:select.value,sourceHash:result.sourceHash});
  feedbackLedger?.save(correction);
  const plan=deletionPlan({entity,links,sourceEvidence:[{sourceUuid:result.sourceUuid,text:entity.name}],correction});
  output.textContent=JSON.stringify(plan,null,2);output.dataset.applied='false';
 });host.append(area);
}
