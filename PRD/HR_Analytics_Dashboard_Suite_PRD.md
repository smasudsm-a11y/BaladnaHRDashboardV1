
**HR ANALYTICS DASHBOARD SUITE**

Product Requirements Document (PRD)

*Self-Service Build via Power BI + Claude — No IT Development Dependency*

**Baladna Food Industries Q.P.S.C.**

People & Culture — Total Rewards Function

Document Owner: Total Rewards Manager

Version 1.0  |  July 2026

# Document Control

| **Version** | **Date** | **Author** | **Summary of Changes** |
| --- | --- | --- | --- |
| **0.1** | **Jul 2026** | **Total Rewards Manager** | **Initial draft based on internal requirements gathering** |
| **1.0** | **Jul 2026** | **Total Rewards Manager** | **Expanded scope following benchmark review against Agile HR Analytics (aha) product; added Internal Mobility, Engagement, Workforce Planning, Data Governance modules** |

## Distribution List

| **Name / Role** | **Involvement** |
| --- | --- |
| **Total Rewards Manager** | **Document owner, sole developer/builder** |
| **Yazan — Senior Approver** | **Reviews and approves scope, phasing, and executive-level deliverables** |
| **Sahana — HRIS Manager** | **Data source liaison; confirms field availability and export feasibility from SuccessFactors** |
| **Carlin — HRIS Team** | **Supports data extract structure and refresh logistics** |
| **Afkar Saleem — Total Rewards** | **Contributes to Compensation and Attrition module validation** |

# Table of Contents

# 1. Executive Summary

This PRD defines the scope, data requirements, and phased build plan for a comprehensive HR Analytics Dashboard Suite to be developed in-house by the Total Rewards function, using Power BI and Claude for data modeling, DAX development, and documentation — without dependency on IT development resources.

The requirement originated from an internal Power BI reporting specification covering 12 dashboards and roughly 45 metrics across the employee lifecycle. A subsequent benchmarking review against a commercial people-analytics product (“Agile HR Analytics”) surfaced a materially larger scope already standard in the market — including Employee Engagement, Internal Mobility, Workforce Planning & Simulation, and Data Governance — none of which existed in the original specification.

This document expands the original specification into 14 modules across three build phases, explicitly excludes a Conversational AI query layer (deferred to a future phase), and defines the data model, functional requirements, governance approach, and roadmap needed to build this without IT involvement.

### Key Facts

| **Item** | **Detail** |
| --- | --- |
| **Total Modules** | **14 (11 core reporting modules + 3 advanced modules), plus a parallel Data Governance layer** |
| **Build Owner** | **Total Rewards Manager (sole builder), assisted by Claude for data modeling, DAX, and documentation** |
| **Platform** | **Power BI Desktop (+ Power BI Service if licensing is available for scheduled refresh)** |
| **Data Source (Interim)** | **Manual/periodic Excel extracts from SuccessFactors (or current HRIS) — no live API integration in Phase 1–2** |
| **Excluded from Scope** | **Conversational AI / natural-language Q&A assistant (deferred)** |
| **Existing Assets** | **11 field-structure workbooks with 3 years of synthetic test data already built and validated** |

# 2. Background & Business Case

## 2.1 Current State

HR reporting today is largely descriptive, manual, and Excel-based, produced ad hoc for specific requests (e.g., CEO headcount decks, compensation benchmarking reviews) rather than through a standing, self-service analytics layer. This creates repeated manual effort for recurring questions and limits the Total Rewards function's ability to move from administrative reporting to proactive workforce cost and risk analysis.

## 2.2 Why Now

- A structured Power BI reporting requirement was already defined, covering 12 dashboards and ~600 potential KPIs across foundational HR data (headcount, recruitment, diversity, attrition, compensation, leave, absenteeism, performance, training).
- Benchmarking against a mature commercial HR analytics product revealed the original scope, while a solid foundation, omits entire domains that are now standard practice: Engagement, Internal Mobility, Workforce Planning/Simulation, and Data Governance.
- Building this in-house (rather than procuring a commercial license) is feasible because the Total Rewards Manager can use Claude for data modeling, DAX authoring, and technical documentation — removing the traditional dependency on an IT/BI development team.
## 2.3 Strategic Alignment

This initiative directly supports the Total Rewards function's stated direction: moving from policy administration and manual reporting toward workforce cost forecasting, proactive analytics, and strategic influence on business decisions. A self-built analytics suite also creates a reusable, extensible asset rather than a one-off deliverable, and builds internal Power BI / data modeling capability within the P&C team.

# 3. Objectives & Success Criteria

| **Objective** | **Success Criteria** |
| --- | --- |
| **Single source of truth for HR metrics** | **Headcount, attrition, and compensation figures in the dashboard reconcile exactly with Finance/HRIS source data at each refresh** |
| **Reduce manual reporting effort** | **Recurring requests (e.g., monthly HR pack, quarterly attrition review) are self-served from the dashboard rather than rebuilt in Excel each cycle** |
| **Extend analytical depth to match market standard** | **All 14 modules defined in this PRD are live and in use by target personas by the end of their respective phase** |
| **Enable proactive workforce cost management** | **Workforce Planning module allows scenario modeling (headcount/cost projection) before annual budget cycles, not just after-the-fact reporting** |
| **Improve trust and adoption** | **Data Governance layer (HR Dictionary, Data Quality checks) is published alongside every module; Usage Metrics show active adoption by leadership and department managers** |
| **Build without IT dependency** | **100% of development (data modeling, DAX, documentation) completed by the Total Rewards Manager with Claude assistance; no developer tickets raised to IT** |

