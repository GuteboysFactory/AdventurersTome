const tau=2*Math.PI;
export const FRAME_ANIMATION_DURATION=4200;
export const FRAME_EFFECT_PADDING=Object.freeze({
  fire:196,emberFire:125,glow:106,sparks:149,frost:120,arcane:89,
  ghostlyLight:150,holyAura:139,deathShadow:175,feyWisps:112,stormHalo:130,
  sickness:195,angry:145,healing:140,moonlight:105,sandstorm:185,tidalRing:110,
  bloodMoon:95,autumnLeaves:130,voidRift:120,runicWard:85,celestialOrbit:120
});
const signal=(seed,index)=>((Math.sin(seed*127.1+index*311.7)*43758.5453)%1+1)%1;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const p=clamp(value);return p*p*(3-2*p);};
const mix=(a,b,t)=>a+(b-a)*t;
const flameSurfaces=new WeakMap();
const fieldScale=2;
const flameRamps=[
  [0,198,29,3],[.21,244,52,6],[.43,255,116,13],[.64,255,189,41],[.84,255,234,124],[1,255,249,209]
];

const palette=Array.from({length:256},(_,index)=>{
  const point=index/255;
  const upper=Math.max(1,flameRamps.findIndex(stop=>stop[0]>=point));
  const [x,...a]=flameRamps[upper-1], [y,...b]=flameRamps[upper];
  return a.map((component,i)=>Math.round(mix(component,b[i],(point-x)/(y-x))));
});

function softLight(ctx,x,y,extent,rgb,alpha){
  const falloff=ctx.createRadialGradient(x,y,0,x,y,extent);
  falloff.addColorStop(0,`rgba(${rgb},${clamp(alpha)})`);
  falloff.addColorStop(.38,`rgba(${rgb},${clamp(alpha*.39)})`);
  falloff.addColorStop(1,`rgba(${rgb},0)`);
  ctx.fillStyle=falloff;
  ctx.fillRect(x-extent,y-extent,extent*2,extent*2);
}

function aura(ctx,points,rgb,strength,reach){
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for(const position of points.slice(1))ctx.lineTo(...position);
  ctx.closePath();
  for(let layer=9;layer>=1;layer--){
    ctx.lineWidth=reach*(layer/9)*1.6;
    ctx.strokeStyle=`rgba(${rgb},${strength*(.016+.16*(1-layer/10)**2)})`;
    ctx.stroke();
  }
}

function effectPoint(points,angle,offset=0){
  const index=((angle/tau%1+1)%1)*points.length;
  const point=points[Math.floor(index)%points.length];
  const next=points[Math.ceil(index)%points.length];
  const blend=index%1;
  const x=mix(point[0],next[0],blend),y=mix(point[1],next[1],blend);
  const radial=Math.hypot(x,y)||1;
  return [x+x/radial*offset,y+y/radial*offset];
}

function flameTile(ctx,points){
  const side=Math.ceil((Math.max(...points.map(([x,y])=>Math.max(Math.abs(x),Math.abs(y))))+74)/fieldScale)*2;
  let cached=flameSurfaces.get(ctx.canvas);
  if(!cached||cached.canvas.width!==side){
    const canvas=ctx.canvas.ownerDocument.createElement('canvas');
    canvas.width=canvas.height=side;
    const drawing=canvas.getContext('2d');
    cached={canvas,drawing,image:drawing.createImageData(side,side)};
    flameSurfaces.set(ctx.canvas,cached);
  }
  return cached;
}

const fireStyles={
  emberFire:{height:29,wind:2,spread:1.6,rim:.42,embers:22,color:'255,64,14'},
  fire:{height:53,wind:7,spread:2.6,rim:.53,embers:32,color:'255,102,18'}
};
const noiseCells=Float32Array.from({length:128*16},(_,index)=>signal((index>>4)-31,index&15));

