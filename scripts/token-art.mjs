import {FRAME_MATERIALS, FRAME_ORNAMENTS, FRAME_ORNAMENT_SLOTS, applyFrameMaterial, blendColor, tintedSilhouette, tokenFramePattern} from './token-frame-materials.mjs';
import {FRAME_SILHOUETTES} from './token-frame-shapes.mjs';
import {FRAME_ANIMATION_DURATION,FRAME_EFFECT_PADDING,paintFrameAnimation} from './token-frame-effects.mjs';

const ID = "adventurers-tome";
export const TOKEN_ART_FLAG = "tokenArtV1";
export const TOKEN_ART_ROTATION_PATH = `flags.${ID}.${TOKEN_ART_FLAG}.lockRotation`;
export const TOKEN_SIZE = 512;
export const MIN_FRAME_BAND_WIDTH = 3;
export const MAX_FRAME_BAND_WIDTH = 96;
export const MIN_FRAME_DIAMETER = 60;
export const MAX_FRAME_DIAMETER = 140;
export const MIN_EFFECT_STRENGTH = 25;
export const MAX_EFFECT_STRENGTH = 200;
const ORNAMENT_SIZE = 72;
export const TOKEN_PREVIEW_SIZE = TOKEN_SIZE + 2 * (MAX_FRAME_BAND_WIDTH - MIN_FRAME_BAND_WIDTH + ORNAMENT_SIZE);
export const TOKEN_SHAPES = Object.freeze({rectangle:'Rectangle',rounded:'Rounded square',circle:'Circle',oval:'Oval',shield:'Shield',diamond:'Diamond',hexagon:'Hexagon',octagon:'Octagon',
  ...Object.fromEntries(Object.entries(FRAME_SILHOUETTES).map(([key,shape])=>[key,shape.label]))});
export const FRAME_EFFECT_GROUPS = Object.freeze({
  'Elements':Object.freeze({emberFire:'Ember ring',fire:'Burning ring',sparks:'Sparks',frost:'Frost',stormHalo:'Storm Halo',sandstorm:'Sandstorm',tidalRing:'Tidal Ring'}),
  'Light and nature':Object.freeze({glow:'Glow',holyAura:'Holy Aura',healing:'Healing',moonlight:'Moonlight',feyWisps:'Fey Wisps',autumnLeaves:'Autumn Leaves',celestialOrbit:'Celestial Orbit'}),
  'Shadow and magic':Object.freeze({arcane:'Arcane pulse',ghostlyLight:'Ghostly Light',deathShadow:'Death Shadow',sickness:'Sickness',angry:'Angry',bloodMoon:'Blood Moon',voidRift:'Void Rift',runicWard:'Runic Ward'})
});
export const FRAME_EFFECTS = Object.freeze({none:'None',...Object.assign({},...Object.values(FRAME_EFFECT_GROUPS))});
const DEFAULT_FRAME=applyFrameMaterial({shape:'circle'},'gold');
const LEGACY_FRAME={shape:'circle',material:'plain',style:'single',color:'#d9bd79',accent:'#5b321c',weight:14};

function clamp(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? Math.max(min,Math.min(max,number)) : fallback;
}

export function tokenGridSize({width,height}={}, fallback={width:1,height:1}) {
  const valid=(value,initial)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):initial;
  return {width:valid(width,fallback.width),height:valid(height,fallback.height)};
}