# 4. Scope

## 4.1 In Scope

Fourteen analytical modules, delivered across three phases (see Section 9 — Roadmap), plus a Data Governance layer built in parallel with Phase 1:

### Phase 1 — Foundation (existing data, re-modeled and enriched)

- Executive Insights (HR at a Glance + Scorecard)
- Recruitment
- New Hires & Onboarding
- Diversity & Inclusion
- Compensation & Pay Equity
- Headcount & Workforce Profile
- Attrition & Retention
- Leave & Absence
- Performance
- Learning & Training
- Data Governance (built in parallel, not sequentially after Phase 1)
### Phase 2 — New Source Data Required

- Internal Mobility (promotions, demotions, lateral moves)
- Employee Engagement / Survey Analytics
### Phase 3 — Strategic / Simulation

- Workforce Planning & Simulation (headcount/cost projection, pay gap what-if, new starter quality)
- AI Impact / Role Automation Risk Assessment (optional — see Section 9.3 for a recommended reduced-scope version)
## 4.2 Out of Scope

- Conversational AI / natural-language query assistant (“ask a question, get an answer” chat layer) — explicitly deferred to a future Phase 4
- Live, real-time API integration with SuccessFactors or other HRIS — Phase 1–2 rely on manual/scheduled Excel extracts
- Any development work requiring IT/BI developer resourcing or ticket-based delivery
- Payroll processing or any transactional system functionality — this suite is reporting/analytics only

# 5. Users & Personas

| **Persona** | **Primary Modules Used** | **Needs** |
| --- | --- | --- |
| **CEO / Executive Committee** | **Executive Insights, Workforce Planning** | **High-level trend, quarter-over-quarter narrative commentary, cost projection before budget cycles** |
| **Yazan (Senior Approver)** | **Executive Insights, Compensation, Workforce Planning** | **Strategic-level views suitable for leadership discussion; approves scope and phased delivery** |
| **Total Rewards Manager (Builder & Primary User)** | **All modules** | **Full analytical depth across compensation, attrition, and workforce cost for benchmarking and forecasting work** |
| **Department Managers** | **Headcount, Attrition, Leave & Absence, Performance (departmental slices)** | **Self-service visibility into their own team's metrics without requesting custom reports** |
| **Sahana (HRIS Manager)** | **Data Governance (Data Quality, HR Dictionary)** | **Confirms field mappings and data extract structure from SuccessFactors; validates data quality** |
| **Carlin (HRIS Team)** | **Data Governance** | **Supports recurring data extract logistics and refresh scheduling** |
| **Afkar Saleem (Total Rewards)** | **Compensation, Attrition** | **Contributes to CTC forecasting, mid-year review, and management reporting validation** |

# 6. Build Approach & Constraints

## 6.1 Development Model

This suite will be built entirely by the Total Rewards Manager, without a dedicated IT/BI developer. Claude is used throughout as a development accelerator, specifically for:

- Data modeling guidance — star-schema design, fact/dimension table structure, and relationship mapping across the 13 source tables
- DAX formula authoring — measures for each module's KPI list (Section 8), following Excel-2007-era function compatibility where the model will later be validated
- Synthetic test data generation — already completed for the 11 Phase-1 tables (3 years, Jan 2023–Dec 2025) to allow dashboard-building and validation before real HRIS data is connected
- Documentation — the HR Dictionary (Data Governance module) is generated and maintained with Claude's assistance as each measure is built, not retrofitted afterward
- QA support — spot-checking DAX logic, referential integrity between tables, and reasonableness of outputs against known figures
## 6.2 Constraints

| **Constraint** | **Implication for Build Plan** |
| --- | --- |
| **No IT development resourcing** | **All Power BI data modeling, DAX, and publishing must be executable via Power BI Desktop / Power BI Pro (self-service tier); no custom connectors or backend services** |
| **No live HRIS API integration (Phase 1–2)** | **Data refresh is manual: periodic Excel/CSV export from SuccessFactors, re-imported into the Power BI model on a defined cadence (Section 7.3)** |
| **Sensitive compensation data** | **Row-level security (RLS) must be configured in Power BI before Compensation and Executive modules are shared beyond the Total Rewards Manager** |
| **Single builder** | **Phasing (Section 9) is sequenced to avoid parallel workstreams beyond one person's realistic capacity; Data Governance is the only module built continuously alongside others rather than as a discrete phase** |
| **New data not yet captured** | **Internal Mobility and Engagement (Phase 2) cannot start until source data availability is confirmed with Sahana/Carlin (Section 10 — Dependencies)** |

## 6.3 Tooling

| **Tool** | **Purpose** |
| --- | --- |
| **Power BI Desktop** | **Primary development environment for data modeling, DAX, and dashboard/report design** |
| **Power BI Service (Pro license)** | **Publishing, scheduled refresh, and role-based sharing — required once moving beyond a single-user prototype** |
| **Excel** | **Interim data staging layer for manual HRIS extracts; also hosts the Field Structure and HR Dictionary reference tabs already built for each table** |
| **Claude** | **Data modeling advisory, DAX generation, documentation, and synthetic data generation for build-and-test cycles before real data is connected** |