function flameNoise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
  const cell=(a,b)=>noiseCells[(((a+64)&127)<<4)|(b&15)];
  return mix(mix(cell(ix,iy),cell(ix+1,iy),u),mix(cell(ix,iy+1),cell(ix+1,iy+1),u),v);
}

// Sample the upper edge column by column so flames originate on the actual
// frame, including irregular illustrations. Interpolate between columns for drift.
function upperEdge(points,width,center){
  const edge=new Float32Array(width).fill(Infinity);
  for(const [index,[x0,y0]] of points.entries()){
    const [x1,y1]=points[(index+1)%points.length];
    if(x0===x1)continue;
    const first=Math.max(0,Math.ceil(Math.min(x0,x1)/fieldScale+center-.5));
    const last=Math.min(width-1,Math.floor(Math.max(x0,x1)/fieldScale+center-.5));
    for(let column=first;column<=last;column++){
      const x=(column+.5-center)*fieldScale;
      edge[column]=Math.min(edge[column],mix(y0,y1,(x-x0)/(x1-x0)));
    }
  }
  return edge;
}

function fire(ctx,t,points,strength,style=fireStyles.fire){
  aura(ctx,points,style.color,style.rim*strength,19);
  const {image:flameImage,drawing:flameContext,canvas:flameSurface}=flameTile(ctx,points);
  const fieldSize=flameSurface.width,center=fieldSize/2;
  const floor=upperEdge(points,fieldSize,center);
  const pixels=flameImage.data;
  const phase=t*tau;
  const height=style.height;
  const brightness=style===fireStyles.emberFire?.84:1;
  for(let row=0;row<fieldSize;row++){
    const y=(row+.5-center)*fieldScale;
    for(let col=0;col<fieldSize;col++){
      const address=(row*fieldSize+col)*4;
      pixels[address+3]=0;
      const fromEdge=floor[col]-y;
      if(!Number.isFinite(fromEdge)||fromEdge<0||fromEdge>height*1.25)continue;
      const x=(col+.5-center)*fieldScale;
      const depth=clamp(fromEdge/height);
      const sway=depth*(style.wind*(.62+.38*Math.sin(phase+.8))+(flameNoise(x*.048,fromEdge*.047-t*16)-.5)*11);
      const source=clamp(col-sway/fieldScale,0,fieldSize-1);
      const left=floor[Math.floor(source)],right=floor[Math.ceil(source)];
      const rise=(Number.isFinite(left)&&Number.isFinite(right)?mix(left,right,source%1):floor[col])-y;
      if(rise<0||rise>height*1.15)continue;
      // The phase is subtracted from distance along the plume: features move
      // from the edge toward greater lift as time advances.
      const sourceX=x-sway;
      const flow=flameNoise(sourceX*.079,rise*.057-t*16);
      const fine=flameNoise(sourceX*.156,rise*.107-t*32);
      const billow=flameNoise(sourceX*.032,rise*.03-t*16);
      const tongue=style.spread*(flow-.48)+.58*(fine-.5);
      const reach=height*(.42+.78*billow);
      const body=(reach-rise)/reach;
      const heat=clamp((body+.47*tongue-.02)*1.17)*(.68+.34*flow)*(1-smooth(rise/(height*1.12)));
      if(heat<.015)continue;
      const color=palette[Math.round(clamp(heat*1.22*brightness)*255)];
      pixels[address]=color[0];pixels[address+1]=color[1];pixels[address+2]=color[2];
      pixels[address+3]=Math.round(255*clamp((246/255)*smooth(heat/.79)*strength));
    }
  }
  flameContext.putImageData(flameImage,0,0);
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(flameSurface,-center*fieldScale,-center*fieldScale,fieldSize*fieldScale,fieldSize*fieldScale);
  for(let i=0;i<style.embers;i++){
    const age=(t*(1+i%3)+signal(7,i))%1;
    const column=Math.floor(signal(17,i)*fieldSize);
    const startY=floor[column];
    if(!Number.isFinite(startY))continue;
    const startX=(column+.5-center)*fieldScale;
    const wind=style.wind*age*1.9+(signal(14,i)-.5)*18*age+4*Math.sin(age*8+i)*age;
    const lift=(15+signal(21,i)*height*1.14)*Math.pow(age,.76);
    const x=startX+wind,y=startY-lift;
    const alpha=(1-age)**1.2*smooth(age/.14)*strength;
    const size=(.55+signal(22,i)*.65)*(1-age*.42);
    softLight(ctx,x,y,2+size*1.4,'255,91,22',alpha*.44);
    ctx.fillStyle=`rgba(255,200,107,${clamp(alpha)})`;
    ctx.beginPath();ctx.ellipse(x,y,size,size*.74,.5,0,tau);ctx.fill();
  }
}


