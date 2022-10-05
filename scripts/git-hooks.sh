#!/bin/bash

basedir=$PWD
mkdir -p .git/hooks
rm -f .git/hooks/*
chmod u+x ./hooks/*

for f in $(ls ./hooks); do
  ln -s ../../hooks/$f $basedir/.git/hooks/$f
done