# 7. Solution Architecture & Data Model

## 7.1 Architecture Layers

| **Layer** | **Description** |
| --- | --- |
| **1. Source Systems** | **SuccessFactors (or current HRIS) for employee, position, compensation, and leave data; a survey platform (existing engagement survey tool, if any) for Phase 2 Engagement module** |
| **2. Data Staging (Excel)** | **Manual/periodic exports landed as structured Excel workbooks — the 11 existing files plus 2 new tables added in Phase 2 (Position History, Survey Responses)** |
| **3. Data Model (Power BI)** | **Star-schema model: Employee Master and Date table as central dimensions; all transactional tables (Compensation, Leave, Absence, Performance, Training, Recruitment, Attrition) as fact tables joined via Employee ID** |
| **4. Semantic / Measures Layer** | **DAX measures organized by module, documented in the HR Dictionary (Data Governance module) as they are built** |
| **5. Presentation Layer** | **Power BI reports/dashboards organized by the 14 modules in Section 8, navigable via a top-level menu and a “Top Questions” landing page** |
| **6. Governance Layer (cross-cutting)** | **HR Dictionary, Data Quality checks, and Usage Metrics — applies across all layers, not a separate downstream step** |

## 7.2 Core Data Tables

The following 13 tables form the complete data model. The first 11 already exist as field-verified Excel workbooks with 3 years of synthetic test data; the last 2 are new and required for Phase 2.

| **Table** | **Grain** | **Key Fields** | **Status** | **Feeds Modules** |
| --- | --- | --- | --- | --- |
| **Employee Master** | **1 row per employee** | **Employee ID (PK), demographics, employment status, grade, department** | **Existing** | **All modules (central dimension)** |
| **Organizational Hierarchy** | **1 row per employee** | **Employee ID, Manager ID, Level 1–3 Leader, CEO Hierarchy Level** | **Existing** | **Executive, Headcount, Span of Control** |
| **Headcount (roster view)** | **1 row per employee** | **Employment Status, Hire/Termination Date, Grade, Department** | **Existing** | **Headcount, Executive Insights** |
| **Recruitment** | **1 row per requisition/candidate** | **Requisition ID, Candidate ID, dates, cost, source** | **Existing** | **Recruitment, New Hires** |
| **Diversity (active roster)** | **1 row per active employee** | **Gender, Nationality, Age Band, Grade, Leadership Status** | **Existing** | **Diversity & Inclusion** |
| **Attrition** | **1 row per termination** | **Employee ID, Termination Date/Reason, Voluntary/Involuntary, Tenure** | **Existing** | **Attrition & Retention** |
| **Compensation — Base Salary** | **1 row per employee per year** | **Employee ID, Grade, Base Salary, Effective Date** | **Existing** | **Compensation & Pay Equity** |
| **Compensation — Total Rewards** | **1 row per employee per year** | **Allowances, Variable Pay, Bonus, Total Remuneration** | **Existing** | **Compensation & Pay Equity** |
| **Compensation — Salary Structure** | **1 row per grade** | **Grade, Range Min/Mid/Max** | **Existing** | **Compensation & Pay Equity (Compa-Ratio, Range Penetration)** |
| **Leave** | **1 row per leave instance** | **Employee ID, Leave Type, Start/End Date, Days, Balance** | **Existing** | **Leave & Absence** |
| **Absenteeism** | **1 row per absence instance** | **Employee ID, Absence Date, Type, Hours, Paid/Unpaid** | **Existing** | **Leave & Absence** |
| **Performance** | **1 row per employee per cycle** | **Employee ID, Cycle, Goal/Competency Score, Overall Rating** | **Existing** | **Performance** |
| **Learning & Training** | **1 row per training record** | **Employee ID, Course, Category, Hours, Cost, Completion** | **Existing** | **Learning & Training** |
| **Position / Job History (NEW)** | **1 row per job change event** | **Employee ID, Change Date, Old/New Position, Old/New Grade, Change Type (Promotion/Demotion/Lateral)** | **New — Phase 2** | **Internal Mobility** |
| **Survey Responses (NEW)** | **1 row per employee per survey per question** | **Employee ID, Survey Cycle, Question ID, Response Score/Text** | **New — Phase 2** | **Employee Engagement / Survey Analytics** |

## 7.3 Refresh Cadence (Interim, Manual)

| **Table** | **Recommended Refresh Frequency** |
| --- | --- |
| **Employee Master, Organizational Hierarchy, Headcount** | **Monthly (aligned to payroll cut-off)** |
| **Compensation (all 3 tables)** | **Monthly, or on any off-cycle salary change** |
| **Recruitment, Attrition** | **Monthly** |
| **Leave, Absenteeism** | **Monthly** |
| **Performance** | **Per performance cycle (typically bi-annual)** |
| **Learning & Training** | **Monthly or quarterly, depending on LMS export availability** |
| **Position/Job History, Survey Responses (Phase 2)** | **Position History: monthly. Survey Responses: per survey wave (typically annual or bi-annual)** |

*Note: This cadence is interim, pending IT/HRIS discussion on automated extract scheduling. It is not a hard system constraint — it reflects the realistic manual effort achievable without developer support.*

# 8. Functional Requirements by Module

