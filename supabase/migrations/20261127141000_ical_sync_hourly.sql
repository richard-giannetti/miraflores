-- Hourly is enough for two villas (the owners asked for less frequent checks); "Sync now" covers the rest.
select cron.alter_job((select jobid from cron.job where jobname = 'airbnb-ical-sync'), schedule := '7 * * * *');
