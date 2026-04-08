import { z } from 'zod';
export declare const planCreateSchema: z.ZodObject<{
    goal: z.ZodString;
    deadline: z.ZodString;
    requirement: z.ZodString;
    type: z.ZodEnum<["general", "study", "work"]>;
}, "strip", z.ZodTypeAny, {
    goal: string;
    deadline: string;
    requirement: string;
    type: "general" | "study" | "work";
}, {
    goal: string;
    deadline: string;
    requirement: string;
    type: "general" | "study" | "work";
}>;
