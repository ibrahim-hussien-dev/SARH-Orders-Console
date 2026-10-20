import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().min(8).max(72).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes.',
  ),
}).strict();

export const loginSchema = z.object({
  email: z
    .string()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().max(128),
});
