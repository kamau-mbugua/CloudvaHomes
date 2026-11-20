-- KodiHub is now KodiHQ: bring the wording saved in platform settings along, so nobody keeps
-- seeing the old name. "emailTemplates" holds the edited e-mail templates, the landing page
-- content and the invoice and receipt instructions; the sender name and the two app notices are
-- plain text. Only the name as it is written, KodiHub, changes: web and e-mail addresses on
-- kodihub.co.ke are lowercase and stay as they are.
UPDATE "platform_settings"
   SET "emailTemplates" = replace("emailTemplates"::text, 'KodiHub', 'KodiHQ')::jsonb,
       "smtpFromName" = replace("smtpFromName", 'KodiHub', 'KodiHQ'),
       "appUpdateMessage" = replace("appUpdateMessage", 'KodiHub', 'KodiHQ'),
       "maintenanceMessage" = replace("maintenanceMessage", 'KodiHub', 'KodiHQ')
 WHERE "emailTemplates"::text LIKE '%KodiHub%'
    OR "smtpFromName" LIKE '%KodiHub%'
    OR "appUpdateMessage" LIKE '%KodiHub%'
    OR "maintenanceMessage" LIKE '%KodiHub%';
