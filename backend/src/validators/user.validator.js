import { z } from "zod";

export const createUserSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
});

export const updateUserSchema = z.object({
    role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
    isActive: z.boolean().optional(),
});