import {FRAME_MATERIALS, applyFrameMaterial, blendColor, tokenFramePattern} from './token-frame-materials.mjs';

const ID = "adventurers-tome";
export const TOKEN_ART_FLAG = "tokenArtV1";
export const TOKEN_ART_ROTATION_PATH = `flags.${ID}.${TOKEN_ART_FLAG}.lockRotation`;
export const TOKEN_SIZE = 512;
export const MAX_FRAME_OUTER_WIDTH = 48;
export const TOKEN_SHAPES = Object.freeze({rectangle:'Rectangle',rounded:'Rounded square',circle:'Circle',oval:'Oval',shield:'Shield',diamond:'Diamond',hexagon:'Hexagon',octagon:'Octagon'});
export const FRAME_EFFECTS = Object.freeze({none:'None',glow:'Glow',fire:'Fire',sparks:'Sparks',frost:'Frost',arcane:'Arcane pulse'});
const effectColors={glow:'#ffe0a1',fire:'#ff822b',sparks:'#ffce70',frost:'#97e6ff',arcane:'#c88aff'};
const DEFAULT_FRAME=applyFrameMaterial({shape:'circle'},'gold');
const LEGACY_FRAME={shape:'circle',material:'plain',style:'single',color:'#d9bd79',accent:'#5b321c',weight:14};

function clamp(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min,Math.min(max,number)) : fallback;
}

export function normalizeTokenArt(framing = {}, frame = DEFAULT_FRAME) {
  const material=Object.hasOwn(FRAME_MATERIALS,frame?.material)?frame.material:frame?.style==='none'?'none':'plain';
  return {
    framing: {
      fit: ['whole','contain','cover'].includes(framing?.fit) ? framing.fit : 'cover',
      zoom: clamp(framing?.zoom,1,.25,5),
      offsetX: clamp(framing?.offsetX,0,-150,150),
      offsetY: clamp(framing?.offsetY,0,-150,150)
    },
    frame: {
      shape: Object.hasOwn(TOKEN_SHAPES,frame?.shape) ? frame.shape : 'circle',
      material,
      style: material==='none' ? 'none' : ['single','double','studs','runes','stitch'].includes(frame?.style) ? frame.style : 'single',
      effect: Object.hasOwn(FRAME_EFFECTS,frame?.effect) && material!=='none' ? frame.effect : 'none',
      color: /^#[\da-f]{6}$/i.test(frame?.color) ? frame.color : '#777777',
      accent: /^#[\da-f]{6}$/i.test(frame?.accent) ? frame.accent : '#bdbdbd',
      weight: clamp(frame?.weight,14,3,48),
      outerWidth: clamp(frame?.outerWidth,0,0,MAX_FRAME_OUTER_WIDTH)
    }
  };
}

export function defaultTokenLockRotation(actor) {
  return actor?.flags?.[ID]?.[TOKEN_ART_FLAG]?.lockRotation !== false;
}

export function tokenArtState(actor) {
  const saved = actor.flags?.[ID]?.[TOKEN_ART_FLAG];
  const legacy = actor.flags?.['realm-guard'] || {};
  const prototype = actor.prototypeToken;
  const tokenTexture = prototype?.texture?.src || legacy.tokenPortraitPath || '';
  const token = saved?.tokenPoster?.video===tokenTexture ? saved.tokenPoster.image || tokenTexture : tokenTexture;
  const source = actorFullArtwork(actor);
  const legacyFrame = legacy.tokenBuilderFraming ? LEGACY_FRAME : DEFAULT_FRAME;
  return {
    source, token, tokenTexture, ringTexture:prototype?.ring?.subject?.texture || '', displayImage:actor.img || '', portrait: actorPortraitArtwork(actor),
    portraitSource: saved?.portrait?.source || source,
    portraitFraming: normalizeTokenArt(saved?.portrait?.framing).framing,
    defaultMode: saved?.displayMode==='token'&&token ? 'token' : saved?.portrait?.image ? 'portrait' : legacy.portraitMode === 'token' && token ? 'token' : 'full',
    lockRotation: defaultTokenLockRotation(actor),
    ...normalizeTokenArt(saved?.framing || legacy.tokenBuilderFraming, saved?.frame || legacyFrame)
  };
}

export function actorFullArtwork(actor,tomeArtwork='') {
  const saved=actor.flags?.[ID]?.[TOKEN_ART_FLAG];
  const legacy=actor.flags?.['realm-guard'];
  return saved?.source || legacy?.portraitSource || legacy?.tokenBuilderSourcePortrait || tomeArtwork || actor.img || actor.prototypeToken?.texture?.src || '';
}

