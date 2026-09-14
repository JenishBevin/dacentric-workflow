import { CustomerStatus } from "@dacentric/types";

export interface CreateCustomerInput {
  name: string;
  customerType?: string;
  industry?: string;
  website?: string;
  country?: string;
  city?: string;
  address?: string;
  mainContactName?: string;
  designation?: string;
  email?: string;
  phone?: string;
  alternateContact?: string;
  status?: CustomerStatus;
  accountManagerId?: string | null;
  rating?: string;
  notes?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export interface CreateContactInput {
  name: string;
  designation?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

export type UpdateContactInput = Partial<CreateContactInput>;
