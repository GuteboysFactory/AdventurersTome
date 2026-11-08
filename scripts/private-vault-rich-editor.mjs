// A local ProseMirror document with no collaborative socket, UUID enrichment,
// image nodes, file upload plugin or Foundry document field.
export function mountRichEditor(host,note,media){
 const P=globalThis.ProseMirror;
 const schema=new P.Schema({nodes:{
  doc:{content:'block+'},text:{group:'inline'},
  paragraph:{content:'inline*',group:'block',parseDOM:[{tag:'p'}],toDOM:()=>['p',0]},
  heading:{attrs:{level:{default:2}},content:'inline*',group:'block',parseDOM:[{tag:'h2',attrs:{level:2}},{tag:'h3',attrs:{level:3}}],toDOM:n=>['h'+n.attrs.level,0]},
  bullet_list:{content:'list_item+',group:'block',parseDOM:[{tag:'ul'}],toDOM:()=>['ul',0]},
  ordered_list:{content:'list_item+',group:'block',parseDOM:[{tag:'ol'}],toDOM:()=>['ol',0]},
  list_item:{content:'paragraph block*',parseDOM:[{tag:'li'}],toDOM:()=>['li',0]},
  blockquote:{content:'block+',group:'block',parseDOM:[{tag:'blockquote'}],toDOM:()=>['blockquote',0]},
  hard_break:{inline:true,group:'inline',selectable:false,parseDOM:[{tag:'br'}],toDOM:()=>['br']}
 },marks:{strong:{parseDOM:[{tag:'strong'},{tag:'b'}],toDOM:()=>['strong',0]},em:{parseDOM:[{tag:'em'},{tag:'i'}],toDOM:()=>['em',0]},link:{attrs:{href:{}},inclusive:false,parseDOM:[{tag:'a[href]',getAttrs:n=>{try{const u=new URL(n.getAttribute('href'));return ['http:','https:'].includes(u.protocol)?{href:u.href}:false;}catch{return false;}}}],toDOM:n=>['a',{href:n.attrs.href,rel:'noopener noreferrer',target:'_blank'},0]}}});
 const source=document.createElement('div');
 if(note.richText)source.innerHTML=media.safeRichText(note.richText);else for(const line of String(note.body||'').split('\n')){const p=document.createElement('p');p.textContent=line;source.append(p);}
 const toolbar=document.createElement('div');toolbar.className='at-vault-format-tools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','Private note formatting');const target=document.createElement('div');host.append(toolbar,target);
 const view=new P.EditorView(target,{state:P.EditorState.create({schema,doc:P.DOMParser.fromSchema(schema).parse(source),plugins:[P.defaultPlugins.baseKeyMap,P.defaultPlugins.history]}),attributes:{'aria-label':'Private note','role':'textbox','aria-multiline':'true'},transformPastedHTML:html=>media.safeRichText(html),handleDOMEvents:{drop:(_v,e)=>{if(e.dataTransfer?.files.length){e.preventDefault();return true;}},paste:(_v,e)=>{if(e.clipboardData?.files.length){e.preventDefault();return true;}}}});
 function button(label,command){const b=document.createElement('button');b.type='button';b.textContent=label;b.onmousedown=e=>e.preventDefault();b.onclick=async()=>{try{await command(view.state,view.dispatch,view);view.focus();}catch(e){ui.notifications.error(e.message);}};toolbar.append(b);}
 button('Bold',P.commands.toggleMark(schema.marks.strong));button('Italic',P.commands.toggleMark(schema.marks.em));button('Heading',P.commands.setBlockType(schema.nodes.heading,{level:2}));button('Paragraph',P.commands.setBlockType(schema.nodes.paragraph));button('Bullets',P.list.wrapInList(schema.nodes.bullet_list));button('Numbered list',P.list.wrapInList(schema.nodes.ordered_list));
 button('Link',async(state,dispatch)=>{const href=await foundry.applications.api.DialogV2.prompt({window:{title:'Add a link'},content:'<label>Link address<input name="href" type="url" placeholder="https://" autofocus></label>',ok:{label:'Add link',callback:(_e,_b,d)=>d.element.querySelector('input').value},rejectClose:false});if(!href)return false;let url;try{url=new URL(href);}catch{return false;}if(!['https:','http:'].includes(url.protocol))return false;return P.commands.toggleMark(schema.marks.link,{href:url.href})(state,dispatch);});
 return {read(){const holder=document.createElement('div');holder.append(P.DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content));const richText=media.safeRichText(holder.innerHTML);return {richText,body:media.plainRichText(richText)};},destroy(){view.destroy();}};
}
