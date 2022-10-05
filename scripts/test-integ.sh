echo Running integration tests

if [ -n "$LOCAL" ]; then
  export COMPOSE_PROJECT_NAME=nodejs-commons-test-integ
  docker compose up -d

  echo "Waiting...";
  sleep 10
fi

NODE_ENV=test-integ jest $@ --passWithNoTests --config ./jest.config.js

if [ -n "$LOCAL" ]; then
  docker compose down
fi