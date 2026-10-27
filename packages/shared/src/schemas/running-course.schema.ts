import {z} from 'zod';

export const COURSE_GPS_TOLERANCE_M = 30;
export const COURSE_REWARD_MIN_LENGTH_M = 500;
export const coursePointSchema=z.tuple([z.number().finite().min(-85).max(85),z.number().finite().min(-180).max(180)]);
export const courseRouteSchema=z.array(coursePointSchema).min(4).max(2000);
export const createRunningCourseSchema=z.object({name:z.string().trim().min(1).max(60),source_session_id:z.string().uuid(),route:courseRouteSchema}).strict();
export const renameRunningCourseSchema=z.object({name:z.string().trim().min(1).max(60)}).strict();
export const runningCourseSchema=z.object({id:z.string().uuid(),name:z.string(),route:courseRouteSchema,length_m:z.number().positive(),laps:z.number().int().nonnegative(),running_days:z.number().int().nonnegative()});
export const runningCourseListSchema=z.object({owner:z.object({id:z.string(),name:z.string()}),courses:z.array(runningCourseSchema).max(50)});
export type RunningCourseList=z.infer<typeof runningCourseListSchema>;
export type RunningCourse=z.infer<typeof runningCourseSchema>;
export type CoursePoint=z.infer<typeof coursePointSchema>;
export const courseProgressSchema=z.object({arc:z.number().finite().nonnegative().nullable(),anchor:z.number().finite().nonnegative().nullable(),direction:z.union([z.literal(-1),z.literal(0),z.literal(1)]),travelled:z.number().finite().nonnegative(),laps:z.number().int().nonnegative(),last_at:z.number().finite().nonnegative()}).strict();
export type CourseProgress=z.infer<typeof courseProgressSchema>;

export const COURSE_REWARDS=[
  {id:'course-title',kind:'title',name:'いつもの道のランナー',laps:5,days:2},
  {id:'course-frame',kind:'frame',name:'サーキット・シルバー',laps:10,days:3},
  {id:'course-uniform',kind:'uniform',name:'CIRCUIT CREW',laps:30,days:7},
] as const;
export const cosmeticSelectionSchema=z.object({title_id:z.literal('course-title').nullable(),frame_id:z.literal('course-frame').nullable(),revision:z.number().int().nonnegative()}).strict();
export const courseUniformEquipSchema=z.object({revision:z.number().int().nonnegative()}).strict();
export const courseRewardInventorySchema=z.object({equipped:cosmeticSelectionSchema,unlocked:z.array(z.object({reward_id:z.enum(['course-title','course-frame','course-uniform']),unlocked_at:z.string()}))});
export type CourseRewardInventory=z.infer<typeof courseRewardInventorySchema>;