function glow(ctx,t,points,strength){
  const breathing=.5+.5*Math.sin(t*tau-Math.PI/2);
  aura(ctx,points,'255,200,125',(.58+breathing*.34)*strength,25+breathing*13);
  const angle=t*tau;
  for(let i=0;i<3;i++){
    const [x,y]=effectPoint(points,angle+i*tau/3,2);
    softLight(ctx,x,y,24,'255,222,159',.54*strength);
  }
}

function sparks(ctx,t,points,strength){
  aura(ctx,points,'255,108,28',.35*strength,15);
  for(let i=0;i<45;i++){
    const age=(t*(i%3+1)+signal(33,i))%1;
    const a=signal(20,i)*tau;
    const start=effectPoint(points,a,-1);
    const speed=12+signal(15,i)*37;
    const distance=Math.hypot(...start)||1;
    const velocity=[start[0]/distance*speed,start[1]/distance*speed-24];
    const position=p=>[start[0]+p*velocity[0],start[1]+p*velocity[1]+22*p*p];
    const [x,y]=position(age);
    const [sx,sy]=position(Math.max(0,age-.1));
    const fade=smooth(age/.08)*Math.pow(1-age,.8)*strength;
    const tail=ctx.createLinearGradient(sx,sy,x+.001,y+.001);
    tail.addColorStop(0,'transparent');tail.addColorStop(1,`rgba(255,167,63,${clamp(fade*.85)})`);
    ctx.strokeStyle=tail;ctx.lineWidth=.6+signal(3,i);
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(x,y);ctx.stroke();
    if(i%3===0)softLight(ctx,x,y,5,'255,115,33',fade*.5);
    ctx.fillStyle=`rgba(255,229,154,${clamp(fade)})`;ctx.fillRect(x-.6,y-.6,1.2,1.2);
  }
}

function frost(ctx,t,points,strength){
  aura(ctx,points,'126,212,255',.34*strength,30);
  for(let i=0;i<19;i++){
    const angle=i*tau/19+.13*Math.sin(t*tau+i);
    const reach=9+9*Math.sin(t*tau+i*1.15);
    const [x,y]=effectPoint(points,angle,reach);
    softLight(ctx,x,y,18+7*signal(10,i),'135,212,245',(.18+.11*Math.sin(i+t*tau))*strength);
  }
  for(let i=0;i<28;i++){
    const age=(t*(i%2+1)+signal(9,i))%1;
    const a=signal(17,i)*tau;
    const [x0,y0]=effectPoint(points,a,8);
    const x=x0+age*(22*signal(11,i)-6)+2*Math.sin(age*7+i);
    const y=y0+age*(12+signal(3,i)*17);
    const size=(1.2+2*signal(4,i))*(.6+age*.4);
    ctx.strokeStyle=`rgba(205,242,255,${clamp(Math.sin(age*Math.PI)*.75*strength)})`;ctx.lineWidth=.8;
    ctx.beginPath();
    for(let branch=0;branch<3;branch++){
      const angle=branch*Math.PI/3+age*.8;
      const dx=Math.cos(angle)*size,dy=Math.sin(angle)*size;
      ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);
    }
    ctx.stroke();
  }
}

