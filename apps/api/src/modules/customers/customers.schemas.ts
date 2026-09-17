import { z } from "zod";
import { CustomerStatus } from "@dacentric/types";

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required.").max(200),
  customerType: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  website: z.string().max(300).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  vatNumber: z.string().max(50).optional(),
  mainContactName: z.string().max(150).optional(),
  designation: z.string().max(150).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  alternateContact: z.string().max(150).optional(),
  status: z.nativeEnum(CustomerStatus).default(CustomerStatus.PROSPECT),
  accountManagerId: z.string().uuid().optional().nullable(),
  rating: z.string().max(50).optional(),
  notes: z.string().max(4000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createContactSchema = z.object({
  name: z.string().min(1, "Contact name is required.").max(150),
  designation: z.string().max(150).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  isPrimary: z.boolean().optional(),
});

export const updateContactSchema = createContactSchema.partial();

export const setCustomerLinkSchema = z.object({
  customerId: z.string().uuid().nullable(),
});

export const createProductSchema = z.object({
  name: z.string().min(1, "Product name is required.").max(200),
  quantity: z.number().int().positive().optional(),
  amount: z.number().nonnegative().optional(),
  purchasedAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

export const createInteractionSchema = z.object({
  type: z.enum(["EMAIL", "CALL", "MEETING"]),
  subject: z.string().min(1, "Subject is required.").max(200),
  notes: z.string().max(4000).optional(),
  occurredAt: z.coerce.date(),
});
