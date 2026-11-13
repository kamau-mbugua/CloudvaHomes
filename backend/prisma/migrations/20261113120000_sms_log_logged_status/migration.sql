-- A message the server only wrote to its log because no SMS provider was set up: never sent.
-- (Its own migration: Postgres can't use a new enum value in the transaction that adds it.)
ALTER TYPE "SmsLogStatus" ADD VALUE 'LOGGED';