export function normalizeTokenArt(framing = {}, frame = DEFAULT_FRAME) {
  const material=Object.hasOwn(FRAME_MATERIALS,frame?.material)?frame.material:frame?.style==='none'?'none':'plain';
  const weight=clamp(frame?.weight,14,3,48);
  const shape=Object.hasOwn(TOKEN_SHAPES,frame?.shape)?frame.shape:'circle';
  const illustrated=Object.hasOwn(FRAME_SILHOUETTES,shape);
  return {
    framing: {
      fit: ['whole','contain','cover'].includes(framing?.fit) ? framing.fit : 'cover',
      zoom: clamp(framing?.zoom,1,.25,5),
      offsetX: clamp(framing?.offsetX,0,-150,150),
      offsetY: clamp(framing?.offsetY,0,-150,150)
    },
    frame: {
      shape,
      material,
      style: material==='none'&&!illustrated ? 'none' : ['single','double','studs','runes','stitch'].includes(frame?.style) ? frame.style : 'single',
      effect: Object.hasOwn(FRAME_EFFECTS,frame?.effect) && (material!=='none'||illustrated) ? frame.effect : 'none',
      effectStrength:clamp(frame?.effectStrength,100,MIN_EFFECT_STRENGTH,MAX_EFFECT_STRENGTH),
      color: /^#[\da-f]{6}$/i.test(frame?.color) ? frame.color : '#777777',
      accent: /^#[\da-f]{6}$/i.test(frame?.accent) ? frame.accent : '#bdbdbd',
      weight,
      diameter:clamp(frame?.diameter,100,MIN_FRAME_DIAMETER,MAX_FRAME_DIAMETER),
      ...(shape==='circle'&&frame?.fitToEdges===true?{fitToEdges:true}:{}),
      bandWidth: clamp(illustrated ? frame?.illustratedBandWidth : frame?.bandWidth, illustrated ? weight : weight+clamp(frame?.outerWidth,0,0,48),MIN_FRAME_BAND_WIDTH,MAX_FRAME_BAND_WIDTH),
      ...(illustrated?{illustratedBandWidth:clamp(frame?.illustratedBandWidth,weight,MIN_FRAME_BAND_WIDTH,MAX_FRAME_BAND_WIDTH),silhouetteTint:/^#[\da-f]{6}$/i.test(frame?.silhouetteTint)?frame.silhouetteTint:''}:{}),
      ornaments: Object.fromEntries(Object.keys(FRAME_ORNAMENT_SLOTS).map(slot=>{
        const choice=frame?.ornaments?.[slot];
        return [slot,Object.hasOwn(FRAME_ORNAMENTS,choice)?choice:'none'];
      }))
    }
  };
}

export function defaultTokenLockRotation(actor) {
  return actor?.flags?.[ID]?.[TOKEN_ART_FLAG]?.lockRotation !== false;
}

export function tokenArtState(actor,worldFrame) {
  const saved = actor.flags?.[ID]?.[TOKEN_ART_FLAG];
  const legacy = actor.flags?.['realm-guard'] || {};
  const prototype = actor.prototypeToken;
  const tokenTexture = prototype?.texture?.src || legacy.tokenPortraitPath || '';
  const token = saved?.tokenPoster?.video===tokenTexture ? saved.tokenPoster.image || tokenTexture : tokenTexture;
  const textureScale = saved?.tokenPoster?.video===tokenTexture ? saved.tokenPoster.textureScale : 1;
  const source = actorFullArtwork(actor);
  const legacyFrame = legacy.tokenBuilderFraming ? LEGACY_FRAME : DEFAULT_FRAME;
  return {
    source, token, tokenTexture, textureScale:Number.isFinite(textureScale)&&textureScale>0?textureScale:1,
    ringEnabled:prototype?.ring?.enabled===true, ringTexture:prototype?.ring?.subject?.texture || '', displayImage:actor.img || '', portrait: actorPortraitArtwork(actor),
    portraitSource: saved?.portrait?.source || source,
    portraitFraming: normalizeTokenArt(saved?.portrait?.framing).framing,
    defaultMode: saved?.displayMode==='token'&&token ? 'token' : saved?.portrait?.image ? 'portrait' : legacy.portraitMode === 'token' && token ? 'token' : 'full',
    lockRotation: defaultTokenLockRotation(actor),
    gridSize:tokenGridSize(prototype),
    ...normalizeTokenArt(saved?.framing || legacy.tokenBuilderFraming, saved?.frame || (legacy.tokenBuilderFraming?legacyFrame:worldFrame)||legacyFrame)
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

export function actorArtworkUpdate({mode,source,output,poster='',design,lockRotation=true,fullArtwork,gridSize,textureScale=1}){
  const flag=`flags.${ID}.${TOKEN_ART_FLAG}`;
  const common={img:poster||output,[flag+'.displayMode']:mode,[flag+'.source']:mode==='portrait'?fullArtwork:source};
  if(mode==='portrait')return {...common,[flag+'.portrait']:{image:output,source,framing:design.framing}};
  return {...common,...tokenTexturePatch(output,lockRotation,'prototypeToken.',textureScale),[TOKEN_ART_ROTATION_PATH]:lockRotation,[flag+'.framing']:design.framing,
    [flag+'.frame']:design.frame,[flag+'.tokenPoster']:poster?{video:output,image:poster,textureScale}:null,
    ...(gridSize?{'prototypeToken.width':gridSize.width,'prototypeToken.height':gridSize.height}:{})};
}

export function placedTokenArtworkUpdates(tokens, actorId, previousTexture, output, lockRotation, {replaceCustom=false,poster="",gridSize,textureScale=1,previousTextureScale=1}={}) {
  return tokens.filter(token=>token.actorId===actorId && (replaceCustom || token.texture?.src===previousTexture))
    .map(token=>{
      const ring=(token._source??token).ring;
      const ringTexture=ring?.subject?.texture;
      const animated=/\.webm(?:$|[?#])/i.test(output);
      const still=animated&&/\.png(?:$|[?#])/i.test(poster)?poster:animated?"":output;
      const scaleRatio=textureScale/(token.texture?.src===previousTexture?previousTextureScale:1);
      return {_id:token.id,'texture.src':output,lockRotation,
        ...(scaleRatio!==1?{'texture.scaleX':(token.texture?.scaleX??1)*scaleRatio,'texture.scaleY':(token.texture?.scaleY??1)*scaleRatio}:{}),
        ...(gridSize?{width:gridSize.width,height:gridSize.height}:{}),
        ...(animated&&ring?.enabled?{'ring.enabled':false}:{}),
        ...(still&&ringTexture&&(replaceCustom||ringTexture===previousTexture)?{'ring.subject.texture':still}:{})};
    });
}

export function tokenImageRect(width,height,size,framing,frame) {
  const silhouette=Object.hasOwn(FRAME_SILHOUETTES,frame.shape)?FRAME_SILHOUETTES[frame.shape]:null;
  let bounds = size;
  if (framing.fit==='whole'&&silhouette) {
    // The bounding square stays within the narrowest part of the illustrated aperture.
    bounds=Math.min(...silhouette.aperture)*Math.SQRT2*size/TOKEN_SIZE;
  } else if (framing.fit === 'whole' && frame.style !== 'none') {
    const inset = frame.weight + size * .035;
    const ratio = {circle:.68,oval:.57,shield:.57,rounded:.86,rectangle:1,diamond:.45,hexagon:.65,octagon:.73}[frame.shape];
    bounds = (size - inset * 2) * ratio;
  }
  const fit = framing.fit === 'cover' ? Math.max : Math.min;
  const scale = fit(bounds / width,bounds / height) * (framing.fit === 'whole' ? 1 : framing.zoom);
  const w = width * scale, h = height * scale;
  const dx = framing.fit === 'whole' ? 0 : framing.offsetX * size / 100;
  const dy = framing.fit === 'whole' ? 0 : framing.offsetY * size / 100;
  const [cx,cy]=silhouette?silhouette.center.map(value=>value*size/TOKEN_SIZE):[size/2,size/2];
  return {x:cx-w/2+dx,y:cy-h/2+dy,w,h};
}

const polygonSides = {diamond:4,hexagon:6,octagon:8};

function orbit(size,rx,ry,count) {
  return Array.from({length:count},(_,i)=>{
    const angle=2*Math.PI*i/count-Math.PI/2;
    return [size/2+Math.cos(angle)*rx,size/2+Math.sin(angle)*ry];
  });
}

function traceFrame(ctx,shape,size,inset,append=false) {
  const mid = size / 2, radius = mid - inset, far = size - inset;
  if (!append) ctx.beginPath();
  if (shape === 'circle' || shape === 'oval') {
    const width=radius*(shape==='oval'?.84:1);
    ctx.moveTo(mid+width,mid);
    ctx.ellipse(mid,mid,width,radius,0,0,Math.PI*2);
  }
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
  const far=size-inset, mid=size/2, radius=mid-inset;
  if(shape==='circle'||shape==='oval')return orbit(size,radius*(shape==='oval'?.84:1),radius,64);
  let vertices;
  if(shape==='rounded'){
    const corner=Math.min(radius,size*.12);
    const centers=[[far-corner,inset+corner],[far-corner,far-corner],[inset+corner,far-corner],[inset+corner,inset+corner]];
    vertices=centers.flatMap(([x,y],index)=>Array.from({length:9},(_,step)=>{
      const angle=(index-1+step/8)*Math.PI/2;
      return [x+Math.cos(angle)*corner,y+Math.sin(angle)*corner];
    }));
  }else if(shape==='shield'){
    const top=inset+size*.04, bottom=far-size*.17;
    const curves=[[[inset,top],[mid,inset-size*.07],[far,top]],
      [[far,mid],[far,bottom],[mid,far]],[[mid,far],[inset,bottom],[inset,mid]]];
    vertices=curves.flatMap(([a,b,c])=>Array.from({length:17},(_,step)=>{
      const t=step/16,u=1-t;
      return a.map((value,axis)=>u*u*value+2*u*t*b[axis]+t*t*c[axis]);
    }));
  }else{
    vertices=Object.hasOwn(polygonSides,shape)?orbit(size,radius,radius,polygonSides[shape])
      : [[inset,inset],[far,inset],[far,far],[inset,far]];
  }
  let distance=0;
  const segments=vertices.map(([x,y],index)=>{
    const [nx,ny]=vertices[(index+1)%vertices.length];
    const length=Math.hypot(nx-x,ny-y);
    const start=distance;
    distance+=length;
    return {x,y,dx:nx-x,dy:ny-y,length,start};
  });
  return Array.from({length:64},(_,index)=>{
    const along=index*distance/64;
    const segment=segments.find(({start,length})=>along<start+length);
    const fraction=(along-segment.start)/segment.length;
    return [segment.x+segment.dx*fraction,segment.y+segment.dy*fraction];
  });
}

function silhouettePoint(shape,index,offset=0) {
  const angle=2*Math.PI*index/shape.aperture.length;
  const radius=shape.aperture[index]+offset;
  return [shape.center[0]+Math.cos(angle)*radius,shape.center[1]+Math.sin(angle)*radius];
}

function traceSilhouette(ctx,shape,offset=0) {
  ctx.beginPath();
  shape.aperture.forEach((_radius,index)=>{
    const point=silhouettePoint(shape,index,offset);
    if(index===0)ctx.moveTo(...point);
    else ctx.lineTo(...point);
  });
  ctx.closePath();
}

const silhouetteProfiles = new WeakMap();
const illustratedFrames = new WeakMap();

function artworkProfile(ctx,shape,source) {
  if (silhouetteProfiles.has(source)) return silhouetteProfiles.get(source);
  const size=TOKEN_SIZE;
  const tile=ctx.canvas.ownerDocument.createElement("canvas");
  tile.width=tile.height=size;
  const drawing=tile.getContext("2d",{willReadFrequently:true});
  drawing.drawImage(source,0,0,size,size);
  const pixels=drawing.getImageData(0,0,size,size).data;
  const [cx,cy]=shape.center;
  const outer=shape.aperture.map((opening,index)=>{
    const angle=index*2*Math.PI/shape.aperture.length;
    const dx=Math.cos(angle),dy=Math.sin(angle);
    for(let r=Math.ceil(Math.SQRT2*size);r>=opening;r--){
      const x=Math.round(cx+dx*r),y=Math.round(cy+dy*r);
      if(x>=0&&x<size&&y>=0&&y<size&&pixels[(y*size+x)*4+3]>30)return r;
    }
    return opening;
  });
  const profile={...shape,outer};
  silhouetteProfiles.set(source,profile);
  return profile;
}

function outerPoint(profile,index,inset=0) {
  const distance=profile.outer[index]+inset-profile.aperture[index];
  return silhouettePoint(profile,index,distance);
}

function traceOuter(ctx,profile,inset=0) {
  ctx.beginPath();
  profile.outer.forEach((_,index)=>{
    const point=outerPoint(profile,index,inset);
    if(index===0)ctx.moveTo(...point);
    else ctx.lineTo(...point);
  });
  ctx.closePath();
}

function illustratedFrame(ctx,frame,source,profile,expansion) {
  const artwork=tintedSilhouette(ctx,frame.shape,source,frame.silhouetteTint);
  if (!expansion&&frame.style==="single") return {artwork,margin:0};
  const key=JSON.stringify([frame.silhouetteTint,frame.style,frame.accent,expansion]);
  const previous=illustratedFrames.get(source);
  if (previous?.key===key) return previous;
  const size=TOKEN_SIZE;
  const margin=Math.ceil(expansion);
  const tile=ctx.canvas.ownerDocument.createElement("canvas");
  tile.width=tile.height=size+2*margin;
  const drawing=tile.getContext("2d",{willReadFrequently:true});
  if (!expansion) drawing.drawImage(artwork,0,0,size,size);
  else {
    drawing.drawImage(artwork,0,0,size,size);
    const input=drawing.getImageData(0,0,size,size).data;
    const target=drawing.createImageData(tile.width,tile.height);
    const [cx,cy]=profile.center;
    const angles=profile.aperture.length;
    // Stretch the artwork outside its aperture along each ray. The inner contour
    // and its transparent openings stay fixed while the outer contour moves out.
    for(let y=0;y<tile.height;y++) for(let x=0;x<tile.width;x++){
      const dx=x-margin-cx,dy=y-margin-cy;
      const radius=Math.hypot(dx,dy);
      const point=(Math.atan2(dy,dx)*angles/(2*Math.PI)+angles)%angles;
      const a=Math.floor(point),b=(a+1)%angles,blend=point-a;
      const aperture=profile.aperture[a]*(1-blend)+profile.aperture[b]*blend;
      const edge=profile.outer[a]*(1-blend)+profile.outer[b]*blend;
      const span=Math.max(1,edge-aperture);
      const mapped=radius<=aperture?radius:aperture+(radius-aperture)*span/(span+expansion);
      const ratio=radius?mapped/radius:1;
      const sx=Math.round(cx+dx*ratio),sy=Math.round(cy+dy*ratio);
      if(sx<0||sx>=size||sy<0||sy>=size)continue;
      const from=(sy*size+sx)*4,to=(y*tile.width+x)*4;
      for(let channel=0;channel<4;channel++)target.data[to+channel]=input[from+channel];
    }
    drawing.putImageData(target,0,0);
  }
  drawing.save();
  drawing.translate(margin,margin);
  drawing.globalCompositeOperation="source-atop";
  if(frame.style==="double"){
    traceOuter(drawing,profile,expansion-4);
    drawing.strokeStyle=frame.accent;
    drawing.lineWidth=2;
    drawing.stroke();
  }else if(["studs","runes","stitch"].includes(frame.style)){
    const step=frame.style==="stitch"?3:8;
    const positions=profile.outer.flatMap((_,index)=>index%step===0?[outerPoint(profile,index,expansion-7)]:[]);
    paintFrameDetails(drawing,frame,size,Math.min(6,frame.bandWidth*.24),positions);
  }
  drawing.restore();
  const rendered={key,artwork:tile,margin};
  illustratedFrames.set(source,rendered);
  return rendered;
}

function paintFrameBand(ctx,frame,size,padding,opening,bandWidth,artwork) {
  const edge=opening-bandWidth, inset=opening-bandWidth/2;
  const outputSize=size+2*padding;
  function stroke(paint,width,shift=0) {
    traceFrame(ctx,frame.shape,size,inset+shift);
    ctx.strokeStyle=paint;ctx.lineWidth=width;ctx.stroke();
  }
  const texture=tokenFramePattern(ctx,frame,artwork);
  ctx.save();
  traceFrame(ctx,frame.shape,size,edge);
  traceFrame(ctx,frame.shape,size,opening,true);
  ctx.clip('evenodd');
  ctx.fillStyle=texture||frame.color;
  ctx.fillRect(-padding,-padding,outputSize,outputSize);
  stroke(blendColor(frame.color,'#ffffff',.58),2,edge-inset);
  stroke(blendColor(frame.color,'#080808',.68),3,opening-inset);
  if (frame.style === 'double') {
    stroke(frame.accent,Math.min(2.5,bandWidth*.25),edge+4-inset);
  }
  if (['studs','runes','stitch'].includes(frame.style)) {
    const radius = size/2-inset;
    const positions = frame.shape === 'circle' || frame.shape === 'oval'
      ? orbit(size,radius*(frame.shape==='oval'?.84:1),radius,frame.style==='stitch'?32:12)
      : Object.hasOwn(polygonSides,frame.shape) ? orbit(size,radius,radius,polygonSides[frame.shape])
      : [[size/2,inset+(frame.shape==='shield'?.01*size:0)],[inset,size/2],[size-inset,size/2],[size/2,size-inset]];
    paintFrameDetails(ctx,frame,size,Math.min(7,bandWidth*.24),positions);
  }
  ctx.restore();
}

function paintFrameDetails(ctx,frame,size,r,positions) {
  for (const [x,y] of positions) {
    ctx.save();ctx.translate(x,y);
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

export function tokenFrameScale(frame) {
  if(Object.hasOwn(FRAME_SILHOUETTES,frame.shape)||frame.style!=='none'){
    if(frame.shape==='circle'&&frame.fitToEdges){
      const radius=TOKEN_SIZE*(.5-.03)-frame.weight+(frame.bandWidth??frame.weight);
      return TOKEN_SIZE/(2*radius);
    }
    return (frame.diameter??100)/100;
  }
  return 1;
}

function tokenCanvasSize(hasFrame,fitToEdges,scale,expansion,ornamentPadding,effectPadding) {
  if(!hasFrame)return TOKEN_SIZE;
  if(fitToEdges)return TOKEN_SIZE+2*Math.ceil(effectPadding*scale);
  // Leave room for larger diameters without changing the scale of the artwork in the texture.
  const maxScale=MAX_FRAME_DIAMETER/100;
  return TOKEN_SIZE+2*Math.ceil((expansion+Math.max(ornamentPadding,effectPadding))*maxScale+TOKEN_SIZE*(maxScale-1)/2);
}

export function paintToken(canvas,image,framing,frame,phase=0,artwork={}) {
  const size=TOKEN_SIZE;
  const silhouette=Object.hasOwn(FRAME_SILHOUETTES,frame.shape)?FRAME_SILHOUETTES[frame.shape]:null;
  const hasFrame=Boolean(silhouette)||frame.style!=="none";
  const bandWidth=(silhouette?frame.illustratedBandWidth:frame.bandWidth)??frame.bandWidth??frame.weight;
  const usedOrnaments=Object.entries(frame.ornaments||{}).filter(([,key])=>artwork[key]);
  const ornamentPadding=usedOrnaments.length?ORNAMENT_SIZE:0;
  const expansion=Math.max(0,bandWidth-frame.weight);
  const scale=tokenFrameScale(frame);
  const fitToEdges=hasFrame&&frame.shape==='circle'&&frame.fitToEdges;
  const outputSize=tokenCanvasSize(hasFrame,fitToEdges,scale,expansion,ornamentPadding,FRAME_EFFECT_PADDING[frame.effect]??0);
  const padding=(outputSize-size)/2;
  if(canvas.width!==outputSize)canvas.width=outputSize;
  if(canvas.height!==outputSize)canvas.height=outputSize;
  const ctx=canvas.getContext("2d");
  const opening=size*.03+frame.weight;
  const rect=tokenImageRect(image.naturalWidth,image.naturalHeight,size,framing,frame);
  ctx.clearRect(0,0,outputSize,outputSize);
  ctx.save();
  const origin=padding+(size-size*scale)/2;
  if(origin)ctx.translate(origin,origin);
  if(scale!==1)ctx.scale(scale,scale);
  const picture=silhouette&&artwork[frame.shape];
  const profile=picture&&(expansion||frame.effect!=="none"||frame.style!=="single")?artworkProfile(ctx,silhouette,picture):null;
  if(hasFrame&&frame.effect!=="none"){
    ctx.save();
    if(silhouette)traceSilhouette(ctx,silhouette);
    else traceFrame(ctx,frame.shape,size,opening);
    ctx.rect(-origin/scale,-origin/scale,outputSize/scale,outputSize/scale);
    ctx.clip("evenodd");
    const points=profile
      ? profile.outer.map((_,index)=>outerPoint(profile,index,expansion-1))
      : perimeter(frame.shape,size,opening-bandWidth);
    paintFrameAnimation(ctx,frame.effect,size,points,phase,(frame.effectStrength??100)/100);
    ctx.restore();
  }
  ctx.save();
  if(hasFrame){
    if(silhouette)traceSilhouette(ctx,silhouette);
    else traceFrame(ctx,frame.shape,size,opening-.65);
    ctx.clip();
  }
  ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h);
  ctx.restore();
  if(!hasFrame){ctx.restore();return 1;}
  if(silhouette){
    if(picture){
      const layer=profile?illustratedFrame(ctx,frame,picture,profile,expansion):{artwork:tintedSilhouette(ctx,frame.shape,picture,frame.silhouetteTint),margin:0};
      const extent=size+2*layer.margin;
      ctx.drawImage(layer.artwork,-layer.margin,-layer.margin,extent,extent);
    }
  }else paintFrameBand(ctx,frame,size,fitToEdges?expansion:padding,opening,bandWidth,artwork);
  const mid=size/2;
  const anchorInset=opening-Math.max(bandWidth/2,ORNAMENT_SIZE*.55);
  const span=(mid-anchorInset)*(frame.shape==="oval"?.84:frame.shape==="hexagon"?Math.sqrt(3)/2:1);
  const anchors={top:[mid,anchorInset-(frame.shape==="shield"?size*.015:0)],right:[mid+span,mid],
    bottom:[mid,size-anchorInset],left:[mid-span,mid]};
  const directions={top:72,right:0,bottom:24,left:48};
  for(const [slot,key] of usedOrnaments){
    const sprite=artwork[key], [x,y]=silhouette?silhouettePoint(silhouette,directions[slot],28+expansion):anchors[slot];
    const scale=ORNAMENT_SIZE/Math.max(sprite.naturalWidth,sprite.naturalHeight);
    const width=sprite.naturalWidth*scale,height=sprite.naturalHeight*scale;
    ctx.drawImage(sprite,x-width/2,y-height/2,width,height);
  }
  ctx.restore();
  // Compensate for the transparent animation margin through Foundry's texture scale.
  return outputSize/tokenCanvasSize(hasFrame,fitToEdges,scale,expansion,ornamentPadding,0);
}

export async function recordToken(canvas,image,design,{duration=FRAME_ANIMATION_DURATION,artwork}={}) {
  const formats=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mimeType=formats.find(type=>globalThis.MediaRecorder?.isTypeSupported(type));
  if (!mimeType || !canvas.captureStream) throw Error('This browser cannot export animated tokens. Choose a static frame or use Foundry on Chromium.');
  const {framing,frame}=design;
  paintToken(canvas,image,framing,frame,0,artwork);
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
        paintToken(canvas,image,framing,frame,elapsed/duration,artwork);
      },1000/24);
    });
  } finally {for(const track of stream.getTracks())track.stop();}
}

export function tokenTexturePatch(path,lockRotation,prefix='',scale=1) {
  return Object.fromEntries(Object.entries({lockRotation,'texture.src':path,'texture.fit':'contain','texture.anchorX':.5,'texture.anchorY':.5,'texture.scaleX':scale,'texture.scaleY':scale})
    .map(([key,value])=>[prefix+key,value]));
}