Each module below specifies its purpose, source table(s), key metrics, core visuals, and standard filters. Full field-level detail already exists in the companion Field Structure workbooks for the 11 existing tables; this section focuses on metrics and dashboard layout, which is the new design work for this PRD.

## 8.1 Executive Insights

**Phase: Phase 1**

A single landing view giving leadership (CEO, Yazan, Total Rewards) an at-a-glance summary across the full employee lifecycle, plus a quarter-over-quarter scorecard with automated narrative commentary.

### Data Sources

- Employee Master
- Headcount
- Recruitment
- Diversity
- Leave
- Absenteeism
- Attrition
- Compensation
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Headcount / FTE** | **Active employee count and full-time-equivalent, with month-over-month trend** |
| **% Female Leaders** | **Female employees in Managerial/Executive levels ÷ total leaders** |
| **Hires (MoM)** | **New hires in period vs. prior period** |
| **Leave Taken / Absenteeism Rate** | **Total leave days taken; absence hours ÷ scheduled hours** |
| **Attrition Rate (Overall / Voluntary / Involuntary)** | **Terminations ÷ average headcount, split by type** |
| **Annual Leave Liability** | **Financial exposure from unused leave balances** |

### Core Visuals / Layout

- “HR at a Glance” page: 5 category rows (Employees, Diversity, Hiring, Leave, Terminations), each with a trend sparkline and 3–4 breakdown visuals
- “Scorecard” page: quarter-over-quarter comparison cards (this quarter vs. last quarter vs. same quarter last year) with auto-generated narrative variance text below each card
- “Top Questions” landing page mapping common leadership questions (e.g., “Do we have enough agility in hiring?”) directly to the relevant underlying report page
### Standard Filters

Year  •  Month/Quarter  •  Business Unit

## 8.2 Recruitment

**Phase: Phase 1**

Tracks the full requisition-to-hire funnel, cost, and source effectiveness, split clearly between Time to Offer and Time to Hire.

### Data Sources

- Recruitment
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Time to Offer** | **Days from requisition open to offer extended** |
| **Time to Hire** | **Days from interview to joining date** |
| **Offer Acceptance Rate** | **Offers accepted ÷ offers extended** |
| **Recruitment Cost** | **Total cost to fill, by period/department** |
| **Source Effectiveness** | **Hires by Source of Hire (Referral, LinkedIn, Agency, Career Site, etc.)** |

### Core Visuals / Layout

- Time to Offer / Time to Hire summary cards (average, min, max) with trend line, current year vs. prior year
- Breakdowns by Job Level, Source, Experience Band, Gender, and Location
- Recruitment Status page: open vs. filled requisitions
### Standard Filters

Date Range  •  Department  •  Job Grade

## 8.3 New Hires & Onboarding

**Phase: Phase 1**

A dedicated view of new starters and early-tenure distribution, separate from the recruitment funnel — focused on who joined and how they are distributed across the organization in their first 6–12 months.

### Data Sources

- Recruitment (Joining Date)
- Employee Master (Hire Date)
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **New Starters** | **Count of employees hired in period** |
| **New Starters by Gender / Job Level** | **Distribution of new hires across key dimensions** |
| **New Starter Retention (0–6mo / 6–12mo)** | **Share of new starters still active at each tenure milestone** |

### Core Visuals / Layout

- New Starters trend by month
- “4-box” distribution matrices (e.g., Manager vs. Non-Manager × tenure band; Referral vs. Non-Referral × tenure band) with narrative interpretation text, mirroring the benchmark's Hires 4-Box pattern
### Standard Filters

Year  •  Month  •  Business Unit

## 8.4 Diversity & Inclusion

**Phase: Phase 1**

Reports current workforce composition and movement across gender, nationality, age, and leadership representation.

### Data Sources

- Diversity (active roster)
- Employee Master
- Attrition (for flow)
- Recruitment (for flow)
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Female Ratio** | **Female employees ÷ total active employees** |
| **Women in Leadership** | **Female employees in Managerial/Executive ÷ total leaders** |
| **Nationality Mix** | **Active headcount by nationality** |
| **Age Distribution** | **Active headcount by age band** |
| **Diversity by Grade** | **Gender/nationality split by job grade** |
| **Workforce Flow** | **Net movement in/out of the workforce by demographic segment over a period** |

### Core Visuals / Layout

- Diversity Analysis and Demographic Analysis pages with standard breakdown visuals
- Organisation Level view (headcount by Staff/Supervisory/Managerial/Executive)
- Workforce Flow visual showing hires-in vs. exits-out by gender/nationality/grade
### Standard Filters

Year  •  Month  •  Business Unit  •  Grade

## 8.5 Compensation & Pay Equity

**Phase: Phase 1**

Covers base pay, total rewards, and internal pay equity, including gender pay gap analysis by business unit and organizational level.

### Data Sources

- Compensation — Base Salary
- Compensation — Total Rewards
- Compensation — Salary Structure
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **CTC by Grade** | **Average total cash compensation by grade** |
| **Salary Distribution** | **Histogram of base salary across the workforce** |
| **Compa-Ratio** | **Base Salary ÷ Salary Midpoint, by employee/grade** |
| **Range Penetration** | **Position within the grade's salary band** |
| **Gender Pay Gap Index** | **Average pay gap between genders, expressed as an index** |
| **Pay Gap by Business Unit / Org Level** | **Gender pay gap segmented by department and job level** |
| **Compensation Cost** | **Total remuneration cost by period/department** |

