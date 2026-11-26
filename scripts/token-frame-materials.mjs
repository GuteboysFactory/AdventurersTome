import {FRAME_SILHOUETTES} from './token-frame-shapes.mjs';

const gray=value=>`#${value.toString(16).padStart(2,'0').repeat(3)}`;
const material = (label,family,texture,brightness,highlight,style,weight,image) =>
  Object.freeze({label,family,texture,color:gray(brightness),accent:gray(highlight),style,weight,image});

export const FRAME_MATERIALS = Object.freeze({
  none: material('No frame','Basic','plain',120,192,'none',28),
  plain: material('Solid color','Basic','plain',140,185,'single',24),
  gold: material('Antique metal','Metal','metal',143,211,'double',33),
  silver: material('Brushed silver','Metal','metal',173,232,'double',30),
  steel: material('Blackened steel','Metal','metal',76,169,'studs',34),
  bronze: material('Hammered metal','Metal','hammer',117,193,'studs',34),
  verdigris: material('Patinated metal','Metal','hammer',87,163,'double',34),
  ivoryMarble: material('Light marble','Stone','marble',205,106,'single',38),
  blackMarble: material('Dark marble','Stone','marble',58,201,'double',38),
  jade: material('Veined stone','Stone','marble',112,175,'double',36),
  weathered: material('Weathered stone','Stone','weathered',112,180,'single',44),
  slate: material('Carved slate','Stone','stone',84,180,'runes',38),
  oak: material('Carved oak','Wood & hide','wood',132,199,'double',38),
  darkwood: material('Ironwood','Wood & hide','wood',72,154,'studs',38),
  leather: material('Stitched leather','Wood & hide','leather',102,198,'stitch',38),
  dragon: material('Dragon scales','Fantasy','scales',103,189,'studs',42),
  serpent: material('Serpent scales','Fantasy','scales',131,176,'double',40),
  frost: material('Frost crystal','Fantasy','crystal',149,226,'runes',42),
  ember: material('Fractured crystal','Fantasy','crystal',93,207,'runes',42),
  arcane: material('Arcane crystal','Fantasy','crystal',116,217,'runes',40),
  briar: material('Briarwood','Fantasy','wood',89,177,'stitch',42),
  elvenLaurel: material('Elven laurel','Craft traditions','engraved',148,211,'single',34,'elven-laurel'),
  dwarvenIron: material('Dwarven ironwork','Craft traditions','engraved',130,192,'double',36,'dwarven-iron'),
  wyrmScale: material('Ancient wyrm scale','Fantasy','engraved',123,180,'single',42,'wyrm-scale'),
  runestone: material('Silver-inlaid runestone','Fantasy','engraved',105,186,'single',42,'runestone'),
  frostglass: material('Moonstone frostglass','Fantasy','engraved',169,226,'single',42,'frostglass'),
  boneCarving: material('Carved warden bone','Fantasy','engraved',176,218,'single',40,'bone-carving'),
  rootwood: material('Ancient rootwood','Fantasy','engraved',114,178,'single',40,'rootwood')
});

const ornamentLabels = {
  laurel:'Laurel sprig', hammer:'Forge hammer', emerald:'Emerald', sun:'Amber sun',
  crescent:'Moonstone crescent', seal:'Crimson seal'
};
export const FRAME_ORNAMENTS = Object.freeze({none:'None',...ornamentLabels});
export const FRAME_ORNAMENT_SLOTS = Object.freeze({top:'Top',right:'Right',bottom:'Bottom',left:'Left'});
let artworkPromise;
const illustratedArtwork=new Map();

async function loadArtwork(key,file) {
  const image=new Image();
  image.src=new URL(`../assets/token-frames/${file}.png`,import.meta.url).href;
  await image.decode();
  return [key,image];
}

