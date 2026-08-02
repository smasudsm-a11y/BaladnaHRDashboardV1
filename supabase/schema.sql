-- Baladna HR Analytics — Supabase schema
-- Mirrors the 11 source workbooks in /Database exactly as used to build the local dashboard.
-- Run this whole file once in Supabase: Project > SQL Editor > New query > paste > Run.

create table employee_master (
  employee_id          text primary key,
  employee_number      text,
  employee_name        text,
  preferred_name        text,
  gender                text,
  nationality           text,
  date_of_birth         date,
  age                    integer,
  marital_status        text,
  employment_status     text,
  employee_type         text,
  full_time_part_time   text,
  hire_date             date,
  confirmation_date     date,
  termination_date      date,
  termination_reason    text,
  length_of_service     numeric,
  legal_entity          text,
  business_unit         text,
  department             text,
  division               text,
  section                text,
  cost_center            text,
  position_id            text,
  position_title         text,
  job_family             text,
  job_grade              text,
  job_level              text,
  line_manager_id        text,
  line_manager_name      text,
  location                text,
  country                 text,
  city                     text,
  employment_category     text
);

create table org_hierarchy (
  employee_id          text primary key references employee_master(employee_id),
  manager_id            text,
  manager_name          text,
  level1_leader          text,
  level2_leader          text,
  level3_leader          text,
  ceo_hierarchy_level    integer,
  department              text,
  division                text,
  function                text,
  cost_center             text
);

create table salary_structure (
  grade                text primary key,
  salary_range_min      numeric,
  salary_midpoint        numeric,
  salary_range_max       numeric
);

create table recruitment (
  requisition_id          text primary key,
  vacancy_position        text,
  job_grade                text,
  department                text,
  hiring_manager           text,
  requisition_open_date    date,
  requisition_close_date   date,
  candidate_id             text,
  candidate_gender         text,
  candidate_nationality    text,
  source_of_hire           text,
  interview_date           date,
  offer_date               date,
  joining_date             date,
  recruitment_cost         numeric
);

create table diversity (
  employee_id          text primary key references employee_master(employee_id),
  gender                text,
  nationality           text,
  ethnicity              text,
  age                    integer,
  age_band               text,
  disability_status      text,
  grade                  text,
  management_level       text,
  leadership_status      text
);

create table attrition (
  id                    bigint generated always as identity primary key,
  employee_id           text references employee_master(employee_id),
  hire_date              date,
  termination_date       date,
  termination_reason     text,
  voluntary_involuntary  text,
  department              text,
  grade                   text,
  manager                 text,
  gender                  text,
  age                     integer,
  tenure                  numeric
);

create table base_salary (
  id                     bigint generated always as identity primary key,
  employee_id            text references employee_master(employee_id),
  grade                   text,
  position                text,
  base_salary             numeric,
  currency                text,
  salary_effective_date   date
);

create table total_rewards (
  id                       bigint generated always as identity primary key,
  employee_id              text references employee_master(employee_id),
  salary_effective_date    date,
  housing_allowance        numeric,
  transport_allowance      numeric,
  education_allowance      numeric,
  other_allowances         numeric,
  variable_pay             numeric,
  bonus                    numeric,
  incentive                numeric,
  total_cash_compensation  numeric,
  total_remuneration       numeric
);

create table leave (
  id                bigint generated always as identity primary key,
  employee_id        text references employee_master(employee_id),
  leave_type          text,
  leave_start_date    date,
  leave_end_date      date,
  leave_days          numeric,
  leave_status        text,
  leave_balance       numeric,
  department           text,
  manager              text
);

create table absenteeism (
  id             bigint generated always as identity primary key,
  employee_id     text references employee_master(employee_id),
  absence_date     date,
  absence_type     text,
  absence_hours    numeric,
  paid_unpaid      text,
  department        text,
  manager           text
);

create table performance (
  id                        bigint generated always as identity primary key,
  employee_id                text references employee_master(employee_id),
  performance_cycle           text,
  goal_score                  numeric,
  competency_score             numeric,
  overall_rating               text,
  rating_date                  date,
  manager_rating                text,
  calibration_rating            text,
  promotion_recommendation      text
);

create table training (
  id                     bigint generated always as identity primary key,
  employee_id             text references employee_master(employee_id),
  course_name              text,
  training_category        text,
  training_hours           numeric,
  training_cost            numeric,
  completion_status        text,
  completion_date          date,
  certification_achieved   text
);

-- Indexes for the join patterns the dashboard uses (employee_id lookups, department/date filters)
create index on attrition (employee_id);
create index on base_salary (employee_id);
create index on total_rewards (employee_id);
create index on leave (employee_id);
create index on absenteeism (employee_id);
create index on performance (employee_id);
create index on training (employee_id);
create index on attrition (termination_date);
create index on leave (leave_start_date);
create index on absenteeism (absence_date);