### Core Visuals / Layout

- Salary Analysis pages (Average and Total views)
- Pay Gap Index and Pay Gap Amount pages, by Business Unit and Org Level
- Cost Distribution page: salary cost by business unit shown as a sequential flow (mirrors the benchmark's 4-box cost distribution cards)
### Standard Filters

Year  •  Month  •  Location  •  Organisation Level  •  Business Unit

## 8.6 Headcount & Workforce Profile

**Phase: Phase 1**

Foundational workforce reporting — headcount trend, organizational structure, and span of control — underpinning nearly every other module.

### Data Sources

- Headcount (roster view)
- Employee Master
- Organizational Hierarchy
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Headcount** | **Active employee count as of period-end** |
| **Headcount vs. FTE** | **Headcount compared to full-time-equivalent, highlighting part-time/contract mix** |
| **New Hires / Exits / Headcount Movement** | **Opening headcount + hires − exits = closing headcount** |
| **Average Age / Average Tenure** | **Mean age and length of service across active employees** |
| **Span of Control** | **Average number of direct reports per manager** |

### Core Visuals / Layout

- Headcount trend by month/quarter/year, with contract type and organization level breakdowns
- Span of Control page by department and management level
- Departmental Dashboards — a filtered view per department for manager self-service
### Standard Filters

Year  •  Month  •  Business Unit  •  Department  •  Grade

## 8.7 Attrition & Retention

**Phase: Phase 1**

Analyzes voluntary and involuntary turnover, termination reasons, and retention risk across department, manager, and grade.

### Data Sources

- Attrition
- Employee Master
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Overall / Voluntary / Involuntary Attrition Rate** | **Terminations ÷ average headcount, by type** |
| **Attrition by Department / Manager / Grade** | **Attrition rate segmented across key organizational dimensions** |
| **First-Year Attrition (Rolling 12 Months)** | **Share of employees terminated within their first 12 months of service** |
| **Termination Profile** | **Breakdown of terminations by reason, tenure band, and demographic** |

### Core Visuals / Layout

- Termination Profile and Termination Analysis pages
- Attrition Analysis page with department/manager/grade breakdowns
- Voluntary Attrition page isolating controllable turnover
### Standard Filters

Year  •  Month  •  Department  •  Grade  •  Tenure Band

*Note: The benchmark product includes an ML-based Attrition Prediction model (risk-tiering with correlation-factor analysis). This is deliberately excluded from Phase 1–3 scope in this PRD — it requires a predictive modeling capability beyond standard Power BI/DAX reporting and should be assessed separately once the core Attrition module is live and data quality is proven.*

## 8.8 Leave & Absence

**Phase: Phase 1**

Combines leave utilization/liability and absenteeism into one integrated module, reflecting how these are used together operationally.

### Data Sources

- Leave
- Absenteeism
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Leave Utilization** | **Leave days taken ÷ leave entitlement** |
| **Leave Liability** | **Financial exposure from unused leave balances (balance × daily rate)** |
| **Annual Leave Balance** | **Average remaining annual leave balance** |
| **Absence Rate** | **Absence hours ÷ scheduled working hours** |
| **Lost Workdays / Unplanned Absence / Sick Leave Rate** | **Absence volume by type, converted to workday equivalents** |

### Core Visuals / Layout

- Leave Taken, Leave Balance, and Leave Liability pages with current-year vs. prior-year comparison
- Absenteeism page by type (Sick, Unplanned, Late, Other), business unit, and age band
- Booked Leaves (forward-looking leave calendar) and Availability (who is currently on leave) views
### Standard Filters

Year  •  Month  •  Business Unit

## 8.9 Performance

**Phase: Phase 1**

Reports performance rating distribution and identifies high/low performers, extended with a 9-box performance/potential grid for succession input.

### Data Sources

- Performance
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Rating Distribution / Bell Curve** | **Count of employees by overall rating, compared to an expected distribution** |
| **High Performers / Low Performers** | **Count of employees in top/bottom rating bands** |
| **Performance by Department** | **Average rating by department** |
| **9-Box Placement** | **Employee count by performance × potential quadrant (requires a Potential rating input alongside existing Overall Rating)** |

### Core Visuals / Layout

- Performance Rating page (distribution, bell curve, by department)
- 9-Box Performance Grid — new visual requiring a Potential dimension; if Potential is not currently captured, this should be flagged to Sahana as a data-capture gap before Phase 1 sign-off
### Standard Filters

Performance Cycle  •  Department  •  Grade

## 8.10 Learning & Training

**Phase: Phase 1**

Tracks training investment, completion, and compliance across the workforce.

### Data Sources

- Learning & Training
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Training Hours per Employee** | **Total training hours ÷ headcount** |
| **Training Cost** | **Total training spend by period/department/location** |
| **Completion Rate** | **Completed ÷ enrolled** |
| **Mandatory Training Compliance** | **Completed mandatory courses ÷ assigned mandatory courses** |
| **Cost per Person / Cost per Hour** | **Training cost efficiency metrics** |

### Core Visuals / Layout

- Training Analysis page (by category, status, age/tenure band)
- Training Insights page: cost by location and business unit, actual spend vs. budget
### Standard Filters

Date Range  •  Business Unit  •  Training Category

## 8.11 Data Governance (Parallel Track — Not Sequential)

**Phase: Built continuously alongside Phase 1 (see Section 6.2)**

Underpins trust in every other module. Rather than a dashboard consumed by end users, this is primarily a build-quality and maintenance discipline, with a small set of pages for the Total Rewards Manager and HRIS team to monitor data health.

### Components

| **Component** | **Description** |
| --- | --- |
| **HR Dictionary** | **A live, browsable inventory of every table, column, relationship, and measure in the model, including the DAX expression behind each measure and a plain-language description. Built incrementally as each measure is created — not retrofitted at the end.** |
| **Data Quality** | **Checks for completeness and consistency (e.g., missing Employee IDs, orphaned foreign keys, out-of-range dates) surfaced as a simple scorecard per table** |
| **Data Validation** | **Rules confirming referential integrity across tables (e.g., every Compensation record has a matching Employee Master record) — run at each data refresh** |
| **Usage Metrics** | **Basic tracking of which reports are opened and by whom, to confirm adoption and prioritize future enhancement effort** |

# 8. Functional Requirements by Module (continued) — Phase 2 & 3

## 8.12 Internal Mobility

**Phase: Phase 2 — New Source Data Required**

Tracks how talent moves through the organization — promotions, demotions, and lateral moves — as a health indicator distinct from attrition. Requires the new Position/Job History table (Section 7.2).

### Data Sources

- Position / Job History (NEW)
- Employee Master
- Organizational Hierarchy
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Promoted / Demoted Employee %** | **Promotions or demotions ÷ average headcount, in period** |
| **Avg Promotion Tenure** | **Average time spent in a role before advancing** |
| **Internal Mobility Rate** | **Total internal moves (promotion + demotion + lateral) ÷ headcount** |
| **Mobility by Business Unit / Job Level** | **Promotion and demotion counts segmented by department and level** |

### Core Visuals / Layout

- Internal Mobility Analysis page: hires vs. internal mobility by job level, average tenure by level and promotion/demotion status
- Internal Mobility Insights page: trend by year/quarter/month, promotion and demotion movement tables (e.g., Operator → Individual Contributor, with headcount and average tenure)
### Standard Filters

Year  •  Business Unit  •  Job Level

*Dependency: This module cannot begin until Sahana/Carlin confirm that SuccessFactors position-change history can be exported in a usable format (ideally one row per job-change event with old/new position, grade, and effective date). Flag this as an early Phase 2 discussion item, not a build-time assumption.*

## 8.13 Employee Engagement / Survey Analytics

**Phase: Phase 2 — New Source Data Required**

Analyzes employee survey results to correlate engagement with performance, retention, and leadership effectiveness. Requires the new Survey Responses table (Section 7.2) and an existing survey data source.

### Data Sources

- Survey Responses (NEW)
- Employee Master (for demographic cuts)
- Attrition (for correlation)
- Performance (for correlation)
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Engagement Score by Question / Category** | **Average response score per survey question or theme** |
| **Leadership Index** | **Aggregated score on leadership-related survey questions** |
| **Engagement vs. Attrition Correlation** | **Relationship between engagement scores and subsequent voluntary exits** |
| **Response Rate** | **Survey responses received ÷ employees invited** |

### Core Visuals / Layout

- Analysis by Question and Analysis by Parameters pages
- Correlation Analysis page linking engagement scores to attrition and performance outcomes
- Survey Insights page with narrative summary of key findings per cycle
### Standard Filters

Survey Cycle  •  Business Unit  •  Job Level

*Dependency: Requires confirmation of which survey platform (if any) Baladna currently uses, and whether raw response-level export is available. If no survey tool exists today, this module is blocked until a survey process is established — flag this to Yazan as a prerequisite decision, not a Power BI build task.*

## 8.14 Workforce Planning & Simulation

**Phase: Phase 3 — Strategic / Simulation**

Moves from descriptive reporting to forward-looking scenario modeling: headcount and cost projections, pay gap what-if analysis, and early-attrition quality tracking for new starters. This is the highest-value module for Total Rewards but also the most technically demanding — it requires user-adjustable assumption inputs (via Power BI “what-if” parameters), not just historical aggregation.

### Data Sources

- Employee Master
- Compensation (all 3 tables)
- Attrition
- Recruitment
### Key Metrics

| **Metric** | **Definition** |
| --- | --- |
| **Headcount Projection** | **Predicted headcount 1–4 years forward, driven by user-adjustable hiring and termination growth-rate assumptions** |
| **Job Level / Business Unit Cost Projection** | **Projected annual compensation cost by job level or business unit under adjustable headcount-change assumptions** |
| **Pay Gap What-If** | **Simulated cost of remediation for closing the gender pay gap under different scenarios** |
| **New Starters Quality** | **Early exit rate within 3/6/9/12 months of hire, segmented by business unit, job level, gender, and location — a leading indicator of onboarding effectiveness** |

### Core Visuals / Layout

- Job Level Cost Projection and Business Unit Cost Projection pages, with adjustable sliders for hiring/termination rate assumptions by level or unit, showing projected headcount and cost impact
- Headcount Projection page: current status card, 4-year forward projection with adjustable growth-rate inputs per year, trend chart of historical + predicted headcount
- New Starters Quality page: retention/early-exit funnel (Hires → Early Exits at <3mo/3–6mo/6–9mo/9–12mo), broken down by business unit, location, job level, and gender, with an adjustable early-termination-rate slider to model predicted headcount impact
- Pay Gap Scenarios page: side-by-side comparison of pay gap index and remediation cost across defined scenarios (New Hire Gap, Professional Gap, Combined Gap, Non-Exec Gap)
### Standard Filters

Year  •  Business Unit  •  Job Level

### 8.14.1 AI Impact / Role Automation Risk Assessment (Optional, Reduced Scope Recommended)

The benchmark product includes a report assessing role-by-role automation/AI displacement risk through 2028, scored per job family and activity. Building this at full fidelity requires an external task-level automation-risk dataset and a scoring methodology that goes beyond standard HR reporting.

**Recommendation: If this is retained in Phase 3, scope it down to a lightweight version:**

- Maintain a simple, manually-curated lookup table mapping Job Family → a qualitative AI Impact tier (No Change / AI-Assisted / Partial Automation / Scope Shift / Role Evolution) based on your own HR/business judgment, reviewed annually
- Report headcount and cost exposure by AI Impact tier, rather than attempting a predictive model
- Treat this as directional workforce-planning input for Yazan/CEO discussions, not a precision forecast

# 9. Non-Functional Requirements

## 9.1 Security & Data Privacy

- Row-Level Security (RLS) must be applied in Power BI before Compensation and Executive Insights modules are shared beyond the Total Rewards Manager — department managers should see only their own team's compensation data, if compensation visibility is extended to them at all
- Employee-level PII (name, date of birth, nationality) should be restricted to modules where it is operationally necessary; aggregate views should be the default for any audience beyond Total Rewards/HR
- Data handling should align with Qatar's Personal Data Privacy Protection Law (PDPPL) and any equivalent Egyptian data protection requirements, given the multi-entity scope
## 9.2 Performance

- With the current data volumes (roughly 1,500 employee records and up to ~12,000 transactional rows in the largest tables), Power BI Desktop performance should remain acceptable without requiring aggregation tables or incremental refresh in Phase 1–2
- If Phase 2–3 data volumes grow materially (e.g., multi-year survey response data at question-level grain), revisit whether a composite/aggregated model is needed to maintain report responsiveness
## 9.3 Usability & Adoption

- Navigation should follow the benchmark's proven pattern: a top-level module menu plus a “Top Questions” landing page mapping plain-language business questions directly to the relevant report
- Each module should default to the most recent complete period on open, with clear, consistent filter placement (Year/Month/Business Unit as the common set) across all modules
## 9.4 Maintainability

- Every DAX measure must be documented in the HR Dictionary at the time it is built (Section 8.11) — this is a hard requirement, not best-effort, given the single-builder model with no handover documentation otherwise
- Version control: maintain dated copies of the .pbix file at each major milestone (end of each phase, at minimum) given the absence of a formal source-control /IT release process
## 9.5 Data Quality

- Referential integrity checks (Section 8.11) should run at every data refresh, not only at initial build, since manual Excel-based extracts are more error-prone than a live system integration
- Any data quality failure should be visible on the Data Quality scorecard before the refreshed model is published/shared — the Total Rewards Manager should treat this as a go/no-go gate for publishing an updated refresh

# 10. Roadmap & Phasing

Phasing is sequenced for a single builder, with Data Governance built continuously rather than as a discrete phase. Indicative durations assume part-time build effort alongside the Total Rewards Manager's regular role — adjust based on actual availability.

| **Phase** | **Modules** | **Prerequisite** | **Indicative Duration** |
| --- | --- | --- | --- |
| **Phase 1** | **Executive Insights, Recruitment, New Hires & Onboarding, Diversity & Inclusion, Compensation & Pay Equity, Headcount & Workforce Profile, Attrition & Retention, Leave & Absence, Performance, Learning & Training + Data Governance (parallel)** | **11 source tables already exist; synthetic test data already generated for build-and-validate cycles** | **8–12 weeks part-time** |
| **Phase 2** | **Internal Mobility, Employee Engagement / Survey Analytics** | **Confirm Position/Job History export feasibility with Sahana/Carlin; confirm survey data source with Yazan** | **6–8 weeks part-time, after data availability confirmed** |
| **Phase 3** | **Workforce Planning & Simulation (incl. reduced-scope AI Impact)** | **Phase 1 Compensation and Attrition modules live and validated (simulation logic builds on top of historical actuals)** | **6–10 weeks part-time** |
| **Phase 4 (Future, Out of Scope for this PRD)** | **Conversational AI / natural-language Q&A assistant** | **Phases 1–3 complete; likely requires Power BI Copilot licensing or a custom LLM integration — revisit scoping at that time** | **Not estimated** |

# 11. Assumptions & Dependencies

## 11.1 Assumptions

- The Total Rewards Manager has (or will obtain) a Power BI Pro license sufficient for self-service publishing and sharing within People & Culture and to leadership
- SuccessFactors (or the current HRIS) can produce the Phase 1 field set via manual export in a consistent, repeatable format — this has already been validated conceptually through the 11 existing field-structure workbooks
- Claude will continue to be available as a development aid for DAX authoring, data modeling advice, and documentation throughout all phases
- Real HRIS data will replace the synthetic test data used for Phase 1 build-and-validation once the model structure is confirmed and stable
## 11.2 Dependencies

| **Dependency** | **Owner** | **Needed By** |
| --- | --- | --- |
| **Confirm SuccessFactors export fields match the 11 Field Structure workbooks; agree extract cadence** | **Sahana / Carlin** | **Before Phase 1 data connection (build can proceed on synthetic data in the meantime)** |
| **Confirm whether “Potential” rating is captured for the 9-Box Performance Grid; if not, agree a capture method** | **Sahana / Total Rewards Manager** | **Before Phase 1 Performance module sign-off** |
| **Confirm Position/Job History export feasibility and format** | **Sahana / Carlin** | **Before Phase 2 start** |
| **Confirm existence and export feasibility of an engagement survey data source** | **Yazan / Total Rewards Manager** | **Before Phase 2 start** |
| **Approve Row-Level Security approach for Compensation/Executive data before any sharing beyond the Total Rewards Manager** | **Yazan** | **Before Phase 1 is shared with any second user** |
| **Confirm Power BI licensing tier available for publishing/scheduled refresh** | **Total Rewards Manager / Finance-IT procurement (license only, not development)** | **Before Phase 1 publishing to Power BI Service** |

# 12. Risks & Mitigations

| **Risk** | **Impact** | **Mitigation** |
| --- | --- | --- |
| **Single-builder bottleneck — all development depends on one person's availability** | **High — delays cascade across all phases** | **Keep the HR Dictionary and DAX documentation current throughout, so work could be picked up by another P&C team member or a future IT resource if needed** |
| **Manual data refresh introduces errors or inconsistent extracts over time** | **Medium—High — undermines trust in the numbers** | **Data Governance checks (Section 8.11) run at every refresh as a hard gate before publishing** |
| **Scope expands again mid-build (as it already did once, from 12 to 14 modules)** | **Medium — risk of never “shipping” Phase 1** | **Freeze Phase 1 scope at this PRD's definition; route any further additions to Phase 2/3/4 backlog rather than re-opening Phase 1** |
| **Phase 2 data (Position History, Survey Responses) is not available in the format assumed** | **Medium — could block Phase 2 entirely** | **Confirm feasibility with Sahana/Carlin and Yazan before Phase 2 kickoff (Section 11.2); do not begin Phase 2 build until confirmed** |
| **Sensitive compensation and PII data shared without adequate access control** | **High — compliance and trust risk** | **Row-Level Security implemented and tested before any sharing beyond the Total Rewards Manager (Section 9.1)** |
| **Workforce Planning simulations are misinterpreted as guaranteed forecasts rather than assumption-driven scenarios** | **Medium — could mislead leadership decisions** | **Every projection page clearly labels input assumptions and their source; Data Governance documentation includes the simulation logic, not just historical measures** |

# 13. Future Phase: Conversational AI (Explicitly Out of Scope)

The benchmark product includes an embedded conversational AI assistant that answers natural-language questions (e.g., “What is our attrition rate for high performers in the last 6 months?”) with narrative answers and recommended next steps. This is explicitly excluded from the current PRD and all three phases defined above.

**Rationale for deferral:**

- It depends on the underlying data model and measures being complete and trustworthy first — an AI layer built on an unfinished or undocumented model will produce unreliable answers
- It likely requires either Power BI Copilot licensing or a custom integration effort beyond standard self-service Power BI development
- It is reasonable to revisit as a Phase 4 once Phases 1–3 are live, adopted, and the Data Governance layer (HR Dictionary in particular) is mature enough to ground reliable AI responses

# 14. Appendix

## 14.1 Referenced Companion Files

Full field-level detail (field name, data type, description, and per-field metrics reference) for all 11 Phase-1 source tables already exists in the following companion workbooks, each with 3 years (Jan 2023–Dec 2025) of synthetic test data for build-and-validation purposes:

- 01_Employee_Master.xlsx
- 02_Organizational_Hierarchy.xlsx
- 03_Headcount_Dashboard.xlsx
- 04_Recruitment_Dashboard.xlsx
- 05_Diversity_Dashboard.xlsx
- 06_Attrition_Dashboard.xlsx
- 07_Compensation_Dashboard.xlsx (Base Salary, Total Rewards, Salary Structure)
- 08_Leave_Dashboard.xlsx
- 09_Absenteeism_Dashboard.xlsx
- 10_Performance_Dashboard.xlsx
- 11_Learning_Training_Dashboard.xlsx
Two new companion workbooks (Position/Job History, Survey Responses) should be built in the same format ahead of Phase 2, once source data availability is confirmed (Section 11.2).

## 14.2 Glossary

| **Term** | **Definition** |
| --- | --- |
| **Compa-Ratio** | **An employee's base salary divided by the midpoint of their grade's salary range; 1.0 = exactly at midpoint** |
| **Range Penetration** | **An employee's position within their grade's salary band, expressed as a percentage from minimum to maximum** |
| **RLS (Row-Level Security)** | **A Power BI feature restricting which rows of data a given user can see, based on their identity or role** |
| **9-Box Grid** | **A talent management matrix plotting performance against potential, used for succession and development planning** |
| **DAX** | **Data Analysis Expressions — the formula language used in Power BI to build measures and calculated columns** |
| **Grain** | **The level of detail represented by one row in a table (e.g., “1 row per employee per year”)** |