export async function loadFrameArtwork(shape) {
  const files = [
    ...Object.entries(FRAME_MATERIALS).filter(([,appearance])=>appearance.image).map(([key,appearance])=>[key,appearance.image]),
    ...Object.keys(ornamentLabels).map(key=>[key,'ornament-'+key])
  ];
  artworkPromise ??= Promise.all(files.map(([key,file])=>loadArtwork(key,file))).then(Object.fromEntries).catch(error=>{
    artworkPromise=undefined;
    throw error;
  });
  const illustrated=Object.hasOwn(FRAME_SILHOUETTES,shape)?FRAME_SILHOUETTES[shape]:null;
  if(!illustrated)return artworkPromise;
  if(!illustratedArtwork.has(shape)){
    if(illustratedArtwork.size>=12)illustratedArtwork.delete(illustratedArtwork.keys().next().value);
    const pending=loadArtwork(shape,'shape-'+illustrated.file).catch(error=>{
      if(illustratedArtwork.get(shape)===pending)illustratedArtwork.delete(shape);
      throw error;
    });
    illustratedArtwork.set(shape,pending);
  }
  const [shared,entry]=await Promise.all([artworkPromise,illustratedArtwork.get(shape)]);
  return {...shared,[entry[0]]:entry[1]};
}

export function applyFrameMaterial(frame,key) {
  const appearance = Object.hasOwn(FRAME_MATERIALS,key) ? FRAME_MATERIALS[key] : null;
  return appearance ? {...frame,material:key,color:appearance.color,accent:appearance.accent,style:appearance.style,weight:appearance.weight} : frame;
}

const textureTiles = new Map();
const TILE_SIZE = 224;

export function blendColor(left,right,amount) {
  const first = Number.parseInt(left.slice(1),16), second=Number.parseInt(right.slice(1),16);
  return `rgb(${[16,8,0].map(shift=>Math.round(((first>>shift)&255)*(1-amount)+((second>>shift)&255)*amount)).join(',')})`;
}

