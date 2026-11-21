export const segmentLength = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export const pathLength = points => points.slice(1).reduce((sum,point,index)=>sum+segmentLength(points[index],point),0);

export function pointAlong(points, distance) {
  let remaining = Math.max(0,distance);
  for (let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],length=segmentLength(a,b);
    if (length && remaining<=length) return {x:a.x+(b.x-a.x)*remaining/length,y:a.y+(b.y-a.y)*remaining/length};
    remaining-=length;
  }
  return points.at(-1);
}

export function nearestOnPath(points, point) {
  let best=null,traversed=0;
  for (let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=segmentLength(a,b);
    if (!length) continue;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(length*length)));
    const projected={x:a.x+dx*t,y:a.y+dy*t};
    const gap=segmentLength(projected,point);
    if (!best||gap<best.gap) best={point:projected,gap,distance:traversed+length*t,index:i};
    traversed+=length;
  }
  return best;
}

export function sliceTravelPath(points, from, to) {
  if (from>to) return sliceTravelPath(points,to,from).reverse();
  let distance=0;
  const slice=[pointAlong(points,from)];
  for (let i=1;i<points.length;i++) {
    distance+=segmentLength(points[i-1],points[i]);
    if (distance>from && distance<to) slice.push(points[i]);
  }
  if (to>from) slice.push(pointAlong(points,to));
  return slice;
}

export function compactPath(points, minStep=3) {
  return points.filter((point,index)=>index===0||index===points.length-1||segmentLength(points[index-1],point)>=minStep)
    .filter((point,index,rows)=>index===0||segmentLength(rows[index-1],point)>0.01);
}
