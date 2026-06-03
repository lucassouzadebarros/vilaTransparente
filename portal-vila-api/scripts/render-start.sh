#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  case "$DATABASE_URL" in
    postgres://*|postgresql://*)
      raw="${DATABASE_URL#postgres://}"
      raw="${raw#postgresql://}"
      credentials="${raw%%@*}"
      host_and_database="${raw#*@}"
      db_user="${credentials%%:*}"
      db_password="${credentials#*:}"
      db_host_port="${host_and_database%%/*}"
      db_name="${host_and_database#*/}"

      export DATABASE_URL="jdbc:postgresql://${db_host_port}/${db_name}"
      export DATABASE_USERNAME="${DATABASE_USERNAME:-$db_user}"
      export DATABASE_PASSWORD="${DATABASE_PASSWORD:-$db_password}"
      ;;
  esac
fi

exec java -jar /app/app.jar
