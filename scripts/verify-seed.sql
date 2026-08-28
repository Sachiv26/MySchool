-- Verification queries for MySchool Connect seed data.
-- Run with: psql -h 127.0.0.1 -U myschool -d myschool -f scripts/verify-seed.sql

SELECT 'schools' AS entity, count(*) FROM "School"
UNION ALL SELECT 'grades', count(*) FROM "Grade"
UNION ALL SELECT 'classes', count(*) FROM "Class"
UNION ALL SELECT 'users', count(*) FROM "User"
UNION ALL SELECT 'memberships', count(*) FROM "SchoolMembership"
UNION ALL SELECT 'parents', count(*) FROM "ParentProfile"
UNION ALL SELECT 'children', count(*) FROM "Child"
UNION ALL SELECT 'parent_child_links', count(*) FROM "ParentChild"
UNION ALL SELECT 'message_types', count(*) FROM "MessageTypeOption"
UNION ALL SELECT 'reminder_rules', count(*) FROM "ReminderRule"
UNION ALL SELECT 'feature_flags', count(*) FROM "FeatureFlag"
UNION ALL SELECT 'messages', count(*) FROM "Message"
UNION ALL SELECT 'events', count(*) FROM "SchoolEvent";

SELECT '--- users ---' AS section;
SELECT email FROM "User" ORDER BY email;

SELECT '--- grades ---' AS section;
SELECT name FROM "Grade" ORDER BY name;

SELECT '--- children ---' AS section;
SELECT "firstName" || ' ' || surname AS child FROM "Child" ORDER BY "firstName";


SELECT '--- memberships ---' AS section;
SELECT u.email, m.role, s.name AS school
FROM "User" u
LEFT JOIN "SchoolMembership" m ON m."userId" = u.id
LEFT JOIN "School" s ON s.id = m."schoolId"
ORDER BY u.email;