function arcane(ctx,t,points,strength){
  aura(ctx,points,'132,73,246',.41*strength,24);
  for(let i=0;i<3;i++){
    const angle=(t+i/3)*tau;
    for(let trail=0;trail<16;trail++){
      const [x,y]=effectPoint(points,angle-trail*.038,7+i*2);
      softLight(ctx,x,y,12,'149,86,255',(1-trail/16)*.20*strength);
    }
    const [x,y]=effectPoint(points,angle,7+i*2);
    softLight(ctx,x,y,14,'208,125,255',.54*strength);
  }
  ctx.lineWidth=1.15;
  for(let i=0;i<14;i++){
    const angle=i*tau/14;
    const [x,y]=effectPoint(points,angle,11);
    const charge=Math.pow(.5+.5*Math.cos((t*3-i*3/14)*tau),5);
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(y,x)+Math.PI/2);
    ctx.strokeStyle=`rgba(221,180,255,${clamp((.14+charge*.68)*strength)})`;
    ctx.beginPath();ctx.moveTo(-2,2);ctx.lineTo(0,-3);ctx.lineTo(2,2);
    if(i%2){ctx.moveTo(-2,-1);ctx.lineTo(3,1);}
    ctx.stroke();ctx.restore();
  }
}

function ghostlyLight(ctx,t,points,strength){
  aura(ctx,points,'98,219,205',.43*strength,24);
  for(let i=0;i<18;i++){
    const angle=i*tau/18+(signal(42,i)-.5)*.25;
    const age=(t+signal(43,i))%1;
    const fade=Math.sin(age*Math.PI)**1.4*strength;
    const [x,y]=effectPoint(points,angle+(age-.5)*.13,4+age*17);
    for(let trail=3;trail>=0;trail--){
      const lift=age*(10+12*signal(48,i));
      const sway=5*Math.sin(age*tau+i+trail*.4);
      softLight(ctx,x+sway-trail*2,y-lift+trail*3,13+age*5,'88,217,200',fade*.22);
    }
    softLight(ctx,x,y-age*11,6,'217,255,247',fade*.48);
  }
}

function holyAura(ctx,t,points,strength){
  const pulse=.5+.5*Math.cos(tau*t);
  aura(ctx,points,'255,218,125',(.55+.24*pulse)*strength,22+10*pulse);
  for(let i=0;i<24;i++){
    const angle=i*tau/24;
    const shimmer=.5+.5*Math.cos((t-i/24)*tau);
    const length=(i%3===0?25:12)*(1+.3*shimmer);
    const [x,y]=effectPoint(points,angle,2);
    const [endX,endY]=effectPoint(points,angle,2+length);
    const gold=ctx.createLinearGradient(x,y,endX,endY);
    gold.addColorStop(0,`rgba(255,249,200,${clamp((.36+.54*shimmer)*strength)})`);
    gold.addColorStop(.65,`rgba(255,195,76,${clamp(.23*shimmer*strength)})`);
    gold.addColorStop(1,'transparent');
    ctx.strokeStyle=gold;ctx.lineWidth=i%3===0?1.75:.85;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(endX,endY);ctx.stroke();
    if(i%3===0)softLight(ctx,x,y,12,'255,239,171',shimmer*.57*strength);
  }
}

