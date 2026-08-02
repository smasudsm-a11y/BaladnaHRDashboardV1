select 'employee_master' as table_name, count(*) as row_count from employee_master
union all select 'org_hierarchy', count(*) from org_hierarchy
union all select 'salary_structure', count(*) from salary_structure
union all select 'recruitment', count(*) from recruitment
union all select 'diversity', count(*) from diversity
union all select 'attrition', count(*) from attrition
union all select 'base_salary', count(*) from base_salary
union all select 'total_rewards', count(*) from total_rewards
union all select 'leave', count(*) from leave
union all select 'absenteeism', count(*) from absenteeism
union all select 'performance', count(*) from performance
union all select 'training', count(*) from training
order by table_name;
