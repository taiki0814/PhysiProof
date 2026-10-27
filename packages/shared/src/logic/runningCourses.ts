import {COURSE_GPS_TOLERANCE_M,type CoursePoint,type CourseProgress} from '../schemas/running-course.schema';
import {telemetryDistance} from './runTelemetry';
import type {RunFix} from '../schemas/run-telemetry.schema';
import {createDefaultUniform} from './uniforms';

export function courseDistance(a:CoursePoint,b:CoursePoint){
  return telemetryDistance({latitude:a[0],longitude:a[1]} as RunFix,{latitude:b[0],longitude:b[1]} as RunFix);
}
export function courseLength(route:readonly CoursePoint[]){return route.slice(1).reduce((sum,p,i)=>sum+courseDistance(route[i],p),0);}
export function prepareCourse(route:CoursePoint[]):CoursePoint[]{
  const points=route.filter((p,i)=>i===0||courseDistance(route[i-1],p)>1);
  if(points.length<4||courseDistance(points[0],points[points.length-1])>40)throw new Error('一周して開始地点付近に戻ったコースを保存してください（終点は始点から40m以内）。');
  const closed=[...points.slice(0,-1),points[0]];
  const length=courseLength(closed);
  if(length<200||length>30000)throw new Error('コースは一周200m〜30kmにしてください。');
  return closed;
}
export function firstCourseLoop(route:CoursePoint[]):CoursePoint[]|null{
  if(route.length<4)return null;
  let distance=0;
  for(let i=1;i<route.length;i++){
    distance+=courseDistance(route[i-1],route[i]);
    if(distance>=200&&courseDistance(route[0],route[i])<=30){
      const loop=route.slice(0,i+1),stride=Math.max(1,Math.ceil(loop.length/1900));
      const simplified=loop.filter((_,index)=>index%stride===0||index===loop.length-1);
      try{return prepareCourse(simplified);}catch{return null;}
    }
  }
  return null;
}
// Metre-based local projection; course bounds are <=30 km and exclude polar latitudes.
function projections(route:readonly CoursePoint[],point:CoursePoint){
  const sx=111195*Math.cos(point[0]*Math.PI/180),sy=111195;
  let arc=0;const output:{arc:number;distance:number}[]=[];
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],x=(a[1]-point[1])*sx,y=(a[0]-point[0])*sy,dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy;
    const t=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1))),length=courseDistance(a,b);
    output.push({arc:arc+t*length,distance:Math.hypot(x+t*dx,y+t*dy)});arc+=length;
  }
  return output;
}
export function equivalentCourses(a:CoursePoint[],b:CoursePoint[]){
  const ratio=courseLength(a)/courseLength(b);
  if(ratio<.9||ratio>1.1)return false;
  const near=(source:CoursePoint[],target:CoursePoint[])=>source.every(point=>Math.min(...projections(target,point).map(p=>p.distance))<=COURSE_GPS_TOLERANCE_M);
  return near(a,b)&&near(b,a);
}
export const emptyCourseProgress=():CourseProgress=>({arc:null,anchor:null,direction:0,travelled:0,laps:0,last_at:0});
export function advanceCourse(route:CoursePoint[],previous:CourseProgress,fix:RunFix|null,valid:boolean,now:number,budgetM:number):CourseProgress{
  const reset={...emptyCourseProgress(),laps:previous.laps,last_at:now};
  if(!valid||!fix||fix.mocked||fix.accuracy_m<=0||fix.accuracy_m>30)return reset;
  const length=courseLength(route),point:[number,number]=[fix.latitude,fix.longitude];
  const candidates=projections(route,point).filter(p=>p.distance<=COURSE_GPS_TOLERANCE_M);
  if(!candidates.length)return reset;
  if(previous.arc===null||now-previous.last_at>45000){
    const closest=candidates.sort((a,b)=>a.distance-b.distance)[0];return {...reset,arc:closest.arc,anchor:closest.arc};
  }
  const circular=(a:number,b:number)=>((a-b+length*1.5)%length)-length/2;
  const choices=candidates.map(p=>({...p,delta:circular(p.arc,previous.arc!)}))
    .filter(p=>Math.abs(p.delta)<=Math.min(length*.4,Math.max(0,budgetM)*1.6+10))
    .sort((a,b)=>(a.distance+Math.abs(a.delta)*.05+(a.delta*previous.direction<0?2:0))-(b.distance+Math.abs(b.delta)*.05+(b.delta*previous.direction<0?2:0)));
  if(!choices.length)return reset;
  const choice=choices[0],direction=previous.direction||((Math.abs(choice.delta)>3?Math.sign(choice.delta):0) as -1|0|1);
  const travelled=Math.max(0,previous.travelled+choice.delta*direction);
  const closure=Math.min(30,length*.05),closed=previous.anchor!==null&&Math.abs(circular(choice.arc,previous.anchor))<=closure;
  if(travelled>=length-closure&&closed){return {arc:choice.arc,anchor:choice.arc,direction,travelled:0,laps:previous.laps+1,last_at:now};}
  return {...previous,arc:choice.arc,direction,travelled,last_at:now};
}
export function courseRewardUniform(){
  const base=createDefaultUniform();
  return {...base,pattern_id:'chevron' as const,line_id:'shoulder' as const,emblem_id:'wing' as const,
    colors:{...base.colors,body:'#14253d',secondary:'#223d5c',pattern:'#bff440',line:'#d9e8f5',emblem:'#bff440'},jersey_name:'CIRCUIT'};
}