export function actorHomeArtwork(actor,tomeArtwork='') {
  return actorPortraitArtwork(actor) || actorFullArtwork(actor,tomeArtwork);
}

export function actorPortraitArtwork(actor) {
  return actor.flags?.[ID]?.[TOKEN_ART_FLAG]?.portrait?.image || '';
}

export function savedActorDisplayArtwork(actor){
  const mode=actor?.flags?.[ID]?.[TOKEN_ART_FLAG]?.displayMode;
  return ['portrait','token'].includes(mode)?actor.img||'':'';
}

export function actorArtworkUpdate({mode,source,output,poster='',design,lockRotation=true,fullArtwork}){
  const flag=`flags.${ID}.${TOKEN_ART_FLAG}`;
  const common={img:poster||output,[flag+'.displayMode']:mode,[flag+'.source']:mode==='portrait'?fullArtwork:source};
  if(mode==='portrait')return {...common,[flag+'.portrait']:{image:output,source,framing:design.framing}};
  return {...common,...tokenTexturePatch(output,lockRotation,'prototypeToken.'),[TOKEN_ART_ROTATION_PATH]:lockRotation,[flag+'.framing']:design.framing,
    [flag+'.frame']:design.frame,[flag+'.tokenPoster']:poster?{video:output,image:poster}:null};
}

export function placedTokenArtworkUpdates(tokens, actorId, previousTexture, output, lockRotation, {replaceCustom=false}={}) {
  return tokens.filter(token=>token.actorId===actorId && (replaceCustom || token.texture?.src===previousTexture))
    .map(token=>{
      const ringTexture=(token._source??token).ring?.subject?.texture;
      return {_id:token.id,'texture.src':output,lockRotation,
        ...(ringTexture&&(replaceCustom||ringTexture===previousTexture)?{'ring.subject.texture':output}:{})};
    });
}

export function tokenImageRect(width,height,size,framing,frame) {
  let bounds = size;
  if (framing.fit === 'whole' && frame.style !== 'none') {
    const inset = frame.weight + size * .035;
    const ratio = {circle:.68,oval:.57,shield:.57,rounded:.86,rectangle:1,diamond:.45,hexagon:.65,octagon:.73}[frame.shape];
    bounds = (size - inset * 2) * ratio;
  }
  const fit = framing.fit === 'cover' ? Math.max : Math.min;
  const scale = fit(bounds / width,bounds / height) * (framing.fit === 'whole' ? 1 : framing.zoom);
  const w = width * scale, h = height * scale;
  const dx = framing.fit === 'whole' ? 0 : framing.offsetX * size / 100;
  const dy = framing.fit === 'whole' ? 0 : framing.offsetY * size / 100;
  return {x:(size-w)/2+dx,y:(size-h)/2+dy,w,h};
}

const polygonSides = {diamond:4,hexagon:6,octagon:8};

function orbit(size,rx,ry,count) {
  return Array.from({length:count},(_,i)=>{
    const angle=2*Math.PI*i/count-Math.PI/2;
    return [size/2+Math.cos(angle)*rx,size/2+Math.sin(angle)*ry];
  });
}

function traceFrame(ctx,shape,size,inset) {
  const mid = size / 2, radius = mid - inset, far = size - inset;
  ctx.beginPath();
  if (shape === 'circle' || shape === 'oval') ctx.ellipse(mid,mid,radius*(shape==='oval'?.84:1),radius,0,0,Math.PI*2);
  else if (shape === 'rounded') ctx.roundRect(inset,inset,radius*2,radius*2,size*.12);
  else if (shape === 'shield') {
    ctx.moveTo(inset,inset + size*.04);
    ctx.quadraticCurveTo(mid,inset - size*.07,far,inset + size*.04);
    ctx.lineTo(far,mid);
    ctx.quadraticCurveTo(far,far-size*.17,mid,far);
    ctx.quadraticCurveTo(inset,far-size*.17,inset,mid);
  } else if (Object.hasOwn(polygonSides,shape)) {
    for(const [i,point] of orbit(size,radius,radius,polygonSides[shape]).entries()) if(i===0)ctx.moveTo(...point);else ctx.lineTo(...point);
  } else ctx.rect(inset,inset,radius*2,radius*2);
  ctx.closePath();
}

