-- Fixes New Hire Program rows landing twice (likely: the Training workbook
-- re-upload via Data Refresh, which already includes the 55 appended NHP
-- rows, PLUS the separate insert_new_hire_program.sql both ran). Clears every
-- New Hire Program row and re-inserts exactly once.

delete from training where training_category = 'New Hire Program';
