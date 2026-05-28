import { z } from 'zod';
import { accelerationDataSchema, pushupMeasurementSchema, bulkPushupMeasurementSchema } from '../schemas/pushup.schema';

export type AccelerationData = z.infer<typeof accelerationDataSchema>;
export type PushupMeasurement = z.infer<typeof pushupMeasurementSchema>;
export type BulkPushupMeasurement = z.infer<typeof bulkPushupMeasurementSchema>;
