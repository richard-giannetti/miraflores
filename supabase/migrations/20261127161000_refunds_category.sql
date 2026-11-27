-- Card refunds (from Stripe) are recorded in Money as their own expense category.
alter table public.transactions drop constraint transactions_category_check;
alter table public.transactions add constraint transactions_category_check check (
  (kind = 'income' and category in ('stay', 'airbnb', 'extra', 'other_income'))
  or (kind = 'expense' and category in ('cleaning', 'laundry', 'utilities', 'repairs', 'supplies', 'commissions', 'taxes', 'insurance', 'refunds', 'other'))
);