function deathShadow(ctx,t,points,strength){
  aura(ctx,points,'25,13,44',.89*strength,40);
  for(let i=0;i<17;i++){
    const age=(t*(1+i%2)+signal(53,i))%1;
    const fade=Math.sin(Math.PI*age)**1.2*strength;
    const angle=i*tau/17+(signal(57,i)-.5)*.36;
    const reach=19+20*signal(59,i);
    const [x,y]=effectPoint(points,angle,1);
    const [endX,endY]=effectPoint(points,angle+age*.22,5+age*reach);
    const bend=8*Math.sin(age*tau+i);
    softLight(ctx,endX,endY,13+age*8,'30,17,48',fade*.81);
    const shadow=ctx.createLinearGradient(x,y,endX,endY);
    shadow.addColorStop(0,`rgba(72,47,103,${clamp(fade*.58)})`);
    shadow.addColorStop(.52,`rgba(28,17,47,${clamp(fade*.92)})`);
    shadow.addColorStop(.85,`rgba(95,61,133,${clamp(fade*.44)})`);
    shadow.addColorStop(1,'transparent');
    ctx.strokeStyle=shadow;ctx.lineWidth=1+(1-age)*3;
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.bezierCurveTo(mix(x,endX,.3)+bend,mix(y,endY,.3),mix(x,endX,.7)-bend,mix(y,endY,.7),endX,endY);
    ctx.stroke();
  }
}

function feyWisps(ctx,t,points,strength){
  aura(ctx,points,'139,209,88',.28*strength,18);
  for(let i=0;i<15;i++){
    const angle=(t*(i%2===0?1:-1)+signal(61,i))*tau;
    const twinkle=.5+.5*Math.sin(t*2*tau+i);
    const extent=11+12*signal(62,i)+4*Math.sin(t*tau+i);
    const [x,y]=effectPoint(points,angle,extent);
    const hue=i%3===0?'255,215,115':'155,246,116';
    softLight(ctx,x,y,5+5*twinkle,hue,(.22+.58*twinkle)*strength);
    ctx.fillStyle=`rgba(242,255,213,${clamp((.21+.74*twinkle)*strength)})`;
    ctx.beginPath();ctx.ellipse(x,y,.65+twinkle*.5,.65+twinkle*.5,0,0,tau);ctx.fill();
  }
}

function stormHalo(ctx,t,points,strength){
  aura(ctx,points,'71,141,255',(.35+.22*Math.cos(t*tau*2))*strength,26);
  for(let i=0;i<12;i++){
    const age=(t*3+signal(67,i))%1;
    const flash=(1-smooth(age/.29))*smooth(age/.038)*strength;
    if(flash<=0)continue;
    const angle=i*tau/12+.17*Math.sin((t+i/12)*tau);
    const [x,y]=effectPoint(points,angle,1);
    const [aX,aY]=effectPoint(points,angle+.07,10);
    const [bX,bY]=effectPoint(points,angle-.018,17);
    const [cX,cY]=effectPoint(points,angle+.15,22+9*signal(68,i));
    softLight(ctx,bX,bY,14,'103,167,255',.65*flash);
    ctx.strokeStyle=`rgba(206,237,255,${clamp(flash)})`;ctx.lineWidth=1.15;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(aX,aY);ctx.lineTo(bX,bY);ctx.lineTo(cX,cY);ctx.stroke();
  }
}

function driftingCloud(ctx,t,points,strength,config){
  aura(ctx,points,config.rim,.35*strength,24);
  for(let index=0;index<31;index++){
    const age=(t*(1+index%2)+signal(71,index))%1;
    const angle=(index/31+(config.spin?t:0))*tau;
    const [x,y]=effectPoint(points,angle,3+config.drift*age);
    const density=Math.sin(age*Math.PI)**1.6*(.3+.5*signal(72,index))*strength;
    const width=6+13*age;
    const x1=x+config.slant*age+3*Math.sin(age*tau+index);
    const y1=y-config.lift*age;
    softLight(ctx,x1,y1,width,config.cloud,density*.75);
    softLight(ctx,x1+2,y1-1,width*.42,config.rim,density*.42);
  }
}