function perimeter(shape,size,inset) {
  const far=size-inset, radius=size/2-inset;
  if(shape==='circle'||shape==='oval')return orbit(size,radius*(shape==='oval'?.84:1),radius,32);
  const vertices=Object.hasOwn(polygonSides,shape)?orbit(size,radius,radius,polygonSides[shape])
    : shape==='shield'?[[inset,inset+size*.04],[far,inset+size*.04],[far,size*.55],[size/2,far],[inset,size*.55]]
    : [[inset,inset],[far,inset],[far,far],[inset,far]];
  return vertices.flatMap(([x,y],index)=>{
    const [nx,ny]=vertices[(index+1)%vertices.length];
    return Array.from({length:6},(_,step)=>[x+(nx-x)*step/6,y+(ny-y)*step/6]);
  });
}

function paintEffect(ctx,frame,size,inset,phase) {
  const color=effectColors[frame.effect];
  if(!color)return;
  const pulse=(1+Math.sin(phase*Math.PI*2))/2;
  ctx.save();
  ctx.globalAlpha=.28+pulse*.4;
  ctx.shadowColor=color;ctx.shadowBlur=10+pulse*18;ctx.strokeStyle=color;
  ctx.lineWidth=Math.max(3,frame.weight*.19);
  traceFrame(ctx,frame.shape,size,inset-frame.weight*.3);
  ctx.stroke();
  if(frame.effect!=='glow'){
    ctx.shadowBlur=9;ctx.fillStyle=color;
    const points=perimeter(frame.shape,size,inset);
    for(const [index,[x,y]] of points.entries()){
      const step=(phase*(frame.effect==='sparks'?3:2)+index*.378)%1;
      const radius=frame.effect==='fire'?4.8:frame.effect==='frost'?4.2:2.7;
      const reach=frame.effect==='fire'?19:frame.effect==='sparks'?27:12;
      const theta=Math.atan2(y-size/2,x-size/2), d=4+reach*step;
      const dx=Math.cos(theta),dy=Math.sin(theta), width=radius*(1-step*.7);
      ctx.globalAlpha=Math.sin(step*Math.PI)*(.42+(index%4)/7);
      ctx.beginPath();
      if(frame.effect==='fire'){
        ctx.moveTo(x-dy*width,y+dx*width);
        ctx.quadraticCurveTo(x+dx*d*.8-dy*width,y+dy*d*.8+dx*width,x+dx*d,y+dy*d);
        ctx.quadraticCurveTo(x+dx*d*.63+dy*width*1.4,y+dy*d*.63-dx*width*1.4,x+dy*width,y-dx*width);
        ctx.closePath();
      } else if(frame.effect==='frost'){
        const px=x+dx*d,py=y+dy*d;
        ctx.moveTo(px+dx*width*1.8,py+dy*width*1.8);ctx.lineTo(px-dy*width,py+dx*width);
        ctx.lineTo(px-dx*width*1.8,py-dy*width*1.8);ctx.lineTo(px+dy*width,py-dx*width);ctx.closePath();
      } else ctx.arc(x+dx*d,y+dy*d,width,0,Math.PI*2);
      if(frame.effect==='arcane'){ctx.lineWidth=1.2;ctx.stroke();}
      else ctx.fill();
    }
  }
  ctx.restore();
}

