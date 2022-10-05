#!/bin/bash

if [ -n "$(git status --porcelain)" ]; then
  git add .
  git commit -m 'build(release): build libs for release [skip-ci]'
  git push
else
  echo "Nothing to commit after build"
fi