function anger(ctx,t,points,strength){
  const beat=(t*3)%1;
  const shock=Math.exp(-beat*5)*smooth(beat/.07)*strength;
  aura(ctx,points,'251,28,23',.3*strength+1.15*shock,26);
  for(let i=0;i<16;i++){
    const angle=(i/16+.015*Math.sin(t*tau))*tau;
    const [x,y]=effectPoint(points,angle,1+beat*10);
    const [tipX,tipY]=effectPoint(points,angle+.06,4+shock*(15+12*signal(76,i)));
    const [endX,endY]=effectPoint(points,angle+.09,1+beat*10);
    ctx.strokeStyle=`rgba(255,73,44,${clamp(shock*.91)})`;
    ctx.lineWidth=1.7;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tipX,tipY);ctx.lineTo(endX,endY);ctx.stroke();
  }
}

function healing(ctx,t,points,strength){
  const pulse=.55+.45*Math.cos(t*tau);
  aura(ctx,points,'72,217,134',(.38+.27*pulse)*strength,28);
  for(let i=0;i<16;i++){
    const angle=i*tau/16;
    const age=(t+signal(83,i))%1;
    const fade=Math.sin(age*Math.PI)*strength;
    const [x,y]=effectPoint(points,angle,8+16*age);
    const y1=y-17*age;
    const arm=1.6+age;
    softLight(ctx,x,y1,9,'114,233,144',fade*.6);
    ctx.strokeStyle=`rgba(223,255,222,${clamp(fade*.78)})`;ctx.lineWidth=.9;
    ctx.beginPath();
    ctx.moveTo(x-arm,y1);ctx.lineTo(x+arm,y1);
    ctx.moveTo(x,y1-arm);ctx.lineTo(x,y1+arm);
    ctx.stroke();
  }
}

function moonlight(ctx,t,points,strength){
  aura(ctx,points,'106,133,217',.28*strength,18);
  for(let i=0;i<48;i++){
    const angle=(i/48+t)*tau;
    const [x,y]=effectPoint(points,angle,7);
    const light=Math.max(0,Math.sin(i*Math.PI/48))**2*strength;
    softLight(ctx,x,y,9,'172,210,252',light*.34);
  }
  const [x,y]=effectPoint(points,(t+.5)*tau,11);
  softLight(ctx,x,y,16,'224,239,255',strength*.68);
}

function ribbon(ctx,t,points,strength,config){
  aura(ctx,points,config.color,.28*strength,20);
  for(let band=0;band<2;band++){
    const segments=60;
    for(let i=0;i<segments;i++){
      const turn=i/segments;
      const angle=(turn+t*config.speed+band*.5)*tau;
      const edge=position=>effectPoint(points,position,8+band*8+config.wave(position,band,t));
      const [x,y]=edge(angle);
      const [endX,endY]=edge(angle+.95*tau/segments);
      const opacity=(.15+.66*Math.sin(turn*Math.PI)**2)*strength;
      ctx.strokeStyle=`rgba(${config.color},${clamp(opacity)})`;
      ctx.lineWidth=band===0?2.4:1.1;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(endX,endY);ctx.stroke();
      if(i%4===0)softLight(ctx,x,y,8,config.color,opacity*.66);
    }
  }
}

function bloodMoon(ctx,t,points,strength){
  const pulse=.5+.5*Math.cos(t*tau);
  aura(ctx,points,'140,16,49',(.76+.25*pulse)*strength,29);
  for(let i=0;i<50;i++){
    const angle=i*tau/50;
    const [x,y]=effectPoint(points,angle,(5+11*pulse)*(1+.25*Math.cos(angle)));
    const crescent=(.14+.58*Math.max(0,Math.cos(angle-(t-.25)*tau))**2)*strength;
    softLight(ctx,x,y,8,'234,47,86',crescent);
  }
}

