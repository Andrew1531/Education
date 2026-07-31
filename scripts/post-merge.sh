#!/bin/bash
set -e

# Install / sync all workspace dependencies after a task merge
pnpm install --frozen-lockfile=false
