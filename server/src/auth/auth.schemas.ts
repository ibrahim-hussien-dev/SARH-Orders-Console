import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().max(128),
});