function noise(seed) {
  let n=seed;
  return () => ((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
}

function vein(ctx,rng,accent,y) {
  const s=TILE_SIZE;
  const points=Array.from({length:12},(_,i)=>[s*i/11,y+s*i/16+(rng()-.5)*40]);
  for (const [width,alpha] of [[10,.18],[4.5,.42],[1.7,.93]]) {
    ctx.strokeStyle=accent;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.beginPath();
    for (const [i,point] of points.entries()) if(i===0)ctx.moveTo(...point);else ctx.lineTo(...point);
    ctx.stroke();
  }
  ctx.globalAlpha=.28;ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(...points[5]);
  ctx.lineTo(points[5][0]+32,points[5][1]-22);ctx.lineTo(points[5][0]+59,points[5][1]-29);ctx.stroke();
}

function paintTexture(tile,frame,family) {
  const seed=[...frame.material].reduce((value,char)=>Math.imul(value,31)+char.charCodeAt(0),391);
  const ctx=tile.getContext('2d'), s=TILE_SIZE, rng=noise(seed);
  const {color,accent}=frame;
  ctx.fillStyle=color;
  ctx.fillRect(0,0,s,s);
  if (family==='metal') {
    ctx.fillStyle=accent;
    for(let i=0;i<430;i++) {
      ctx.globalAlpha=.06+rng()*.24;
      ctx.fillStyle=i%4?accent:'#282828';
      ctx.fillRect(rng()*s,rng()*s,20+rng()*120,.7+rng());
    }
  } else if (family==='marble' || family==='crystal') {
    for(let i=0;i<9;i++)vein(ctx,rng,accent,-130+i*49+rng()*32);
    if (family==='crystal') for(let i=0;i<25;i++) {
      const x=rng()*s,y=rng()*s;
      ctx.fillStyle=i%2?accent:'#ffffff';ctx.globalAlpha=.08+rng()*.37;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8+rng()*22,y-10);ctx.lineTo(x+17,y+24);ctx.closePath();ctx.fill();
    }
  } else if (family==='weathered') {
    for(let i=0;i<2200;i++) {
      const x=rng()*s,y=rng()*s,r=.45+rng()**2*6.5;
      ctx.globalAlpha=.13+rng()*.42;ctx.fillStyle=i%3?accent:'#101010';
      ctx.beginPath();ctx.ellipse(x,y,r,r*.55,rng()*Math.PI,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<34;i++) {
      const x=rng()*s,y=rng()*s, dx=(rng()-.5)*37,dy=8+rng()*53;
      const points=[[x,y],[x+dx*.3-5,y+dy*.32],[x+dx*.17+4,y+dy*.67],[x+dx,y+dy]];
      for(const [offset,shade,width,alpha] of [[1.3,accent,2.4,.62],[0,'#111111',1.8,.85]]) {
        ctx.globalAlpha=alpha;ctx.strokeStyle=shade;ctx.lineWidth=width;
        ctx.beginPath();ctx.moveTo(points[0][0]+offset,points[0][1]);
        for(const [px,py] of points.slice(1))ctx.lineTo(px+offset,py);
        ctx.stroke();
      }
    }
  } else if (family==='wood') {
    for(let i=0;i<44;i++) {
      const y=rng()*s;
      ctx.globalAlpha=.19+rng()*.63;ctx.strokeStyle=i%3?accent:'#101010';ctx.lineWidth=.75+rng()*2.2;
      ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(60,y-26,154,y+17,s,y+9);ctx.stroke();
    }
  } else if (family==='scales') {
    for(let row=-1;row<11;row++)for(let col=-1;col<8;col++) {
      const x=col*32+(row%2)*16,y=row*22;
      ctx.globalAlpha=.36+rng()*.45;ctx.fillStyle=blendColor(color,accent,rng()*.8);
      ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+16,y-8,x+31,y);ctx.quadraticCurveTo(x+29,y+19,x+16,y+24);ctx.quadraticCurveTo(x+3,y+19,x,y);ctx.fill();
      ctx.strokeStyle=accent;ctx.lineWidth=2.05;ctx.stroke();
    }
  } else {
    const count=family==='leather'?1050:520;
    for(let i=0;i<count;i++) {
      const x=rng()*s,y=rng()*s,r=.25+rng()*(family==='hammer'?4:1.7);
      ctx.globalAlpha=.12+rng()*.43;ctx.fillStyle=i%2?accent:'#101010';
      ctx.beginPath();ctx.ellipse(x,y,r,r*.62,Math.PI/4,0,Math.PI*2);ctx.fill();
    }
  }
}

function paintTintedTexture(tile,source,color,opaque=true) {
  const ctx=tile.getContext('2d');
  ctx.drawImage(source,0,0);
  const pixels=ctx.getImageData(0,0,tile.width,tile.height);
  const rgb=Number.parseInt(color.slice(1),16);
  const tint=[rgb>>16,(rgb>>8)&255,rgb&255];
  const palette=tint.map(channel=>Uint8ClampedArray.from({length:256},(_,light)=>
    light<128 ? channel*light/128 : channel+(255-channel)*(light-128)/127));
  const rgba=pixels.data;
  for(let index=0;index<rgba.length;index+=4) {
    const luma=rgba[index]*.2126+rgba[index+1]*.7152+rgba[index+2]*.0722;
    const opacity=opaque?rgba[index+3]/255:1;
    const shade=Math.round(128+(luma-128)*opacity);
    rgba[index]=palette[0][shade];
    rgba[index+1]=palette[1][shade];
    rgba[index+2]=palette[2][shade];
    if(opaque)rgba[index+3]=255;
  }
  ctx.putImageData(pixels,0,0);
}

export function tintedSilhouette(ctx,key,source,color) {
  if(!color)return source;
  const cacheKey=`shape:${key}:${color}`;
  let tile=textureTiles.get(cacheKey);
  if(!tile){
    tile=ctx.canvas.ownerDocument.createElement('canvas');
    tile.width=source.naturalWidth;
    tile.height=source.naturalHeight;
    paintTintedTexture(tile,source,color,false);
    if(textureTiles.size>=36)textureTiles.delete(textureTiles.keys().next().value);
    textureTiles.set(cacheKey,tile);
  }
  return tile;
}

export function tokenFramePattern(ctx,frame,artwork) {
  const family=FRAME_MATERIALS[frame.material]?.texture;
  if(!family || family==='plain')return null;
  const source=artwork?.[frame.material];
  if(family==='engraved'&&!source)return null;
  const key=[frame.material,frame.color,frame.accent].join(':');
  let tile=textureTiles.get(key);
  if(!tile) {
    tile=ctx.canvas.ownerDocument.createElement('canvas');
    tile.width=tile.height=source?.naturalWidth||TILE_SIZE;
    if(source) paintTintedTexture(tile,source,frame.color);
    else paintTexture(tile,frame,family);
    if(textureTiles.size>=36)textureTiles.delete(textureTiles.keys().next().value);
    textureTiles.set(key,tile);
  }
  return ctx.createPattern(tile,'repeat');
}
