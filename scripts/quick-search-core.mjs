export const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function matchScore(name,query){
 const text=normalizeSearch(name),q=normalizeSearch(query).trim();if(!q)return 1;if(text===q)return 1000;if(text.startsWith(q))return 800-q.length/100;
 const i=text.indexOf(q);if(i>=0)return 600-i;
 let pos=-1,gaps=0;for(const c of q){const next=text.indexOf(c,pos+1);if(next<0)return 0;gaps+=next-pos-1;pos=next;}return Math.max(1,200-gaps-q.length);
}
export function searchRows(rows,query,{type='',folder='',pack='',max=60,allow=()=>true}={}){
 return rows.filter(r=>(!type||r.type===type||r.subtype===type)&&(!folder||r.folderId===folder)&&(!pack||r.packId===pack)&&allow(r)).map(row=>({row,score:Math.max(matchScore(row.name,query),...(row.aliases||[]).map(name=>matchScore(name,query)))})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.row.name.localeCompare(b.row.name)).slice(0,max).map(r=>r.row);
}
export function keybindMatches(event,bindings=[]){return bindings.some(b=>b.key===event.code&&Boolean(event.ctrlKey)===Boolean(b.modifiers?.includes('Control'))&&Boolean(event.metaKey)===Boolean(b.modifiers?.includes('Meta'))&&Boolean(event.shiftKey)===Boolean(b.modifiers?.includes('Shift'))&&Boolean(event.altKey)===Boolean(b.modifiers?.includes('Alt')));}
// A small arithmetic grammar, never JavaScript evaluation or arbitrary property access.
export function calculate(expression){
 const input=String(expression);if(input.length>300)throw Error('Calculation is too long.');
 const tokens=input.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[+\-*/%^(),]/gi)||[];
 if(tokens.join('').toLowerCase()!==input.replace(/\s/g,'').toLowerCase()||tokens.length>160)throw Error('Invalid calculation.');
 let index=0,depth=0;const functions={sin:Math.sin,cos:Math.cos,tan:Math.tan,log:Math.log10,ln:Math.log,sqrt:Math.sqrt,abs:Math.abs,round:Math.round,floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max};
 const take=()=>tokens[index++],peek=()=>tokens[index];
 function primary(){if(++depth>40)throw Error('Calculation is too deeply nested.');let value;const token=take()?.toLowerCase();
  if(token==='('){value=sum();if(take()!==')')throw Error('Missing closing parenthesis.');}
  else if(token==='pi')value=Math.PI;else if(token==='e')value=Math.E;
  else if(Object.hasOwn(functions,token)){if(take()!=='(')throw Error('Use parentheses after a function.');const args=[sum()];while(peek()===','){take();args.push(sum());}if(take()!==')')throw Error('Missing closing parenthesis.');value=functions[token](...args);}
  else if(token!==undefined&&/^\d|^\./.test(token))value=Number(token);else throw Error('Expected a number.');
  depth--;return value;
 }
 function unary(){if(peek()==='+'||peek()==='-'){const sign=take();return unary()*(sign==='-'?-1:1);}return power();}
 function power(){let a=primary();if(peek()==='^'){take();a=a**unary();}return a;}
 function product(){let a=unary();while(['*','/','%'].includes(peek())){const op=take(),b=unary();a=op==='*'?a*b:op==='/'?a/b:a%b;}return a;}
 function sum(){let a=product();while(['+','-'].includes(peek())){const op=take(),b=product();a=op==='+'?a+b:a-b;}return a;}
 const result=sum();if(index!==tokens.length||!Number.isFinite(result))throw Error('Invalid or non-finite calculation.');return result;
}
export function captureTextTarget(input){
 if(!input||!['INPUT','TEXTAREA'].includes(input.tagName)||input.disabled||input.readOnly||input.type==='password'||typeof input.selectionStart!=='number')return null;
 const before=input.value,start=input.selectionStart,end=input.selectionEnd;
 return {label:'Insert link',text:before.slice(start,end),insert(text){if(!input.isConnected||input.value!==before)throw Error('The target field changed. Reopen Quick Search from that field.');input.setRangeText(text,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();}};
}