export function paintToken(canvas,image,framing,frame,phase=0) {
  const size = TOKEN_SIZE;
  const outerWidth = frame.style === 'none' ? 0 : frame.outerWidth || 0;
  const padding = Math.ceil(outerWidth);
  const outputSize = size + 2 * padding;
  if (canvas.width!==outputSize) canvas.width=outputSize;
  if (canvas.height!==outputSize) canvas.height=outputSize;
  const ctx = canvas.getContext('2d');
  const inset = size*.03 + frame.weight/2;
  const rect = tokenImageRect(image.naturalWidth,image.naturalHeight,size,framing,frame);
  ctx.clearRect(0,0,outputSize,outputSize);
  ctx.save();
  if (padding) ctx.translate(padding,padding);
  ctx.save();
  if (frame.style !== 'none') {traceFrame(ctx,frame.shape,size,inset);ctx.clip();}
  ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h);
  ctx.restore();
  if (frame.style === 'none') {ctx.restore();return;}
  function stroke(paint,width,shift=0) {
    traceFrame(ctx,frame.shape,size,inset+shift);
    ctx.strokeStyle=paint;ctx.lineWidth=width;ctx.stroke();
  }
  const texture=tokenFramePattern(ctx,frame);
  if (outerWidth) {
    ctx.save();
    // Confine the added stroke to the outside of the original frame path.
    traceFrame(ctx,frame.shape,size,inset);
    ctx.rect(-padding,-padding,outputSize,outputSize);
    ctx.clip('evenodd');
    ctx.lineJoin='round';
    const width=frame.weight+2*outerWidth;
    if(texture) stroke(blendColor(frame.color,'#080808',.73),width+4);
    stroke(texture||frame.color,width);
    ctx.restore();
  }
  if(texture) {
    const light=ctx.createLinearGradient(0,0,size*.76,size);
    const stops=[[0,'#ffffff',.68],[.19,'#ffffff',.3],[.39,'#111111',.29],[.55,'#ffffff',.48],[.82,'#111111',.5],[1,'#ffffff',.23]];
    for(const [stop,color,amount] of stops)light.addColorStop(stop,blendColor(frame.color,color,amount));
    stroke(blendColor(frame.color,'#080808',.73),frame.weight+4);
    stroke(light,frame.weight);
    stroke(texture,frame.weight-2);
    stroke(blendColor(frame.color,'#ffffff',.68),1.6,-frame.weight*.39);
    stroke(blendColor(frame.color,'#080808',.63),2.4,frame.weight*.42);
  } else stroke(frame.color,frame.weight);
  if (frame.style === 'double') {
    stroke(frame.accent,Math.max(2,frame.weight*.22),texture?frame.weight*.29:frame.weight*.95);
  }
  if (['studs','runes','stitch'].includes(frame.style)) {
    const radius = size/2-inset;
    const positions = frame.shape === 'circle' || frame.shape === 'oval'
      ? orbit(size,radius*(frame.shape==='oval'?.84:1),radius,frame.style==='stitch'?32:12)
      : Object.hasOwn(polygonSides,frame.shape) ? orbit(size,radius,radius,polygonSides[frame.shape])
      : [[size/2,inset+(frame.shape==='shield'?.01*size:0)],[inset,size/2],[size-inset,size/2],[size/2,size-inset]];
    for (const [x,y] of positions) {
      ctx.save();ctx.translate(x,y);
      const r=Math.max(2,frame.weight*.24);
      ctx.fillStyle=frame.accent;
      if(frame.style==='studs'){
        const gem=ctx.createRadialGradient(-r*.4,-r*.4,0,0,0,r);
        gem.addColorStop(0,blendColor(frame.accent,'#ffffff',.65));gem.addColorStop(1,blendColor(frame.accent,'#111111',.5));
        ctx.fillStyle=gem;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
      } else {
        ctx.rotate(Math.atan2(y-size/2,x-size/2));
        ctx.fillRect(-r,-1.2,r*2,2.4);
        if(frame.style==='runes') {
          ctx.fillRect(-1.1,-r,2.2,r*2);ctx.rotate(Math.PI/4);ctx.fillRect(-r*.65,-1,r*1.3,2);
        }
      }
      ctx.restore();
    }
  }
  paintEffect(ctx,frame,size,inset-outerWidth,phase);
  ctx.restore();
}

export async function recordToken(canvas,image,design,{duration=2200}={}) {
  const formats=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mimeType=formats.find(type=>globalThis.MediaRecorder?.isTypeSupported(type));
  if (!mimeType || !canvas.captureStream) throw Error('This browser cannot export animated tokens. Choose a static frame or use Foundry on Chromium.');
  const {framing,frame}=design;
  paintToken(canvas,image,framing,frame);
  const stream=canvas.captureStream(24);
  try {
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2_000_000});
    return await new Promise((resolve,reject)=>{
      const chunks=[];
      let interval;
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=event=>{clearInterval(interval);reject(event.error || Error('Animated token recording failed.'));};
      recorder.onstop=()=>{
        clearInterval(interval);
        if(!chunks.length)reject(Error('The browser produced no animated token.'));
        else resolve(new Blob(chunks,{type:'video/webm'}));
      };
      recorder.start();
      const started=performance.now();
      interval=setInterval(()=>{
        const elapsed=performance.now()-started;
        if(elapsed>=duration){clearInterval(interval);recorder.stop();return;}
        paintToken(canvas,image,framing,frame,elapsed/duration);
      },1000/24);
    });
  } finally {for(const track of stream.getTracks())track.stop();}
}

export function tokenTexturePatch(path,lockRotation,prefix='') {
  return Object.fromEntries(Object.entries({lockRotation,'texture.src':path,'texture.fit':'contain','texture.anchorX':.5,'texture.anchorY':.5,'texture.scaleX':1,'texture.scaleY':1})
    .map(([key,value])=>[prefix+key,value]));
}