function autumnLeaves(ctx,t,points,strength){
  aura(ctx,points,'193,94,39',.26*strength,17);
  const leaves=['242,182,65','241,106,47','169,73,40'];
  for(let i=0;i<21;i++){
    const angle=i*tau/21;
    const age=(t+signal(92,i))%1;
    const [x,y]=effectPoint(points,angle,8+age*17);
    const width=.7+2.2*Math.abs(Math.cos(age*2*tau+i));
    ctx.save();
    ctx.translate(x+6*Math.sin(age*tau+i),y+22*age);
    ctx.rotate(age*tau+i);
    ctx.fillStyle=`rgba(${leaves[i%3]},${clamp(Math.sin(age*Math.PI)*.9*strength)})`;
    ctx.beginPath();ctx.ellipse(0,0,width,4.1,0,0,tau);ctx.fill();
    ctx.restore();
  }
}

function runicWard(ctx,t,points,strength){
  aura(ctx,points,'86,168,236',.41*strength,21);
  for(let i=0;i<14;i++){
    const angle=i*tau/14;
    const light=.34+.66*Math.max(0,Math.cos((t-i/14)*tau))**3;
    const [x,y]=effectPoint(points,angle,13);
    softLight(ctx,x,y,10,'88,183,243',light*.62*strength);
    ctx.save();
    ctx.translate(x,y);ctx.rotate(Math.atan2(y,x)+Math.PI/2);
    ctx.strokeStyle=`rgba(194,234,255,${clamp(light*strength)})`;ctx.lineWidth=.95;
    ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(0,4);
    ctx.moveTo(-3,i%2?-1:3);ctx.lineTo(2,-3);ctx.lineTo(3,.5);
    ctx.stroke();
    ctx.restore();
  }
}

function celestialOrbit(ctx,t,points,strength){
  aura(ctx,points,'142,164,255',.29*strength,19);
  for(let i=0;i<29;i++){
    const angle=(signal(95,i)+t*(i%2===0?1:-1))*tau;
    const [x,y]=effectPoint(points,angle,8+signal(97,i)*21);
    const shimmer=.12+.88*Math.max(0,Math.cos((t+signal(99,i))*tau))**2;
    softLight(ctx,x,y,i%4===0?8:4,'119,166,255',shimmer*.63*strength);
    ctx.fillStyle=`rgba(234,242,255,${clamp(shimmer*strength)})`;
    ctx.beginPath();ctx.ellipse(x,y,i%4===0?1.3:.55,i%4===0?1.3:.55,0,0,tau);ctx.fill();
  }
}

const effects={
  fire,emberFire:(ctx,t,points,strength)=>fire(ctx,t,points,strength,fireStyles.emberFire),
  glow,sparks,frost,arcane,ghostlyLight,holyAura,deathShadow,feyWisps,stormHalo,
  sickness:(ctx,t,points,strength)=>driftingCloud(ctx,t,points,strength,{rim:'179,200,71',cloud:'91,116,33',slant:11,lift:32,drift:15,spin:false}),
  angry:anger,healing,moonlight,
  sandstorm:(ctx,t,points,strength)=>driftingCloud(ctx,t,points,strength,{rim:'229,177,98',cloud:'176,115,53',slant:27,lift:3,drift:16,spin:true}),
  tidalRing:(ctx,t,points,strength)=>ribbon(ctx,t,points,strength,{color:'54,199,238',speed:1,wave:(a,b)=>5*Math.sin(a*6+b)}),
  bloodMoon,autumnLeaves,
  voidRift:(ctx,t,points,strength)=>ribbon(ctx,t,points,strength,{color:'158,75,242',speed:-1,wave:(a,b,t)=>10*Math.sin(a*12+b+t*tau)}),
  runicWard,celestialOrbit
};

export function paintFrameAnimation(ctx,effect,size,points,phase,strength=1){
  if(!Object.hasOwn(effects,effect)||!points.length)return;
  const center=size/2;
  const scale=size/188;
  const positions=points.map(([x,y])=>[(x-center)/scale,(y-center)/scale]);
  ctx.save();
  ctx.translate(center,center);
  ctx.scale(scale,scale);
  effects[effect](ctx,((phase%1)+1)%1,positions,strength);
  ctx.restore();
}
