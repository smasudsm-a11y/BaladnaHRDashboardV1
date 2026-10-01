-- Qatari Social Allowance, broken out of other_allowances (2026-10-01).
-- Baladna's Qatari National pay scale EXCLUDES the social allowance, so it
-- must come off total cash before a national is compared with their band
-- (bandComparablePay in app/js/data.js). Amounts come from the SAP Master
-- List's own "Social Allowance" column (4,000 or 6,000; only Qatari
-- nationals receive it). The value stays inside other_allowances and
-- total_cash_compensation too, so no existing total changes -- this column
-- just makes it identifiable. Loaded by re-uploading "07 - Compensation
-- Dashboard" (Total Rewards sheet gains a "Social Allowance" column).
-- No RLS change: same table, same policies.

alter table total_rewards add column if not exists social_allowance numeric default 0;
