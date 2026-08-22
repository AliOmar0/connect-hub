-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_name text NOT NULL,
  branch_code text NOT NULL UNIQUE,
  address text NOT NULL,
  city text NOT NULL,
  phone text,
  manager_id uuid,
  opening_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT branches_pkey PRIMARY KEY (id),
  CONSTRAINT branches_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees(id)
);
CREATE TABLE public.employees (
  id uuid NOT NULL,
  full_name text NOT NULL,
  employee_number text NOT NULL UNIQUE,
  branch_id uuid NOT NULL,
  position text NOT NULL,
  department text NOT NULL,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  salary numeric NOT NULL CHECK (salary >= 0::numeric),
  role USER-DEFINED NOT NULL DEFAULT 'teller'::employee_role,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employees_pkey PRIMARY KEY (id),
  CONSTRAINT employees_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT employees_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL,
  full_name text NOT NULL,
  national_id text NOT NULL UNIQUE,
  date_of_birth date NOT NULL CHECK (date_of_birth <= (CURRENT_DATE - '18 years'::interval)::date),
  gender USER-DEFINED,
  phone text NOT NULL,
  email text NOT NULL UNIQUE,
  address text,
  city text,
  country text NOT NULL DEFAULT 'EG'::text,
  occupation text,
  income_range text,
  kyc_status USER-DEFINED NOT NULL DEFAULT 'pending'::kyc_status,
  profile_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.account_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type_name text NOT NULL UNIQUE,
  min_balance numeric NOT NULL DEFAULT 0 CHECK (min_balance >= 0::numeric),
  interest_rate numeric NOT NULL DEFAULT 0 CHECK (interest_rate >= 0::numeric),
  monthly_fee numeric NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0::numeric),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.currencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  currency_code text NOT NULL UNIQUE CHECK (char_length(currency_code) = 3),
  currency_name text NOT NULL,
  exchange_rate numeric NOT NULL CHECK (exchange_rate > 0::numeric),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT currencies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_number text UNIQUE,
  customer_id uuid NOT NULL,
  account_type_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  currency_id uuid NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  available_balance numeric NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'active'::account_status,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT accounts_account_type_id_fkey FOREIGN KEY (account_type_id) REFERENCES public.account_types(id),
  CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
  CONSTRAINT accounts_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transaction_ref text UNIQUE,
  from_account_id uuid,
  to_account_id uuid,
  transaction_type USER-DEFINED NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  currency_id uuid NOT NULL,
  fee_amount numeric NOT NULL DEFAULT 0 CHECK (fee_amount >= 0::numeric),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::transaction_status,
  description text,
  channel USER-DEFINED NOT NULL DEFAULT 'online'::transaction_channel,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_from_account_id_fkey FOREIGN KEY (from_account_id) REFERENCES public.accounts(id),
  CONSTRAINT transactions_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES public.accounts(id),
  CONSTRAINT transactions_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES public.currencies(id)
);
CREATE TABLE public.loans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  account_id uuid NOT NULL,
  loan_type USER-DEFINED NOT NULL,
  principal_amount numeric NOT NULL CHECK (principal_amount > 0::numeric),
  interest_rate numeric NOT NULL CHECK (interest_rate >= 0::numeric),
  duration_months integer NOT NULL CHECK (duration_months > 0),
  status USER-DEFINED NOT NULL DEFAULT 'pending'::loan_status,
  approved_by uuid,
  approved_at timestamp with time zone,
  disbursed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT loans_pkey PRIMARY KEY (id),
  CONSTRAINT loans_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT loans_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id),
  CONSTRAINT loans_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.employees(id)
);
CREATE TABLE public.loan_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  due_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  principal_portion numeric NOT NULL CHECK (principal_portion >= 0::numeric),
  interest_portion numeric NOT NULL CHECK (interest_portion >= 0::numeric),
  paid_amount numeric NOT NULL DEFAULT 0 CHECK (paid_amount >= 0::numeric),
  paid_at timestamp with time zone,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::installment_status,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT loan_installments_pkey PRIMARY KEY (id),
  CONSTRAINT loan_installments_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id)
);
CREATE TABLE public.guarantors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL,
  guarantor_name text NOT NULL,
  national_id text NOT NULL,
  phone text NOT NULL,
  relationship_to_borrower text NOT NULL,
  address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT guarantors_pkey PRIMARY KEY (id),
  CONSTRAINT guarantors_loan_id_fkey FOREIGN KEY (loan_id) REFERENCES public.loans(id)
);
CREATE TABLE public.cheques (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cheque_number text NOT NULL,
  account_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'issued'::cheque_status,
  beneficiary_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cheques_pkey PRIMARY KEY (id),
  CONSTRAINT cheques_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.beneficiaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  beneficiary_name text NOT NULL,
  beneficiary_account_number text NOT NULL,
  bank_name text NOT NULL,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT beneficiaries_pkey PRIMARY KEY (id),
  CONSTRAINT beneficiaries_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'info'::notification_type,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.security_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  ip_address inet,
  device_info jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT security_logs_pkey PRIMARY KEY (id),
  CONSTRAINT security_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.cards (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  card_number text NOT NULL UNIQUE,
  account_id uuid NOT NULL,
  card_type USER-DEFINED NOT NULL,
  card_network text NOT NULL,
  expiry_date date NOT NULL,
  cvv_hash text NOT NULL,
  credit_limit numeric CHECK (credit_limit IS NULL OR credit_limit >= 0::numeric),
  available_credit numeric CHECK (available_credit IS NULL OR available_credit >= 0::numeric),
  status USER-DEFINED NOT NULL DEFAULT 'active'::card_status,
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cards_pkey PRIMARY KEY (id),
  CONSTRAINT cards_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);